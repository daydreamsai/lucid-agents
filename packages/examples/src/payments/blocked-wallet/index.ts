import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/http';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

/**
 * Blocked wallet service - demonstrates wallet address blocking.
 *
 * This agent is blocked because its payment wallet address is in the
 * blockedRecipients list in payment-policies.json.
 *
 * The domain might be OK, but the wallet address is explicitly blocked.
 *
 * Policy blocking mechanism: Wallet address matching
 * - blockedRecipients: ["0x1234567890123456789012345678901234567890"]
 * - This service uses that exact address  ← In the blacklist
 *
 * Required environment variables (see env.example):
 *   - FACILITATOR_URL - x402 facilitator endpoint
 *   - PAYMENTS_RECEIVABLE_ADDRESS - The blocked address (0x1234...)
 *   - NETWORK - Network identifier (e.g., base-sepolia)
 *
 * Run: bun run packages/examples/src/payments/blocked-wallet
 */

const agent = await createAgent({
  name: 'blocked-wallet-service',
  version: '1.0.0',
  description: 'Service blocked by wallet address policy',
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
 * Simple entrypoint - should be blocked by wallet address policy
 */
addEntrypoint({
  key: 'test-endpoint',
  description: 'This endpoint should be blocked by wallet address policy',
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
        warning: 'This service should have been blocked by wallet policy!',
      },
    };
  },
});

const port = Number(process.env.PORT ?? 3003);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `Blocked wallet service ready at http://${server.hostname}:${server.port}`
);
console.log(`   BLOCKED BY: Wallet address in blockedRecipients list`);
console.log(`   Payment address: ${agent.payments?.config.payTo} (BLOCKED)`);
console.log(`   Domain: http://localhost:${port} (domain is OK)`);
console.log(`   - /entrypoints/test-endpoint/invoke - $0.01 per call`);
console.log(`   - /.well-known/agent.json - Agent manifest`);
