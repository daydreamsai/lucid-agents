import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';

import { getEvents, getImpactVectors, scoreScenario } from './logic';
import { EventsRequestSchema, EventsResponseSchema, ImpactVectorsRequestSchema, ImpactVectorsResponseSchema, ScenarioScoreRequestSchema, ScenarioScoreResponseSchema } from './schema';

const agent = await createAgent({ name: 'macro-impact-api', version: '1.0.0', description: 'Macro Event Impact Vector API' })
  .use(http())
  .use(payments({ config: { payTo: process.env.PAY_TO_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', network: process.env.NETWORK || 'eip155:84532', facilitatorUrl: process.env.FACILITATOR_URL || 'https://facilitator.daydreams.systems' } }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);
addEntrypoint({ key: 'v1/macro/events', description: 'Get macro event feed', price: '0.5', input: EventsRequestSchema, output: EventsResponseSchema, handler: async ctx => ({ output: getEvents(ctx.input) }) });
addEntrypoint({ key: 'v1/macro/impact-vectors', description: 'Get impact vectors', price: '1.0', input: ImpactVectorsRequestSchema, output: ImpactVectorsResponseSchema, handler: async ctx => ({ output: getImpactVectors(ctx.input) }) });
addEntrypoint({ key: 'v1/macro/scenario-score', description: 'Score scenario', price: '1.5', input: ScenarioScoreRequestSchema, output: ScenarioScoreResponseSchema, handler: async ctx => ({ output: scoreScenario(ctx.input) }) });

const port = Number(process.env.PORT ?? 3005);
const server = Bun.serve({ port, fetch: app.fetch });
console.log(`📊 Macro Impact API ready at http://${server.hostname}:${server.port}`);
