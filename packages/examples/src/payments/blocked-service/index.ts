import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

/**
 * Blocked service agent for testing policy enforcement.
 *
 * This agent is configured to be BLOCKED by the policy-agent's policies:
 * 1. Runs on port 3002 (different from allowed service on 3001)
 * 2. Uses a wallet address that's in the blockedRecipients list
 *
 * This demonstrates two blocking scenarios:
 * - Domain blocking: http://localhost:3002 is not in allowedRecipients
 * - Address blocking: The payment address is in blockedRecipients
 *
 * Required environment variables (see env.example):
 *   - FACILITATOR_URL - x402 facilitator endpoint
 *   - PAYMENTS_RECEIVABLE_ADDRESS - Blocked address (0x1234...)
 *   - NETWORK - Network identifier (e.g., base-sepolia)
 *
 * Run: bun run packages/examples/src/payments/blocked-service
 */

const agent = await createAgent({
  name: 'blocked-service',
  version: '1.0.0',
  description: 'Service agent that should be blocked by policies',
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
 * Simple entrypoint - should be blocked by policy
 */
addEntrypoint({
  key: 'blocked-endpoint',
  description: 'This endpoint should be blocked by payment policies',
  price: '0.01', // $0.01 per call (within per-payment limits)
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
        warning: 'This service should have been blocked by policies!',
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
  `Blocked service agent ready at http://${server.hostname}:${server.port}`
);
console.log(`   This service should be BLOCKED by policy-agent policies:`);
console.log(
  `   1. Domain http://localhost:${port} is not in allowedRecipients`
);
console.log(
  `   2. Payment address ${agent.payments?.config.payTo} is in blockedRecipients`
);
console.log(`   - /entrypoints/blocked-endpoint/invoke - $0.01 per call`);
console.log(`   - /.well-known/agent.json - Agent manifest`);
