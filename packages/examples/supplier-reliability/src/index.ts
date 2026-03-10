import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import {
  HTTPFacilitatorClient,
  type FacilitatorConfig,
} from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { paymentMiddlewareFromConfig } from '@x402/hono';
import type { RouteConfig } from '@x402/core/server';
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

  // Set up payment middleware using real payment verifier from config
  const price = '1000'; // Price in base units (e.g., 1000 = $0.001 USDC)
  const network = config.paymentsConfig.network;
  const payTo = (config.paymentsConfig as { payTo?: string }).payTo;

  const facilitatorConfig: FacilitatorConfig = {
    url: config.paymentsConfig.facilitatorUrl,
    createAuthHeaders: config.paymentsConfig.facilitatorAuth
      ? async () => ({
          verify: { Authorization: `Bearer ${config.paymentsConfig.facilitatorAuth}` },
        })
      : undefined,
  };

  const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig);

  const baseRoute: RouteConfig = {
    accepts: {
      scheme: 'exact',
      payTo: payTo as `0x${string}`,
      price,
      network,
    },
    description: 'Supplier Reliability API endpoint',
    mimeType: 'application/json',
  };

  const routes = {
    'GET /v1/suppliers/score': baseRoute,
    'GET /v1/suppliers/lead-time-forecast': baseRoute,
    'GET /v1/suppliers/disruption-alerts': baseRoute,
  };

  const schemes = [
    {
      network: 'eip155:*',
      server: new ExactEvmScheme(),
    },
  ];

  const paymentMiddleware = paymentMiddlewareFromConfig(routes, facilitatorClient, schemes);

  // Middleware to check payment using real verifier
  const requirePayment = async (c: Context, next: Next) => {
    const result = await paymentMiddleware(c, next);
    if (result instanceof Response) {
      return result;
    }
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
              details: err.issues,
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
        horizonDays: query.horizonDays,
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
              details: err.issues,
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
              details: err.issues,
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
