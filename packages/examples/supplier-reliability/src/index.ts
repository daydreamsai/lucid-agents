import { Hono } from 'hono';
import { z } from 'zod';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import {
  SupplierScoreRequestSchema,
  SupplierScoreResponseSchema,
  LeadTimeForecastRequestSchema,
  LeadTimeForecastResponseSchema,
  DisruptionAlertsRequestSchema,
  DisruptionAlertsResponseSchema,
  ErrorResponseSchema,
} from './schemas';
import {
  calculateSupplierScore,
  forecastLeadTime,
  detectDisruptions,
  calculateConfidence,
  calculateFreshness,
} from './business-logic';

export interface SupplierReliabilityConfig {
  paymentsConfig: PaymentsConfig;
}

export async function createSupplierReliabilityAgent(config: SupplierReliabilityConfig) {
  const app = new Hono();

  // Middleware to check payment (mock implementation)
  const requirePayment = async (c: any, next: any) => {
    const paymentHeader = c.req.header('X-Payment');
    
    if (!paymentHeader) {
      // Return 402 Payment Required
      return c.json(
        {
          x402Version: 2,
          error: 'Payment required',
        },
        402,
        {
          'PAYMENT-REQUIRED': 'true',
        }
      );
    }
    
    // Mock payment validation - in real implementation, validate with facilitator
    try {
      const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
      if (!decoded.payload?.authorization?.to) {
        throw new Error('Invalid payment header');
      }
    } catch (err) {
      return c.json(
        {
          error: {
            code: 'INVALID_PAYMENT',
            message: 'Invalid payment header',
          },
        },
        400
      );
    }
    
    await next();
  };

  // GET /v1/suppliers/score
  app.get('/v1/suppliers/score', requirePayment, async (c) => {
    try {
      const query = c.req.query();
      const input = SupplierScoreRequestSchema.parse({
        supplierId: query.supplierId,
        category: query.category,
        region: query.region,
      });

      const score = calculateSupplierScore(input.supplierId, input.category, input.region);
      const dataPoints = 100 + Math.floor(Math.random() * 100);
      const confidence = calculateConfidence(dataPoints);
      const freshness_ms = calculateFreshness();

      const response = SupplierScoreResponseSchema.parse({
        supplier_score: score,
        confidence,
        freshness_ms,
        metadata: {
          data_points: dataPoints,
          last_updated: new Date().toISOString(),
        },
      });

      return c.json(response);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return c.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input parameters',
              details: err.errors,
            },
          },
          400
        );
      }
      return c.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
          },
        },
        500
      );
    }
  });

  // GET /v1/suppliers/lead-time-forecast
  app.get('/v1/suppliers/lead-time-forecast', requirePayment, async (c) => {
    try {
      const query = c.req.query();
      const input = LeadTimeForecastRequestSchema.parse({
        supplierId: query.supplierId,
        category: query.category,
        region: query.region,
        horizonDays: query.horizonDays ? parseInt(query.horizonDays) : undefined,
      });

      const forecast = forecastLeadTime(
        input.supplierId,
        input.category,
        input.region,
        input.horizonDays
      );
      const dataPoints = 80 + Math.floor(Math.random() * 80);
      const confidence = calculateConfidence(dataPoints);
      const freshness_ms = calculateFreshness();

      const response = LeadTimeForecastResponseSchema.parse({
        ...forecast,
        confidence,
        freshness_ms,
      });

      return c.json(response);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return c.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input parameters',
              details: err.errors,
            },
          },
          400
        );
      }
      return c.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
          },
        },
        500
      );
    }
  });

  // GET /v1/suppliers/disruption-alerts
  app.get('/v1/suppliers/disruption-alerts', requirePayment, async (c) => {
    try {
      const query = c.req.query();
      const input = DisruptionAlertsRequestSchema.parse({
        supplierId: query.supplierId,
        region: query.region,
        riskTolerance: query.riskTolerance,
      });

      const disruption = detectDisruptions(
        input.supplierId,
        input.region,
        input.riskTolerance
      );
      const dataPoints = 60 + Math.floor(Math.random() * 60);
      const confidence = calculateConfidence(dataPoints);
      const freshness_ms = calculateFreshness();

      const response = DisruptionAlertsResponseSchema.parse({
        ...disruption,
        confidence,
        freshness_ms,
      });

      return c.json(response);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return c.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input parameters',
              details: err.errors,
            },
          },
          400
        );
      }
      return c.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
          },
        },
        500
      );
    }
  });

  return app;
}
