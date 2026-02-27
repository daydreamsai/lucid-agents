import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Context } from 'hono';
import { GasOracleService } from './service';
import type { GasDataProvider } from './core';
import {
  GasQuoteRequestSchema,
  GasQuoteResponseSchema,
  GasForecastRequestSchema,
  GasForecastResponseSchema,
  GasCongestionRequestSchema,
  GasCongestionResponseSchema,
  ErrorResponseSchema,
  type ErrorResponse,
} from './schemas';

/**
 * Create error response
 */
function createErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ErrorResponse {
  return {
    error: {
      code,
      message,
      details,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create Gas Oracle API with Hono
 */
export function createGasOracleAPI(provider: GasDataProvider) {
  const app = new Hono();
  const service = new GasOracleService(provider);

  // Middleware
  app.use('*', cors());
  app.use('*', logger());

  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // GET /v1/gas/quote
  app.get('/v1/gas/quote', async (c: Context) => {
    try {
      const query = c.req.query();
      const parsed = GasQuoteRequestSchema.safeParse({
        chain: query.chain,
        urgency: query.urgency,
        txType: query.txType,
        recentFailureTolerance: query.recentFailureTolerance
          ? parseFloat(query.recentFailureTolerance)
          : undefined,
      });

      if (!parsed.success) {
        const error = createErrorResponse(
          'INVALID_REQUEST',
          'Invalid request parameters',
          { errors: parsed.error.errors }
        );
        return c.json(error, 400);
      }

      const response = await service.getQuote(parsed.data);
      return c.json(response);
    } catch (error) {
      const errorResponse = createErrorResponse(
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
      return c.json(errorResponse, 500);
    }
  });

  // GET /v1/gas/forecast
  app.get('/v1/gas/forecast', async (c: Context) => {
    try {
      const query = c.req.query();
      const parsed = GasForecastRequestSchema.safeParse({
        chain: query.chain,
        targetBlocks: query.targetBlocks ? parseInt(query.targetBlocks) : undefined,
      });

      if (!parsed.success) {
        const error = createErrorResponse(
          'INVALID_REQUEST',
          'Invalid request parameters',
          { errors: parsed.error.errors }
        );
        return c.json(error, 400);
      }

      const response = await service.getForecast(parsed.data);
      return c.json(response);
    } catch (error) {
      const errorResponse = createErrorResponse(
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
      return c.json(errorResponse, 500);
    }
  });

  // GET /v1/gas/congestion
  app.get('/v1/gas/congestion', async (c: Context) => {
    try {
      const query = c.req.query();
      const parsed = GasCongestionRequestSchema.safeParse({
        chain: query.chain,
      });

      if (!parsed.success) {
        const error = createErrorResponse(
          'INVALID_REQUEST',
          'Invalid request parameters',
          { errors: parsed.error.errors }
        );
        return c.json(error, 400);
      }

      const response = await service.getCongestion(parsed.data);
      return c.json(response);
    } catch (error) {
      const errorResponse = createErrorResponse(
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
      return c.json(errorResponse, 500);
    }
  });

  // 404 handler
  app.notFound((c) => {
    const error = createErrorResponse(
      'NOT_FOUND',
      'The requested endpoint does not exist'
    );
    return c.json(error, 404);
  });

  return app;
}
