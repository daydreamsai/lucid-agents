import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/http';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

/**
 * Blocked domain service - demonstrates domain-based blocking.
 *
 * This agent is blocked because its domain (http://localhost:3002) is NOT
 * in the allowedRecipients list in payment-policies.json.
 *
 * The wallet address is fine, but the domain is not whitelisted.
 *
 * Policy blocking mechanism: Domain matching
 * - allowedRecipients: ["http://localhost:3001"]  ← Only port 3001 is allowed
 * - This service runs on port 3002  ← NOT in the whitelist
 *
 * Required environment variables (see env.example):
 *   - FACILITATOR_URL - x402 facilitator endpoint
 *   - PAYMENTS_RECEIVABLE_ADDRESS - Valid payment address (not blocked)
 *   - NETWORK - Network identifier (e.g., base-sepolia)
 *
 * Run: bun run packages/examples/src/payments/blocked-domain
 */

const agent = await createAgent({
  name: 'blocked-domain-service',
  version: '1.0.0',
  description: 'Service blocked by domain policy',
})
  .use(http())
  .use(
    payments({
      config: paymentsFromEnv(),
    })
  )
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

/**
 * Simple entrypoint - should be blocked by domain policy
 */
addEntrypoint({
  key: 'test-endpoint',
  description: 'This endpoint should be blocked by domain policy',
  price: '0.01', // $0.01 per call (within spending limits)
  input: z.object({
    message: z.string(),
  }),
  output: z.object({
    message: z.string(),
    warning: z.string(),
  }),
  handler: async ctx => {
    return {
      output: {
        message: ctx.input.message,
        warning: 'This service should have been blocked by domain policy!',
      },
    };
  },
});

const port = Number(process.env.PORT ?? 3002);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `Blocked domain service ready at http://${server.hostname}:${server.port}`
);
console.log(`   BLOCKED BY: Domain not in allowedRecipients list`);
console.log(`   Domain: http://localhost:${port} (not in whitelist)`);
console.log(`   Allowed: http://localhost:3001 only`);
console.log(
  `   Payment address: ${agent.payments?.config.payTo} (address is OK)`
);
console.log(`   - /entrypoints/test-endpoint/invoke - $0.01 per call`);
console.log(`   - /.well-known/agent.json - Agent manifest`);
