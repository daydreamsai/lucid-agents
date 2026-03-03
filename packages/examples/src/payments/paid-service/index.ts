import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/http';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

/**
 * Simple paid service agent that accepts payments.
 *
 * This agent provides paid entrypoints that other agents can call.
 * It's used by the policy-agent to demonstrate payment policy enforcement.
 *
 * Required environment variables (see .env.example):
 *   - FACILITATOR_URL - x402 facilitator endpoint
 *   - PAYMENTS_RECEIVABLE_ADDRESS - Address that receives payments
 *   - NETWORK - Network identifier (e.g., base-sepolia)
 *
 * Run: bun run packages/examples/src/payments/paid-service
 */

const agent = await createAgent({
  name: 'paid-service',
  version: '1.0.0',
  description: 'Service agent with paid entrypoints',
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
 * Simple echo entrypoint - costs $0.01 (1 cent)
 */
addEntrypoint({
  key: 'echo',
  description: 'Echo back your message',
  price: '0.01', // $0.01 per call
  input: z.object({
    message: z.string(),
  }),
  output: z.object({
    message: z.string(),
    timestamp: z.string(),
  }),
  handler: async ctx => {
    return {
      output: {
        message: ctx.input.message,
        timestamp: new Date().toISOString(),
      },
    };
  },
});

/**
 * Process entrypoint - costs $0.05 (5 cents)
 */
addEntrypoint({
  key: 'process',
  description: 'Process an item',
  price: '0.05', // $0.05 per call
  input: z.object({
    item: z.string(),
  }),
  output: z.object({
    result: z.string(),
    processed: z.boolean(),
  }),
  handler: async ctx => {
    return {
      output: {
        result: `Processed: ${ctx.input.item}`,
        processed: true,
      },
    };
  },
});

/**
 * Expensive entrypoint - costs $0.15 (15 cents)
 * This one should be blocked by the policy (over $0.10 limit)
 */
addEntrypoint({
  key: 'expensive',
  description: 'Expensive operation',
  price: '0.15', // $0.15 per call
  input: z.object({
    data: z.unknown(),
  }),
  output: z.object({
    result: z.string(),
  }),
  handler: async ctx => {
    return {
      output: {
        result: 'This should be blocked by policy!',
      },
    };
  },
});

const port = Number(process.env.PORT ?? 3001);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `Paid service agent ready at http://${server.hostname}:${server.port}`
);
console.log(`   - /entrypoints/echo/invoke - $0.01 per call`);
console.log(`   - /entrypoints/process/invoke - $0.05 per call`);
console.log(
  `   - /entrypoints/expensive/invoke - $0.15 per call (should be blocked)`
);
console.log(`   - /.well-known/agent.json - Agent manifest`);
