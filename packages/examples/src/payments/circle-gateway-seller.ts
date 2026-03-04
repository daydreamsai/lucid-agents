/**
 * Circle Gateway Seller Example
 *
 * Demonstrates a Lucid Agent that accepts both standard x402 payments
 * AND Circle Gateway batched payments (gasless for buyers).
 *
 * When `facilitator: 'circle-gateway'` is set, the 402 response includes
 * both `exact` (standard on-chain) and `GatewayWalletBatched` payment
 * options in the `accepts` array. Buyers can choose either path.
 *
 * Environment variables:
 *   FACILITATOR_URL       - x402 facilitator URL
 *   NETWORK               - CAIP-2 network (e.g., eip155:8453)
 *   PAYMENTS_RECEIVABLE_ADDRESS - Seller wallet address
 *   CIRCLE_GATEWAY_FACILITATOR  - Set to 'true' to enable Gateway
 *   CIRCLE_GATEWAY_CHAIN        - Chain name (default: 'base')
 *
 * Usage:
 *   CIRCLE_GATEWAY_FACILITATOR=true bun run src/payments/circle-gateway-seller.ts
 */

import { createAgent, entrypoint } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

const agent = createAgent({
  name: 'circle-gateway-seller',
  version: '1.0.0',
  description: 'Example agent accepting Circle Gateway payments',
})
  .use(http({ port: 3000 }))
  .use(
    payments({
      config: {
        ...paymentsFromEnv(),
        ...(process.env.CIRCLE_GATEWAY_FACILITATOR === 'true'
          ? { facilitator: 'circle-gateway' as const }
          : {}),
      },
    })
  );

// Free health endpoint
agent.add(
  entrypoint({
    key: 'health',
    description: 'Health check (free)',
    schema: { input: z.object({}) },
    handler: async () => ({
      ok: true,
      gateway: process.env.CIRCLE_GATEWAY_FACILITATOR === 'true',
    }),
  })
);

// Paid endpoint — buyers can pay via Gateway (gasless) or standard x402
agent.add(
  entrypoint({
    key: 'premium-content',
    description: 'Premium content endpoint ($0.01/call)',
    price: '$0.01',
    schema: {
      input: z.object({
        topic: z.string().optional(),
      }),
    },
    handler: async ({ input }) => ({
      content: `Premium content about ${input.topic ?? 'everything'}`,
      timestamp: new Date().toISOString(),
    }),
  })
);

agent.start();

console.log('Circle Gateway seller running on http://localhost:3000');
console.log(
  'Gateway enabled:',
  process.env.CIRCLE_GATEWAY_FACILITATOR === 'true'
);
