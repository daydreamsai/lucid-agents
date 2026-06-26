import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { addRiskApiEntrypoints } from '@lucid-agents/risk-api';

/**
 * Counterparty Risk Graph Intelligence API
 *
 * A paid graph-intelligence API that sells wallet/entity clustering,
 * exposure paths, and risk scores via x402 payment protocol.
 *
 * Required environment variables (see .env.example):
 *   - FACILITATOR_URL - x402 facilitator endpoint
 *   - PAYMENTS_RECEIVABLE_ADDRESS - Address that receives payments
 *   - NETWORK - Network identifier (e.g., base-sepolia)
 *
 * Run: bun run packages/examples/src/risk-api
 */

const agent = await createAgent({
  name: 'risk-intelligence',
  version: '1.0.0',
  description: 'Counterparty Risk Graph Intelligence API - Provides wallet/entity clustering, exposure paths, and risk scores',
})
  .use(http())
  .use(
    payments({
      config: paymentsFromEnv(),
    })
  )
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

// Add all risk API entrypoints
addRiskApiEntrypoints({ app, addEntrypoint } as any);

const port = Number(process.env.PORT ?? 3002);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `Risk Intelligence API ready at http://${server.hostname}:${server.port}`
);
console.log(`\nEndpoints:`);
console.log(`   POST /entrypoints/risk-score/invoke - $0.10 per call`);
console.log(`   POST /entrypoints/exposure-paths/invoke - $0.15 per call`);
console.log(`   POST /entrypoints/entity-profile/invoke - $0.20 per call`);
console.log(`\nDiscovery:`);
console.log(`   GET /.well-known/agent.json - Agent manifest`);
console.log(`   GET /entrypoints - List all entrypoints`);
