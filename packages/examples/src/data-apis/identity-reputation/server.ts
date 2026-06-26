import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { ReputationRequestSchema, ReputationResponseSchema, HistoryRequestSchema, HistoryResponseSchema, TrustBreakdownRequestSchema, TrustBreakdownResponseSchema } from './schema';
import { getReputation, getHistory, getTrustBreakdown } from './logic';

const agent = await createAgent({
  name: 'identity-reputation-api',
  version: '1.0.0',
  description: 'ERC-8004 Identity Reputation Signal API for agent buyers',
})
  .use(http())
  .use(payments({
    config: {
      payTo: process.env.PAY_TO_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      network: process.env.NETWORK || 'eip155:84532',
      facilitatorUrl: process.env.FACILITATOR_URL || 'https://facilitator.daydreams.systems',
    },
  }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

addEntrypoint({
  key: 'v1/identity/reputation',
  description: 'Get agent trust score and reputation signals',
  price: '0.75',
  input: ReputationRequestSchema,
  output: ReputationResponseSchema,
  handler: async ctx => ({ output: getReputation(ctx.input) }),
});

addEntrypoint({
  key: 'v1/identity/history',
  description: 'Get agent performance history and events',
  price: '1.0',
  input: HistoryRequestSchema,
  output: HistoryResponseSchema,
  handler: async ctx => ({ output: getHistory(ctx.input) }),
});

addEntrypoint({
  key: 'v1/identity/trust-breakdown',
  description: 'Get detailed trust score breakdown with evidence',
  price: '1.5',
  input: TrustBreakdownRequestSchema,
  output: TrustBreakdownResponseSchema,
  handler: async ctx => ({ output: getTrustBreakdown(ctx.input) }),
});

const port = Number(process.env.PORT ?? 3002);
const server = Bun.serve({ port, fetch: app.fetch });

console.log(`🆔 Identity Reputation API ready at http://${server.hostname}:${server.port}`);
console.log(`   - /entrypoints/v1/identity/reputation/invoke - $0.75`);
console.log(`   - /entrypoints/v1/identity/history/invoke - $1.00`);
console.log(`   - /entrypoints/v1/identity/trust-breakdown/invoke - $1.50`);
