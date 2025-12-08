import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { z } from 'zod';

/**
 * Simple paid service agent that accepts payments.
 *
 * This agent provides paid entrypoints that other agents can call.
 * It's used by policy-agent.ts to demonstrate payment policy enforcement.
 *
 * Run on port 3001: PORT=3001 bun run packages/examples/src/payments/paid-service.ts
 */

const agent = await createAgent({
  name: 'paid-service',
  version: '1.0.0',
  description: 'Service agent with paid entrypoints',
})
  .use(http())
  .use(
    payments({
      config: {
        payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // Hardhat account #1
        network: 'base-sepolia',
        facilitatorUrl: 'https://facilitator.daydreams.systems',
      },
    })
  )
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

/**
 * Simple echo entrypoint - costs $1.00
 */
addEntrypoint({
  key: 'echo',
  description: 'Echo back your message',
  price: '1.0', // $1.00 per call
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
 * Process entrypoint - costs $5.00
 */
addEntrypoint({
  key: 'process',
  description: 'Process an item',
  price: '5.0', // $5.00 per call
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
 * Expensive entrypoint - costs $15.00
 * This one should be blocked by the policy (over $10 limit)
 */
addEntrypoint({
  key: 'expensive',
  description: 'Expensive operation',
  price: '15.0', // $15.00 per call
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
console.log(`   - /entrypoints/echo/invoke - $1.00 per call`);
console.log(`   - /entrypoints/process/invoke - $5.00 per call`);
console.log(
  `   - /entrypoints/expensive/invoke - $15.00 per call (should be blocked)`
);
console.log(`   - /.well-known/agent.json - Agent manifest`);
