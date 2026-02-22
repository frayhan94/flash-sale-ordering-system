import { query } from '../db/postgres.js';
import * as redisService from './redis.js';
import { config } from '../config/index.js';

/**
 * Get flash sale by ID
 */
export async function getSaleById(saleId) {
  const result = await query(
    'SELECT id, name, start_time, end_time, total_stock, created_at FROM flash_sale WHERE id = $1',
    [saleId]
  );
  return result.rows[0] || null;
}

/**
 * Get active flash sale
 */
export async function getActiveSale() {
  const result = await query(
    `SELECT id, name, start_time, end_time, total_stock, created_at 
     FROM flash_sale 
     WHERE start_time <= NOW() AND end_time >= NOW()
     ORDER BY id DESC
     LIMIT 1`
  );
  return result.rows[0] || null;
}

/**
 * Get sale status: UPCOMING, ACTIVE, or ENDED
 */
export function getSaleStatus(sale) {
  if (!sale) {
    return 'NOT_FOUND';
  }
  
  const now = new Date();
  const startTime = new Date(sale.start_time);
  const endTime = new Date(sale.end_time);
  
  if (now < startTime) {
    return 'UPCOMING';
  } else if (now >= startTime && now <= endTime) {
    return 'ACTIVE';
  } else {
    return 'ENDED';
  }
}

/**
 * Check if sale is currently active
 */
export function isSaleActive(sale) {
  return getSaleStatus(sale) === 'ACTIVE';
}

/**
 * Get remaining stock - tries Redis first, falls back to DB
 */
export async function getRemainingStock(saleId) {
  // Try Redis first
  try {
    const redisStock = await redisService.getStock(saleId);
    if (redisStock !== null) {
      return Math.max(0, redisStock);
    }
  } catch (error) {
    console.warn('Redis unavailable, falling back to DB for stock:', error.message);
  }
  
  // Fallback: Calculate from DB
  return await calculateRemainingStockFromDB(saleId);
}

/**
 * Calculate remaining stock from database
 */
export async function calculateRemainingStockFromDB(saleId) {
  const result = await query(
    `SELECT 
       fs.total_stock - COALESCE(COUNT(o.id), 0) as remaining_stock
     FROM flash_sale fs
     LEFT JOIN orders o ON o.sale_id = fs.id AND o.status = 'SUCCESS'
     WHERE fs.id = $1
     GROUP BY fs.id, fs.total_stock`,
    [saleId]
  );
  
  if (result.rows[0]) {
    return Math.max(0, parseInt(result.rows[0].remaining_stock, 10));
  }
  return 0;
}

/**
 * Initialize Redis stock from database
 */
export async function initializeRedisStock(saleId) {
  const remainingStock = await calculateRemainingStockFromDB(saleId);
  await redisService.initializeStock(saleId, remainingStock);
  console.log(`Initialized Redis stock for sale ${saleId}: ${remainingStock}`);
  return remainingStock;
}

/**
 * Restore user purchase flags from database (stock only)
 */
export async function completeRedisRecovery(saleId) {
  // Only restore user purchase flags, not stock
  const userPurchases = await getSuccessfulUserPurchases(saleId);
  const restoredUsers = [];
  
  for (const purchase of userPurchases) {
    await redisService.markUserPurchased(saleId, purchase.user_id);
    restoredUsers.push(purchase.user_id);
  }
  
  console.log(`User purchase recovery for sale ${saleId}:`);
  console.log(`- User purchases restored: ${restoredUsers.length}`);
  
  return {
    restoredUsers: restoredUsers.length,
    users: restoredUsers
  };
}

/**
 * Get all successful user purchases for a sale
 */
export async function getSuccessfulUserPurchases(saleId) {
  const result = await query(
    'SELECT user_id FROM orders WHERE sale_id = $1 AND status = $2',
    [saleId, 'SUCCESS']
  );
  
  return result.rows;
}

/**
 * Get full sale status response
 */
export async function getSaleStatusResponse(saleId = config.sale.defaultSaleId) {
  const sale = await getSaleById(saleId);
  
  if (!sale) {
    return {
      status: 'NOT_FOUND',
      message: 'No flash sale found',
    };
  }
  
  const status = getSaleStatus(sale);
  const remainingStock = await getRemainingStock(saleId);
  
  return {
    saleId: sale.id,
    name: sale.name,
    status,
    remainingStock,
    totalStock: sale.total_stock,
    startTime: sale.start_time,
    endTime: sale.end_time,
  };
}

/**
 * Create a new flash sale
 */
export async function createSale(name, startTime, endTime, totalStock) {
  const result = await query(
    `INSERT INTO flash_sale (name, start_time, end_time, total_stock)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, start_time, end_time, total_stock, created_at`,
    [name, startTime, endTime, totalStock]
  );
  
  const sale = result.rows[0];
  
  // Initialize stock in Redis
  await redisService.initializeStock(sale.id, totalStock);
  
  return sale;
}

/**
 * Update sale times
 */
export async function updateSaleTimes(saleId, startTime, endTime) {
  const updateFields = [];
  const values = [];
  let paramIndex = 1;

  if (startTime) {
    updateFields.push(`start_time = $${paramIndex++}`);
    values.push(startTime);
  }

  if (endTime) {
    updateFields.push(`end_time = $${paramIndex++}`);
    values.push(endTime);
  }

  if (updateFields.length === 0) {
    throw new Error('At least one field must be provided for update');
  }

  values.push(saleId);

  const result = await query(
    `UPDATE flash_sale SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING id, name, start_time, end_time, total_stock`,
    values
  );

  return result.rows[0];
}

/**
 * Reset sale for testing
 */
export async function resetSale(saleId, newStock) {
  // Update DB
  await query(
    'UPDATE flash_sale SET total_stock = $1 WHERE id = $2',
    [newStock, saleId]
  );
  
  // Delete all orders for this sale
  await query('DELETE FROM orders WHERE sale_id = $1', [saleId]);
  
  // Reset Redis
  await redisService.resetSaleKeys(saleId);
  await redisService.initializeStock(saleId, newStock);
  
  return true;
}
