import { query, getClient } from '../db/postgres.js';
import * as redisService from './redis.js';
import * as saleService from './sale.js';
import { config } from '../config/index.js';

// Purchase result types
export const PurchaseResult = {
  SUCCESS: 'SUCCESS',
  ALREADY_PURCHASED: 'ALREADY_PURCHASED',
  SOLD_OUT: 'SOLD_OUT',
  SALE_NOT_ACTIVE: 'SALE_NOT_ACTIVE',
  SALE_NOT_FOUND: 'SALE_NOT_FOUND',
  ERROR: 'ERROR',
};

/**
 * Check if user has already purchased - checks Redis first, then DB
 */
export async function hasUserPurchased(saleId, userId) {
  // Fast check in Redis
  try {
    const redisPurchased = await redisService.hasUserPurchased(saleId, userId);
    if (redisPurchased) {
      return true;
    }
  } catch (error) {
    console.warn('Redis check failed, falling back to DB:', error.message);
  }
  
  // DB check (source of truth)
  const result = await query(
    'SELECT id FROM orders WHERE sale_id = $1 AND user_id = $2 AND status = $3 LIMIT 1',
    [saleId, userId, 'SUCCESS']
  );
  
  return result.rows.length > 0;
}

/**
 * Get user's purchase for a sale
 */
export async function getUserPurchase(saleId, userId) {
  const result = await query(
    `SELECT id, user_id, sale_id, status, created_at 
     FROM orders 
     WHERE sale_id = $1 AND user_id = $2 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [saleId, userId]
  );
  
  return result.rows[0] || null;
}

/**
 * Create order in database
 */
async function createOrder(client, saleId, userId, status = 'SUCCESS') {
  const result = await client.query(
    `INSERT INTO orders (sale_id, user_id, status)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, sale_id, status, created_at`,
    [saleId, userId, status]
  );
  return result.rows[0];
}

/**
 * MAIN PURCHASE LOGIC - Handles high concurrency
 * 
 * Flow:
 * 1. Validate sale is active
 * 2. Check if user already purchased (Redis fast check)
 * 3. Atomic stock decrement in Redis
 * 4. Mark user as purchased in Redis
 * 5. Save order to DB
 * 6. Rollback Redis if DB fails
 */
export async function processPurchase(userId, saleId = config.sale.defaultSaleId) {
  const startTime = Date.now();
  let stockDecremented = false;
  let userMarked = false;
  
  try {
    // Step 1: Get sale and validate it's active
    const sale = await saleService.getSaleById(saleId);
    
    if (!sale) {
      return {
        result: PurchaseResult.SALE_NOT_FOUND,
        message: 'Flash sale not found',
      };
    }
    
    if (!saleService.isSaleActive(sale)) {
      const status = saleService.getSaleStatus(sale);
      return {
        result: PurchaseResult.SALE_NOT_ACTIVE,
        message: status === 'UPCOMING' 
          ? 'Flash sale has not started yet' 
          : 'Flash sale has ended',
        saleStatus: status,
      };
    }
    
    // Step 2: Fast rejection - check if user already purchased (Redis)
    const alreadyPurchased = await hasUserPurchased(saleId, userId);
    if (alreadyPurchased) {
      return {
        result: PurchaseResult.ALREADY_PURCHASED,
        message: 'You have already purchased in this sale',
      };
    }
    
    // Step 3: Atomic stock decrement in Redis
    // This is the CRITICAL operation for preventing overselling
    const newStock = await redisService.decrementStock(saleId);
    stockDecremented = true;
    
    // If stock went negative, rollback and reject
    if (newStock < 0) {
      await redisService.incrementStock(saleId);
      stockDecremented = false;
      return {
        result: PurchaseResult.SOLD_OUT,
        message: 'Sorry, this item is sold out',
      };
    }
    
    // Step 4: Mark user as purchased in Redis (before DB to prevent race)
    await redisService.markUserPurchased(saleId, userId);
    userMarked = true;
    
    // Step 5: Save order to database
    const dbClient = await getClient();
    try {
      await dbClient.query('BEGIN');
      
      const order = await createOrder(dbClient, saleId, userId, 'SUCCESS');
      
      await dbClient.query('COMMIT');
      
      const duration = Date.now() - startTime;
      console.log(`Purchase SUCCESS: userId=${userId}, saleId=${saleId}, orderId=${order.id}, duration=${duration}ms`);
      
      return {
        result: PurchaseResult.SUCCESS,
        message: 'Purchase successful!',
        order: {
          id: order.id,
          userId: order.user_id,
          saleId: order.sale_id,
          createdAt: order.created_at,
        },
        remainingStock: newStock,
      };
      
    } catch (dbError) {
      await dbClient.query('ROLLBACK');
      
      // Check if it's a unique constraint violation (duplicate purchase)
      if (dbError.code === '23505') {
        // Unique constraint violation - user already purchased
        // Rollback Redis stock since we didn't actually sell
        if (stockDecremented) {
          await redisService.incrementStock(saleId);
        }
        
        return {
          result: PurchaseResult.ALREADY_PURCHASED,
          message: 'You have already purchased in this sale',
        };
      }
      
      throw dbError;
      
    } finally {
      dbClient.release();
    }
    
  } catch (error) {
    console.error(`Purchase ERROR: userId=${userId}, saleId=${saleId}, error=${error.message}`);
    
    // Rollback Redis operations if needed
    if (stockDecremented) {
      try {
        await redisService.incrementStock(saleId);
      } catch (rollbackError) {
        console.error('Failed to rollback stock:', rollbackError.message);
      }
    }
    
    if (userMarked) {
      try {
        await redisService.removeUserPurchaseMark(saleId, userId);
      } catch (rollbackError) {
        console.error('Failed to remove user purchase mark:', rollbackError.message);
      }
    }
    
    return {
      result: PurchaseResult.ERROR,
      message: 'An error occurred while processing your purchase. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    };
  }
}

/**
 * Get purchase statistics for a sale
 */
export async function getPurchaseStats(saleId) {
  const result = await query(
    `SELECT 
       COUNT(*) FILTER (WHERE status = 'SUCCESS') as success_count,
       COUNT(*) FILTER (WHERE status = 'FAILED') as failed_count,
       COUNT(*) as total_count
     FROM orders 
     WHERE sale_id = $1`,
    [saleId]
  );
  
  const stats = result.rows[0];
  
  return {
    successCount: parseInt(stats.success_count, 10),
    failedCount: parseInt(stats.failed_count, 10),
    totalCount: parseInt(stats.total_count, 10),
  };
}
