import { Hono } from 'hono';
import { gasRoutes } from './routes/gas.js';

/**
 * Builds the Gas Oracle Hono application with all routes mounted.
 *
 * Routes:
 *   GET /v1/gas/quote       — fee recommendation + inclusion probability
 *   GET /v1/gas/forecast    — future base-fee predictions
 *   GET /v1/gas/congestion  — current network congestion state
 *
 * All endpoints include `freshness_ms` and `confidence_score` in their
 * responses, enabling callers to apply their own staleness thresholds.
 *
 * Payments:
 *   All routes are guarded by x402 micropayments via the @x402/hono middleware.
 *   Configure PAYMENTS_RECEIVABLE_ADDRESS and NETWORK in the environment.
 */
export function createGasOracleApp(): Hono {
  const app = new Hono();

  app.get('/health', c =>
    c.json({ status: 'ok', service: 'gas-oracle', version: '0.1.0' })
  );

  app.route('/v1/gas', gasRoutes);

  app.notFound(c =>
    c.json({ error: { code: 'not_found', message: 'Route not found' } }, 404)
  );

  app.onError((err, c) =>
    c.json(
      {
        error: {
          code: 'internal_error',
          message: err.message ?? 'Unexpected error',
        },
      },
      500
    )
  );

  return app;
}
