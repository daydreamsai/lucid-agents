import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import {
  DemandIndexRequestSchema,
  DemandIndexResponseSchema,
  DemandTrendRequestSchema,
  DemandTrendResponseSchema,
  DemandAnomaliesRequestSchema,
  DemandAnomaliesResponseSchema,
} from './schema';
import {
  calculateDemandIndex,
  calculateDemandTrend,
  detectDemandAnomalies,
} from './logic';

/**
 * Geo Demand Pulse Index API
 * 
 * A paid geo-demand API that sells ZIP/city-level demand indices,
 * trend velocity, and anomaly flags for agent consumers.
 * 
 * Run: PORT=3001 bun run packages/examples/src/data-apis/geo-demand/server.ts
 */

const agent = await createAgent({
  name: 'geo-demand-api',
  version: '1.0.0',
  description: 'Geo Demand Pulse Index API for agent buyers',
})
  .use(http())
  .use(
    payments({
      config: {
        payTo: process.env.PAY_TO_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        network: process.env.NETWORK || 'eip155:84532',
        facilitatorUrl: process.env.FACILITATOR_URL || 'https://facilitator.daydreams.systems',
      },
    })
  )
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

/**
 * GET /v1/demand/index - Get demand index for a location
 * Price: $0.50 per request
 */
addEntrypoint({
  key: 'v1/demand/index',
  description: 'Get demand index for a geographic location',
  price: '0.5',
  input: DemandIndexRequestSchema,
  output: DemandIndexResponseSchema,
  handler: async ctx => {
    const result = calculateDemandIndex(ctx.input);
    return { output: result };
  },
});

/**
 * GET /v1/demand/trend - Get demand trend velocity
 * Price: $0.75 per request
 */
addEntrypoint({
  key: 'v1/demand/trend',
  description: 'Get demand trend velocity and momentum',
  price: '0.75',
  input: DemandTrendRequestSchema,
  output: DemandTrendResponseSchema,
  handler: async ctx => {
    const result = calculateDemandTrend(ctx.input);
    return { output: result };
  },
});

/**
 * GET /v1/demand/anomalies - Get demand anomaly flags
 * Price: $1.00 per request
 */
addEntrypoint({
  key: 'v1/demand/anomalies',
  description: 'Detect demand anomalies and deviations',
  price: '1.0',
  input: DemandAnomaliesRequestSchema,
  output: DemandAnomaliesResponseSchema,
  handler: async ctx => {
    const result = detectDemandAnomalies(ctx.input);
    return { output: result };
  },
});

const port = Number(process.env.PORT ?? 3001);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`🌍 Geo Demand API ready at http://${server.hostname}:${server.port}`);
console.log(`   - /entrypoints/v1/demand/index/invoke - $0.50`);
console.log(`   - /entrypoints/v1/demand/trend/invoke - $0.75`);
console.log(`   - /entrypoints/v1/demand/anomalies/invoke - $1.00`);
console.log(`   - /.well-known/agent.json - Agent manifest`);
