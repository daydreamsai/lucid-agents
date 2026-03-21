import { catalog, type CatalogItem } from '@lucid-agents/catalog';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { mpp, tempo } from '@lucid-agents/mpp';
import { join } from 'path';

/**
 * Catalog + MPP Store Agent
 *
 * Demonstrates how to generate hundreds of paid entrypoint routes from a single
 * YAML catalog file, with payments enforced via Machine Payments Protocol (MPP).
 *
 * Instead of writing 10+ addEntrypoint() calls manually, the catalog extension
 * reads products.yaml and auto-registers each product as a paid route.
 *
 * Run: bun run packages/examples/src/catalog/catalog-mpp-store.ts
 *
 * Environment variables:
 *   MPP_TEMPO_CURRENCY     - Token address (default: pathUSD contract)
 *   MPP_TEMPO_RECIPIENT    - Recipient wallet address (default: dev wallet)
 *   PORT                   - Server port (default: 3000)
 */

// ─── Handler Factory ─────────────────────────────────────────────
// Each catalog item gets its own handler via this factory.
// In production, you'd route to actual AI models or services.

const handlerFactory = (item: CatalogItem) => {
  return async (ctx: { input: { params?: Record<string, unknown> } }) => {
    return {
      output: {
        product: item.key,
        name: item.name,
        description: item.description ?? 'No description',
        price: item.price ?? 'free',
        metadata: item.metadata ?? {},
        params: ctx.input.params ?? {},
        timestamp: new Date().toISOString(),
      },
    };
  };
};

// ─── Agent Setup ─────────────────────────────────────────────────

const catalogFile = join(import.meta.dir, 'products.yaml');

const agent = await createAgent({
  name: 'catalog-mpp-store',
  version: '1.0.0',
  description: 'AI service marketplace powered by YAML catalog + MPP payments',
})
  .use(http())
  .use(
    mpp({
      config: {
        methods: [
          tempo.server({
            currency:
              process.env.MPP_TEMPO_CURRENCY ??
              '0x20c0000000000000000000000000000000000000', // pathUSD
            recipient:
              process.env.MPP_TEMPO_RECIPIENT ??
              '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // dev wallet
          }),
        ],
        currency: 'usd',
        defaultIntent: 'charge',
      },
    })
  )
  .use(
    catalog({
      file: catalogFile,
      keyPrefix: 'store/',
      handlerFactory,
    })
  )
  .build();

// ─── Access Catalog at Runtime ───────────────────────────────────
// The catalog runtime exposes parsed items for introspection.

const items: CatalogItem[] =
  (agent as unknown as { catalog?: { items: CatalogItem[] } }).catalog?.items ??
  [];
console.log(`\nLoaded ${items.length} products from catalog\n`);

// ─── Create Hono App ─────────────────────────────────────────────

const { app } = await createAgentApp(agent);

// ─── Start Server ────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `Catalog MPP Store ready at http://${server.hostname}:${server.port}\n`
);
console.log('Endpoints:');
console.log('  GET  /                           -> Landing page');
console.log('  GET  /.well-known/agent.json     -> Agent manifest');
console.log('');

// List all catalog-generated routes with prices
for (const item of items) {
  const key = `store/${item.key}`;
  const price =
    typeof item.price === 'object'
      ? `invoke: $${item.price.invoke ?? '0'}, stream: $${item.price.stream ?? '0'}`
      : item.price
        ? `$${item.price}`
        : 'free';
  const tier = item.metadata?.tier ?? '-';
  console.log(
    `  POST /entrypoints/${key}/invoke  -> ${item.name} (${price}) [${tier}]`
  );
}

console.log(
  '\nPayment: Machine Payments Protocol (HTTP 402 + WWW-Authenticate)'
);
console.log('Methods: tempo (stablecoin)\n');
