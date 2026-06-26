/**
 * Supplier Reliability Signal Marketplace API
 * Paid supplier-intelligence API via x402 payment protocol.
 */
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { z } from 'zod';
import {
  SupplierScoreInputSchema, SupplierScoreOutputSchema,
  LeadTimeForecastInputSchema, LeadTimeForecastOutputSchema,
  DisruptionAlertsInputSchema, DisruptionAlertsOutputSchema,
  ErrorEnvelopeSchema,
} from './schemas';
import { dataService } from './data-service';

const config = {
  port: Number(process.env.PORT ?? 3002),
  payTo: process.env.PAYTO_ADDRESS ?? '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  network: process.env.NETWORK ?? 'eip155:84532',
  facilitatorUrl: process.env.FACILITATOR_URL ?? 'https://facilitator.daydreams.systems',
};

const agent = await createAgent({
  name: 'supplier-reliability-api',
  version: '1.0.0',
  description: 'Supplier reliability signal marketplace - normalized reliability signals and confidence bands for resilient supplier selection',
})
  .use(http())
  .use(payments({ config: { payTo: config.payTo, network: config.network, facilitatorUrl: config.facilitatorUrl } }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

addEntrypoint({
  key: 'score',
  path: '/v1/suppliers/score',
  description: 'Get normalized supplier reliability score with confidence bands',
  price: '0.10',
  input: SupplierScoreInputSchema,
  output: z.union([SupplierScoreOutputSchema, ErrorEnvelopeSchema]),
  handler: async ctx => {
    const { supplierId, category, region } = ctx.input;
    const result = await dataService.getSupplierScore(supplierId, category, region);
    if (!result) return { output: { error: { code: 'supplier_not_found' as const, message: `Supplier ${supplierId} not found` } } };
    if (dataService.isDataStale(result.freshness.freshness_ms)) return { output: { error: { code: 'stale_data' as const, message: 'Data exceeds freshness threshold', details: { freshness_ms: result.freshness.freshness_ms } } } };
    return { output: result };
  },
});

addEntrypoint({
  key: 'lead-time-forecast',
  path: '/v1/suppliers/lead-time-forecast',
  description: 'Get lead time forecast with P50/P95 percentiles and drift analysis',
  price: '0.25',
  input: LeadTimeForecastInputSchema,
  output: z.union([LeadTimeForecastOutputSchema, ErrorEnvelopeSchema]),
  handler: async ctx => {
    const { supplierId, category, region, horizonDays } = ctx.input;
    const result = await dataService.getLeadTimeForecast(supplierId, category, region, horizonDays ?? 30);
    if (!result) return { output: { error: { code: 'supplier_not_found' as const, message: `Supplier ${supplierId} not found for ${category} in ${region}` } } };
    if (dataService.isDataStale(result.freshness.freshness_ms)) return { output: { error: { code: 'stale_data' as const, message: 'Forecast data exceeds freshness threshold', details: { freshness_ms: result.freshness.freshness_ms } } } };
    return { output: result };
  },
});

addEntrypoint({
  key: 'disruption-alerts',
  path: '/v1/suppliers/disruption-alerts',
  description: 'Get disruption probability and active risk alerts with recommended actions',
  price: '0.50',
  input: DisruptionAlertsInputSchema,
  output: z.union([DisruptionAlertsOutputSchema, ErrorEnvelopeSchema]),
  handler: async ctx => {
    const { supplierId, category, region, riskTolerance } = ctx.input;
    const result = await dataService.getDisruptionAlerts(supplierId, riskTolerance ?? 'medium', category, region);
    if (!result) return { output: { error: { code: 'supplier_not_found' as const, message: `Supplier ${supplierId} not found` } } };
    if (dataService.isDataStale(result.freshness.freshness_ms)) return { output: { error: { code: 'stale_data' as const, message: 'Alert data exceeds freshness threshold', details: { freshness_ms: result.freshness.freshness_ms } } } };
    return { output: result };
  },
});

const server = Bun.serve({ port: config.port, fetch: app.fetch });
console.log(`Supplier Reliability API v1.0.0 running at http://${server.hostname}:${server.port}`);
console.log(`Endpoints: /v1/suppliers/score ($0.10), /v1/suppliers/lead-time-forecast ($0.25), /v1/suppliers/disruption-alerts ($0.50)`);

export { app, agent };
