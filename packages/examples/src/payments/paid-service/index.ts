import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
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

/**
 * Dynamic pricing entrypoint - price varies based on tier query parameter.
 * Uses x402's dynamic pricing feature where price is a function that receives
 * the HTTP request context.
 *
 * How the context works:
 *   1. When a request arrives, the x402 payment middleware intercepts it
 *   2. The middleware creates an HTTPRequestContext from the incoming request:
 *      - context.adapter.getQueryParam('tier') -> reads ?tier= from URL
 *      - context.adapter.getHeader('X-Custom') -> reads request headers
 *      - context.adapter.getPath() -> returns the request path
 *      - context.adapter.getMethod() -> returns GET/POST/etc
 *   3. The middleware calls your price function with this context
 *   4. The resolved price is used to verify the payment amount
 *
 * Pricing tiers:
 *   - standard (default): $0.001 per call
 *   - premium: $0.50 per call
 *
 * Example calls:
 *   curl -X POST "http://localhost:3001/entrypoints/weather/invoke"
 *   curl -X POST "http://localhost:3001/entrypoints/weather/invoke?tier=premium"
 */
addEntrypoint({
  key: 'weather',
  description: 'Get weather data with tier-based dynamic pricing',
  price: context => {
    // The `context` is automatically created by x402 middleware from the HTTP request.
    // It wraps the framework's request object (Hono/Express) in a unified adapter.
    //
    // Available methods on context.adapter:
    //   - getQueryParam(name)  -> Get URL query parameter (?tier=premium)
    //   - getHeader(name)      -> Get request header value
    //   - getPath()            -> Get request path (/entrypoints/weather/invoke)
    //   - getMethod()          -> Get HTTP method (POST)
    //   - getUrl()             -> Get full URL
    //   - getBody()            -> Get parsed request body (if available)
    const tier = context.adapter.getQueryParam?.('tier') ?? 'standard';
    return tier === 'premium' ? '$0.50' : '$0.001';
  },
  input: z.object({
    city: z.string().optional().default('San Francisco'),
  }),
  output: z.object({
    weather: z.string(),
    temperature: z.number(),
    humidity: z.number().optional(),
    windSpeed: z.number().optional(),
    tier: z.string(),
  }),
  handler: async ctx => {
    // Note: The actual tier would be determined by the payment amount verified
    // by the x402 middleware. This is a simplified example.
    const city = ctx.input.city;

    // Premium response with detailed weather data
    return {
      output: {
        weather: 'sunny',
        temperature: 72,
        humidity: 45,
        windSpeed: 12,
        tier: 'premium', // Would be determined by payment verification
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
console.log(
  `   - /entrypoints/weather/invoke - dynamic pricing ($0.001 standard, $0.50 premium)`
);
console.log(`   - /.well-known/agent.json - Agent manifest`);
