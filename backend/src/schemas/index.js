import { z } from 'zod';

// Purchase request validation schema
export const purchaseSchema = z.object({
  userId: z
    .string()
    .min(1, 'User ID is required')
    .max(255, 'User ID is too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'User ID can only contain letters, numbers, underscores, and hyphens'),
});

// Sale ID parameter validation
export const saleIdSchema = z.object({
  saleId: z
    .string()
    .regex(/^\d+$/, 'Sale ID must be a number')
    .transform((val) => parseInt(val, 10)),
});

// User ID parameter validation
export const userIdParamSchema = z.object({
  userId: z
    .string()
    .min(1, 'User ID is required')
    .max(255, 'User ID is too long'),
});

// Create sale request validation
export const createSaleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
  startTime: z.string().datetime('Invalid start time format'),
  endTime: z.string().datetime('Invalid end time format'),
  totalStock: z.number().int().min(1, 'Total stock must be at least 1'),
});

// Update sale times validation
export const updateSaleTimesSchema = z.object({
  startTime: z.string().datetime('Invalid start time format').optional(),
  endTime: z.string().datetime('Invalid end time format').optional(),
}).refine((data) => {
  if (data.startTime && data.endTime) {
    return new Date(data.startTime) < new Date(data.endTime);
  }
  return true;
}, {
  message: 'Start time must be before end time',
});

// Reset sale request validation
export const resetSaleSchema = z.object({
  stock: z.number().int().positive('Stock must be a positive integer'),
});

/**
 * Validate request body with Zod schema
 */
export function validateBody(schema) {
  return async (request, reply) => {
    try {
      request.validatedBody = schema.parse(request.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          error: 'Validation Error',
          message: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
          details: error.errors,
        });
        return;
      }
      throw error;
    }
  };
}

/**
 * Validate request params with Zod schema
 */
export function validateParams(schema) {
  return async (request, reply) => {
    try {
      request.validatedParams = schema.parse(request.params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          error: 'Validation Error',
          message: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
          details: error.errors,
        });
        return;
      }
      throw error;
    }
  };
}
