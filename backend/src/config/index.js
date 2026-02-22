export const config = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  
  database: {
    url: process.env.DATABASE_URL || 'postgres://flashsale:flashsale123@localhost:5432/flashsale',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  rateLimit: {
    max: 200000,
    timeWindow: '1 minute',
  },
  
  sale: {
    defaultSaleId: 1,
    stockKeyPrefix: 'sale:stock:',
    userPurchaseKeyPrefix: 'sale:user:',
    userPurchaseExpiry: 86400, // 24 hours in seconds
  },
};
