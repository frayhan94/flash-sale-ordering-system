import * as saleService from '../services/sale.js';
import * as purchaseService from '../services/purchase.js';
import { 
  purchaseSchema, 
  userIdParamSchema,
  resetSaleSchema,
  updateSaleTimesSchema,
  saleIdSchema,
  validateBody, 
  validateParams 
} from '../schemas/index.js';
import { config } from '../config/index.js';

export async function saleRoutes(fastify) {
  /**
   * GET /sale/status
   * Get current flash sale status including remaining stock
   */
  fastify.get('/sale/status', async (request, reply) => {
    const saleId = request.query.saleId 
      ? parseInt(request.query.saleId, 10) 
      : config.sale.defaultSaleId;
    
    const status = await saleService.getSaleStatusResponse(saleId);
    return reply.send(status);
  });

  /**
   * POST /purchase
   * Process a purchase request
   * Body: { "userId": "user123" }
   */
  fastify.post('/purchase', {
    preHandler: validateBody(purchaseSchema),
  }, async (request, reply) => {
    const { userId } = request.validatedBody;
    const saleId = request.body.saleId 
      ? parseInt(request.body.saleId, 10) 
      : config.sale.defaultSaleId;
    
    const result = await purchaseService.processPurchase(userId, saleId);
    
    // Set appropriate HTTP status based on result
    const statusCodes = {
      [purchaseService.PurchaseResult.SUCCESS]: 200,
      [purchaseService.PurchaseResult.ALREADY_PURCHASED]: 409,
      [purchaseService.PurchaseResult.SOLD_OUT]: 410,
      [purchaseService.PurchaseResult.SALE_NOT_ACTIVE]: 403,
      [purchaseService.PurchaseResult.SALE_NOT_FOUND]: 404,
      [purchaseService.PurchaseResult.ERROR]: 500,
    };
    
    const statusCode = statusCodes[result.result] || 500;
    return reply.status(statusCode).send(result);
  });

  /**
   * GET /purchase/:userId
   * Check if a user has purchased
   */
  fastify.get('/purchase/:userId', {
    preHandler: validateParams(userIdParamSchema),
  }, async (request, reply) => {
    const { userId } = request.validatedParams;
    const saleId = request.query.saleId 
      ? parseInt(request.query.saleId, 10) 
      : config.sale.defaultSaleId;
    
    const purchase = await purchaseService.getUserPurchase(saleId, userId);
    
    if (purchase) {
      return reply.send({
        purchased: true,
        order: {
          id: purchase.id,
          userId: purchase.user_id,
          saleId: purchase.sale_id,
          status: purchase.status,
          createdAt: purchase.created_at,
        },
      });
    }
    
    return reply.send({
      purchased: false,
    });
  });

  /**
   * GET /sale/stats
   * Get purchase statistics (for monitoring/testing)
   */
  fastify.get('/sale/stats', async (request, reply) => {
    const saleId = request.query.saleId 
      ? parseInt(request.query.saleId, 10) 
      : config.sale.defaultSaleId;
    
    const [saleStatus, purchaseStats] = await Promise.all([
      saleService.getSaleStatusResponse(saleId),
      purchaseService.getPurchaseStats(saleId),
    ]);
    
    return reply.send({
      sale: saleStatus,
      purchases: purchaseStats,
    });
  });

  /**
   * POST /sale/reset
   * Reset sale for testing (should be protected in production)
   */
  fastify.post('/sale/reset', {
    preHandler: validateBody(resetSaleSchema),
  }, async (request, reply) => {
    const { stock } = request.validatedBody;
    const saleId = request.body.saleId 
      ? parseInt(request.body.saleId, 10) 
      : config.sale.defaultSaleId;
    
    await saleService.resetSale(saleId, stock);
    
    return reply.send({
      success: true,
      message: `Sale ${saleId} reset with ${stock} items`,
    });
  });

  /**
   * PUT /sale/:saleId/times
   * Update sale start and end times
   */
  fastify.put('/sale/:saleId/times', {
    preHandler: [validateParams(saleIdSchema), validateBody(updateSaleTimesSchema)]
  }, async (request, reply) => {
    const { saleId } = request.validatedParams;
    const { startTime, endTime } = request.validatedBody;

    try {
      const updatedSale = await saleService.updateSaleTimes(saleId, startTime, endTime);
      
      return reply.send({
        success: true,
        message: `Sale ${saleId} times updated successfully`,
        sale: updatedSale,
      });
    } catch (error) {
      if (error.message.includes('At least one field must be provided')) {
        return reply.status(400).send({
          success: false,
          message: 'At least one of startTime or endTime must be provided',
        });
      }
      
      return reply.status(500).send({
        success: false,
        message: 'Failed to update sale times',
        error: error.message,
      });
    }
  });

  /**
   * POST /sale/init-stock
   * Initialize Redis stock from DB (useful after restart)
   */
  fastify.post('/sale/init-stock', async (request, reply) => {
    const saleId = request.body.saleId 
      ? parseInt(request.body.saleId, 10) 
      : config.sale.defaultSaleId;
    
    const stock = await saleService.initializeRedisStock(saleId);
    
    return reply.send({
      success: true,
      saleId,
      initializedStock: stock,
    });
  });
}
