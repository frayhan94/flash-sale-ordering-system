import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import { saleRoutes } from './routes/sale.js';
import { getPool, healthCheck as dbHealthCheck, closePool } from './db/postgres.js';
import { connectRedis, healthCheck as redisHealthCheck, closeRedis } from './services/redis.js';
import { initializeRedisStock } from './services/sale.js';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' 
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

// Register CORS
await fastify.register(cors, {
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Register rate limiting
await fastify.register(rateLimit, {
  max: config.rateLimit.max,
  timeWindow: config.rateLimit.timeWindow,
  errorResponseBuilder: (request, context) => ({
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Please try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  const [dbOk, redisOk] = await Promise.all([
    dbHealthCheck(),
    redisHealthCheck(),
  ]);
  
  const healthy = dbOk && redisOk;
  
  return reply.status(healthy ? 200 : 503).send({
    status: healthy ? 'healthy' : 'unhealthy',
    services: {
      database: dbOk ? 'connected' : 'disconnected',
      redis: redisOk ? 'connected' : 'disconnected',
    },
    timestamp: new Date().toISOString(),
  });
});

// Register routes
await fastify.register(saleRoutes);

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  try {
    await fastify.close();
    await closePool();
    await closeRedis();
    console.log('Server closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
async function start() {
  try {
    // Initialize database connection pool
    getPool();
    console.log('Database pool initialized');
    
    // Connect to Redis
    await connectRedis();
    console.log('Redis connected');
    
    // Initialize stock in Redis from DB
    try {
      await initializeRedisStock(config.sale.defaultSaleId);
    } catch (error) {
      console.warn('Could not initialize stock (sale may not exist yet):', error.message);
    }
    
    // Start listening
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Server running at http://${config.host}:${config.port}`);
    
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

start();

export { fastify };
