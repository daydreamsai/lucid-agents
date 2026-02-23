/**
 * ClawdTalk Voice Integration Example
 *
 * Demonstrates how to connect a Daydreams agent to ClawdTalk for voice calls.
 * Your agent gets a real phone number and can take orders by voice.
 *
 * Run: bun run packages/examples/src/clawdtalk-voice/index.ts
 *
 * Environment variables:
 *   PAYMENTS_RECEIVABLE_ADDRESS - Wallet address for payments (optional)
 *   PORT - Server port (defaults to 8787)
 */

import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { z } from 'zod';

// Sample product catalog for the commerce agent
const PRODUCTS = [
  { id: 'coffee', name: 'Premium Coffee', price: 12.99 },
  { id: 'tea', name: 'Organic Tea Blend', price: 8.99 },
  { id: 'mug', name: 'Ceramic Mug', price: 15.99 },
];

// In-memory order tracking (use a database in production)
const orders: Map<string, { items: string[]; total: number }> = new Map();

// Voice context for ClawdTalk - keeps responses phone-friendly
const VOICE_CONTEXT = `[VOICE CALL] Speak naturally. Keep responses under 3 sentences.
No markdown, no bullet points, no URLs. Be helpful and friendly.
You are a commerce assistant. Help customers browse products and place orders.

Products: ${PRODUCTS.map(p => `${p.name} ($${p.price})`).join(', ')}`;

async function main() {
  // Build agent with HTTP extension
  const agentBuilder = createAgent({
    name: 'clawdtalk-commerce-agent',
    version: '1.0.0',
    description: 'Voice-enabled commerce agent powered by ClawdTalk',
  }).use(http());

  // Add payments if configured (for monetized entrypoints)
  const payTo = process.env.PAYMENTS_RECEIVABLE_ADDRESS;
  if (payTo) {
    agentBuilder.use(
      payments({
        config: {
          payTo,
          network: 'eip155:84532', // Base Sepolia testnet
          facilitatorUrl: 'https://facilitator.daydreams.systems',
        },
      })
    );
  }

  const agent = await agentBuilder.build();
  const { app, addEntrypoint } = await createAgentApp(agent);

  // Browse products entrypoint (free)
  addEntrypoint({
    key: 'browse',
    description: 'List available products',
    input: z.object({}),
    output: z.object({
      products: z.array(
        z.object({ id: z.string(), name: z.string(), price: z.number() })
      ),
    }),
    handler: async () => ({
      output: { products: PRODUCTS },
    }),
  });

  // Place order entrypoint
  addEntrypoint({
    key: 'order',
    description: 'Place an order for products',
    input: z.object({
      orderId: z.string(),
      items: z.array(z.string()),
    }),
    output: z.object({
      success: z.boolean(),
      total: z.number(),
      message: z.string(),
    }),
    handler: async ctx => {
      const { orderId, items } = ctx.input;

      // Validate item IDs against the PRODUCTS catalog
      const validItems: string[] = [];
      const invalidItems: string[] = [];

      for (const id of items) {
        if (PRODUCTS.find(p => p.id === id)) {
          validItems.push(id);
        } else {
          invalidItems.push(id);
        }
      }

      // Recompute total using only validated products
      const total = validItems.reduce((sum, id) => {
        const product = PRODUCTS.find(p => p.id === id)!;
        return sum + product.price;
      }, 0);

      orders.set(orderId, { items: validItems, total });

      let message = `Order ${orderId} placed for ${validItems.join(', ')}. Total: $${total.toFixed(2)}`;
      if (invalidItems.length > 0) {
        message += ` Warning: Invalid item IDs ignored: ${invalidItems.join(', ')}`;
      }

      return {
        output: {
          success: true,
          total,
          message,
        },
      };
    },
  });

  // Check order status
  addEntrypoint({
    key: 'status',
    description: 'Check order status by ID',
    input: z.object({ orderId: z.string() }),
    output: z.object({
      found: z.boolean(),
      order: z.optional(
        z.object({ items: z.array(z.string()), total: z.number() })
      ),
    }),
    handler: async ctx => {
      const order = orders.get(ctx.input.orderId);
      return {
        output: {
          found: !!order,
          order,
        },
      };
    },
  });

  // Voice context endpoint for ClawdTalk integration
  addEntrypoint({
    key: 'voice-context',
    description: 'Get voice context for ClawdTalk',
    input: z.object({}),
    output: z.object({ context: z.string() }),
    handler: async () => ({
      output: { context: VOICE_CONTEXT },
    }),
  });

  // Start server
  const port = Number(process.env.PORT ?? 8787);
  const server = Bun.serve({
    port,
    fetch: app.fetch,
  });

  console.log(`[clawdtalk-voice] Agent running at http://localhost:${port}`);
  console.log(`[clawdtalk-voice] Entrypoints:`);
  console.log(`  - /entrypoints/browse/invoke`);
  console.log(`  - /entrypoints/order/invoke`);
  console.log(`  - /entrypoints/status/invoke`);
  console.log(`  - /entrypoints/voice-context/invoke`);
  console.log();
  console.log(`To connect ClawdTalk:`);
  console.log(`  1. Get API key from https://clawdtalk.com`);
  console.log(`  2. Set CLAWDTALK_API_KEY environment variable`);
  console.log(`  3. Connect WebSocket client to ClawdTalk server`);
  console.log(`  4. Call your ClawdTalk phone number to interact`);
}

main().catch(err => {
  console.error('[clawdtalk-voice] Fatal error:', err);
  process.exit(1);
});
