import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { LineageRequestSchema, LineageResponseSchema, FreshnessRequestSchema, FreshnessResponseSchema, VerifyHashRequestSchema, VerifyHashResponseSchema } from './schema';
import { getLineage, checkFreshness, verifyHash } from './logic';

const agent = await createAgent({ name: 'data-provenance-api', version: '1.0.0', description: 'Data Freshness & Provenance Verification API' })
  .use(http())
  .use(payments({ config: { payTo: process.env.PAY_TO_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', network: process.env.NETWORK || 'eip155:84532', facilitatorUrl: process.env.FACILITATOR_URL || 'https://facilitator.daydreams.systems' } }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

addEntrypoint({ key: 'v1/provenance/lineage', description: 'Get data lineage graph', price: '0.5', input: LineageRequestSchema, output: LineageResponseSchema, handler: async ctx => ({ output: getLineage(ctx.input) }) });
addEntrypoint({ key: 'v1/provenance/freshness', description: 'Check dataset freshness and SLA', price: '0.75', input: FreshnessRequestSchema, output: FreshnessResponseSchema, handler: async ctx => ({ output: checkFreshness(ctx.input) }) });
addEntrypoint({ key: 'v1/provenance/verify-hash', description: 'Verify dataset integrity', price: '1.0', input: VerifyHashRequestSchema, output: VerifyHashResponseSchema, handler: async ctx => ({ output: verifyHash(ctx.input) }) });

const port = Number(process.env.PORT ?? 3003);
const server = Bun.serve({ port, fetch: app.fetch });
console.log(`🔍 Data Provenance API ready at http://${server.hostname}:${server.port}`);
