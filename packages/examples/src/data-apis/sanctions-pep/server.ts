import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { ScreeningCheckRequestSchema, ScreeningCheckResponseSchema, ExposureChainRequestSchema, ExposureChainResponseSchema, JurisdictionRiskRequestSchema, JurisdictionRiskResponseSchema } from './schema';
import { screenEntity, getExposureChain, assessJurisdictionRisk } from './logic';

const agent = await createAgent({ name: 'sanctions-pep-api', version: '1.0.0', description: 'Sanctions & PEP Exposure Intelligence API' })
  .use(http())
  .use(payments({ config: { payTo: process.env.PAY_TO_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', network: process.env.NETWORK || 'eip155:84532', facilitatorUrl: process.env.FACILITATOR_URL || 'https://facilitator.daydreams.systems' } }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

addEntrypoint({ key: 'v1/screening/check', description: 'Screen entity for sanctions and PEP exposure', price: '1.0', input: ScreeningCheckRequestSchema, output: ScreeningCheckResponseSchema, handler: async ctx => ({ output: screenEntity(ctx.input) }) });
addEntrypoint({ key: 'v1/screening/exposure-chain', description: 'Get ownership exposure chain with risk context', price: '1.5', input: ExposureChainRequestSchema, output: ExposureChainResponseSchema, handler: async ctx => ({ output: getExposureChain(ctx.input) }) });
addEntrypoint({ key: 'v1/screening/jurisdiction-risk', description: 'Assess jurisdiction risk levels', price: '0.75', input: JurisdictionRiskRequestSchema, output: JurisdictionRiskResponseSchema, handler: async ctx => ({ output: assessJurisdictionRisk(ctx.input) }) });

const port = Number(process.env.PORT ?? 3004);
const server = Bun.serve({ port, fetch: app.fetch });
console.log(`🛡️ Sanctions & PEP API ready at http://${server.hostname}:${server.port}`);
