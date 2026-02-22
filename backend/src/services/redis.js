import Redis from 'ioredis';
import { config } from '../config/index.js';

let redisClient = null;
let isConnected = false;

export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      isConnected = true;
      console.log('Redis connected');
    });

    redisClient.on('error', (err) => {
      isConnected = false;
      console.error('Redis error:', err.message);
    });

    redisClient.on('close', () => {
      isConnected = false;
      console.log('Redis connection closed');
    });
  }
  return redisClient;
}

export async function connectRedis() {
  const client = getRedisClient();
  if (!isConnected) {
    await client.connect();
  }
  return client;
}

export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
  }
}

export function isRedisConnected() {
  return isConnected;
}

export async function healthCheck() {
  try {
    const client = getRedisClient();
    await client.ping();
    return true;
  } catch (error) {
    return false;
  }
}

// Stock management keys
export function getStockKey(saleId) {
  return `${config.sale.stockKeyPrefix}${saleId}`;
}

export function getUserPurchaseKey(saleId, userId) {
  return `${config.sale.userPurchaseKeyPrefix}${saleId}:${userId}`;
}

/**
 * Initialize stock in Redis for a sale
 */
export async function initializeStock(saleId, stock) {
  const client = getRedisClient();
  const key = getStockKey(saleId);
  await client.set(key, stock);
  return stock;
}

/**
 * Get current stock from Redis
 */
export async function getStock(saleId) {
  const client = getRedisClient();
  const key = getStockKey(saleId);
  const stock = await client.get(key);
  return stock !== null ? parseInt(stock, 10) : null;
}

/**
 * Check if user has already purchased (fast check in Redis)
 */
export async function hasUserPurchased(saleId, userId) {
  const client = getRedisClient();
  const key = getUserPurchaseKey(saleId, userId);
  const exists = await client.exists(key);
  return exists === 1;
}

/**
 * Mark user as purchased in Redis
 */
export async function markUserPurchased(saleId, userId) {
  const client = getRedisClient();
  const key = getUserPurchaseKey(saleId, userId);
  await client.set(key, '1', 'EX', config.sale.userPurchaseExpiry);
}

/**
 * Remove user purchase mark (for rollback)
 */
export async function removeUserPurchaseMark(saleId, userId) {
  const client = getRedisClient();
  const key = getUserPurchaseKey(saleId, userId);
  await client.del(key);
}

/**
 * Atomic stock decrement - THE CRITICAL OPERATION
 * Returns the new stock value after decrement
 * If result is < 0, we need to rollback
 */
export async function decrementStock(saleId) {
  const client = getRedisClient();
  const key = getStockKey(saleId);
  const newStock = await client.decr(key);
  return newStock;
}

/**
 * Increment stock (for rollback)
 */
export async function incrementStock(saleId) {
  const client = getRedisClient();
  const key = getStockKey(saleId);
  const newStock = await client.incr(key);
  return newStock;
}

/**
 * Reset all sale-related keys (for testing)
 */
export async function resetSaleKeys(saleId) {
  const client = getRedisClient();
  const stockKey = getStockKey(saleId);
  
  // Delete stock key
  await client.del(stockKey);
  
  // Delete all user purchase keys for this sale
  const pattern = `${config.sale.userPurchaseKeyPrefix}${saleId}:*`;
  const keys = await client.keys(pattern);
  if (keys.length > 0) {
    await client.del(...keys);
  }
}

/**
 * Delete all user purchase keys for a specific sale
 */
export async function deleteUserPurchaseKeys(saleId) {
  const client = getRedisClient();
  const pattern = `${config.sale.userPurchaseKeyPrefix}${saleId}:*`;
  const keys = await client.keys(pattern);
  if (keys.length > 0) {
    await client.del(...keys);
    console.log(`Deleted ${keys.length} user purchase keys for sale ${saleId}`);
  }
  return keys.length;
}
