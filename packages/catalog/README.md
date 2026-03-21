# @lucid-agents/catalog

YAML/CSV catalog-driven route generation for Lucid Agents.

## Overview

When your agent exposes a large product catalog -- hundreds or thousands of items -- manually calling `addEntrypoint()` for each one becomes unmanageable. Writing 400 entrypoint definitions by hand is tedious, error-prone, and hard to keep in sync with your actual inventory.

`@lucid-agents/catalog` solves this by letting you define your catalog in a YAML or CSV file and automatically generating typed entrypoints at build time. A single `.use(catalog(...))` call replaces hundreds of manual `addEntrypoint()` calls.

Key features:

- **YAML and CSV parsing** -- Define products in the format that fits your workflow
- **Automatic entrypoint generation** -- Each catalog item becomes a discoverable, invocable route
- **Price support** -- Flat prices or separate invoke/stream prices per item
- **Network tagging** -- Per-item or global network assignment in CAIP-2 format
- **Custom metadata** -- Attach arbitrary key-value pairs to catalog items
- **Handler factories** -- Generate route handlers dynamically from catalog data
- **Key prefixing** -- Namespace catalog routes to avoid collisions

## Installation

```bash
bun add @lucid-agents/catalog
```

## Quick Start

Define a catalog file (`products.yaml`):

```yaml
products:
  - key: weather
    name: Weather Lookup
    description: Get current weather for a city
    price: "0.001"
  - key: translate
    name: Translation
    description: Translate text between languages
    price: "0.002"
```

Wire it into your agent:

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { catalog } from '@lucid-agents/catalog';
import { createAgentApp } from '@lucid-agents/hono';

const agent = await createAgent({
  name: 'catalog-agent',
  version: '1.0.0',
  description: 'Agent with catalog-driven routes',
})
  .use(http())
  .use(catalog({ file: './products.yaml' }))
  .build();

const { app } = await createAgentApp(agent);
export default app;
```

Each item in `products.yaml` is now a discoverable entrypoint on your agent.

## YAML Format

YAML catalogs support either a top-level array or an object with a `products` key:

```yaml
products:
  - key: sentiment
    name: Sentiment Analysis
    description: Analyze text sentiment
    price: "0.001"
    network: "eip155:8453"
    metadata:
      category: nlp
      model: gpt-4o-mini
```

### Supported Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Unique route identifier. Becomes the entrypoint key. |
| `name` | `string` | Yes | Human-readable display name. |
| `description` | `string` | No | Description shown in the agent manifest. |
| `price` | `string` or `object` | No | Flat price as a string, or an object with `invoke` and/or `stream` prices. |
| `network` | `string` | No | CAIP-2 network identifier (e.g., `eip155:8453`). |
| `metadata` | `object` | No | Arbitrary key-value pairs attached to the entrypoint. |

### Price Variants

Flat price:

```yaml
- key: summarize
  name: Summarize
  price: "0.005"
```

Separate invoke and stream prices:

```yaml
- key: generate
  name: Generate Text
  price:
    invoke: "0.01"
    stream: "0.002"
```

## CSV Format

CSV catalogs use a header row with the standard fields. Metadata is supported via the `meta_` column prefix convention.

```csv
key,name,description,price,network,meta_category,meta_model
weather,Weather Lookup,Get current weather,0.001,eip155:8453,utility,gpt-4o-mini
translate,Translation,Translate text,0.002,,nlp,gpt-4o
sentiment,Sentiment Analysis,Analyze sentiment,0.001,,nlp,gpt-4o-mini
```

### Column Reference

| Column | Required | Description |
|--------|----------|-------------|
| `key` | Yes | Unique route identifier. |
| `name` | Yes | Display name. |
| `description` | No | Route description. |
| `price` | No | Price as a string value. |
| `network` | No | CAIP-2 network identifier. |
| `meta_*` | No | Any column prefixed with `meta_` is collected into the `metadata` object with the prefix stripped. |

For example, a column named `meta_category` with value `nlp` results in `metadata: { category: "nlp" }`.

Note: CSV does not support the invoke/stream price object syntax. Use YAML if you need separate prices per method.

## API Reference

### `catalog(options)`

Extension factory that reads a catalog file and registers entrypoints at build time.

```typescript
import { catalog } from '@lucid-agents/catalog';

agent.use(catalog({
  file: './products.yaml',
  keyPrefix: 'store/',
  network: 'eip155:8453',
  handlerFactory: (item) => async ({ input }) => {
    return { output: { product: item.key } };
  },
}));
```

**`CatalogExtensionOptions`**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `file` | `string` | Yes | Path to the `.yaml`, `.yml`, or `.csv` catalog file. |
| `keyPrefix` | `string` | No | Prefix prepended to every item key (e.g., `"store/"` turns `"widget"` into `"store/widget"`). |
| `network` | `string` | No | Default CAIP-2 network for items that do not specify their own. |
| `handlerFactory` | `HandlerFactory` | No | Function that receives a `CatalogItem` and returns a handler function. |
| `inputSchema` | `z.ZodTypeAny` | No | Zod schema applied to all generated entrypoints. Defaults to `z.object({ params: z.record(z.string(), z.unknown()).optional() })`. |

### `parseCatalogYaml(content)`

Parses a YAML string into an array of validated `CatalogItem` objects.

```typescript
import { parseCatalogYaml } from '@lucid-agents/catalog';

const items = parseCatalogYaml(`
products:
  - key: weather
    name: Weather Lookup
    price: "0.001"
`);
// items: CatalogItem[]
```

Accepts either a top-level array or an object with a `products` key. Throws if any item fails validation.

### `parseCatalogCsv(content)`

Parses a CSV string into an array of validated `CatalogItem` objects.

```typescript
import { parseCatalogCsv } from '@lucid-agents/catalog';

const items = parseCatalogCsv(`key,name,price
weather,Weather Lookup,0.001
translate,Translation,0.002`);
// items: CatalogItem[]
```

Requires a `key` column. Columns prefixed with `meta_` are collected into the `metadata` field. Throws if any row fails validation.

### `generateEntrypoints(items, options?)`

Converts an array of `CatalogItem` objects into `EntrypointDef` objects ready for registration.

```typescript
import { generateEntrypoints } from '@lucid-agents/catalog';

const entrypoints = generateEntrypoints(items, {
  keyPrefix: 'api/',
  network: 'eip155:8453',
  handlerFactory: (item) => async ({ input }) => {
    return { output: { result: item.name } };
  },
});

for (const ep of entrypoints) {
  runtime.entrypoints.add(ep);
}
```

**`GenerateOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `keyPrefix` | `string` | Prefix prepended to each item key. |
| `network` | `string` | Default network for items without one. |
| `handlerFactory` | `HandlerFactory` | Generates a handler for each item. |
| `inputSchema` | `z.ZodTypeAny` | Input schema for all entrypoints. |

### `CatalogItemSchema`

Zod schema used to validate catalog items. Useful for custom parsing or validation pipelines.

```typescript
import { CatalogItemSchema } from '@lucid-agents/catalog';

const result = CatalogItemSchema.safeParse({
  key: 'test',
  name: 'Test Item',
  price: '0.01',
});
```

### `CatalogItem`

TypeScript type inferred from `CatalogItemSchema`:

```typescript
type CatalogItem = {
  key: string;
  name: string;
  description?: string;
  price?: string | { invoke?: string; stream?: string };
  network?: string;
  metadata?: Record<string, unknown>;
};
```

## Integration Examples

### With x402 Payments

Combine catalog routes with x402 payment gating:

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { catalog } from '@lucid-agents/catalog';
import { createAgentApp } from '@lucid-agents/hono';

const agent = await createAgent({
  name: 'paid-catalog-agent',
  version: '1.0.0',
  description: 'Catalog agent with x402 payments',
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .use(catalog({
    file: './products.yaml',
    handlerFactory: (item) => async ({ input }) => {
      return { output: { product: item.name, data: 'processed' } };
    },
  }))
  .build();

const { app } = await createAgentApp(agent);
export default app;
```

Each catalog item with a `price` field will automatically require x402 payment.

### With MPP (Machine Payments Protocol)

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { mpp, tempo } from '@lucid-agents/mpp';
import { catalog } from '@lucid-agents/catalog';
import { createAgentApp } from '@lucid-agents/hono';

const agent = await createAgent({
  name: 'mpp-catalog-agent',
  version: '1.0.0',
  description: 'Catalog agent with MPP payments',
})
  .use(http())
  .use(mpp({
    config: {
      methods: [tempo.server({ currency: '0x...', recipient: '0x...' })],
      currency: 'usd',
    },
  }))
  .use(catalog({
    file: './services.yaml',
    network: 'eip155:8453',
    handlerFactory: (item) => async ({ input }) => {
      return { output: { service: item.name } };
    },
  }))
  .build();

const { app } = await createAgentApp(agent);
export default app;
```

See `packages/examples/src/catalog/catalog-mpp-store.ts` for a full working example.

### Custom Handler Factory

The handler factory receives the full `CatalogItem`, giving you access to metadata for dynamic behavior:

```typescript
import type { CatalogItem } from '@lucid-agents/catalog';

const handlerFactory = (item: CatalogItem) => async ({ input }: any) => {
  const model = item.metadata?.model as string ?? 'gpt-4o-mini';
  const category = item.metadata?.category as string ?? 'general';

  // Route to different backends based on metadata
  const result = await processWithModel(model, category, input);

  return { output: result };
};

agent.use(catalog({
  file: './products.yaml',
  handlerFactory,
}));
```

### Key Prefix for Namespacing

Use `keyPrefix` to namespace catalog routes, avoiding collisions when loading multiple catalogs:

```typescript
const agent = await createAgent({
  name: 'multi-catalog-agent',
  version: '1.0.0',
})
  .use(http())
  .use(catalog({ file: './nlp-services.yaml', keyPrefix: 'nlp/' }))
  .use(catalog({ file: './vision-services.csv', keyPrefix: 'vision/' }))
  .build();
```

This produces routes like `nlp/sentiment`, `nlp/translate`, `vision/classify`, etc.

## Network Support

Network identifiers follow the [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) format. Common values:

| Network | CAIP-2 ID |
|---------|-----------|
| Base | `eip155:8453` |
| Base Sepolia | `eip155:84532` |
| Ethereum | `eip155:1` |
| Solana Mainnet | `solana:mainnet` |
| Solana Devnet | `solana:devnet` |

Set a default network for all items via the `network` option, or override per item in your catalog file.

## Related Packages

| Package | Description |
|---------|-------------|
| [`@lucid-agents/core`](../core) | Core runtime with extension system and `createAgent()` |
| [`@lucid-agents/http`](../http) | HTTP extension for request handling |
| [`@lucid-agents/payments`](../payments) | x402 payment tracking and policy enforcement |
| [`@lucid-agents/mpp`](../mpp) | Machine Payments Protocol integration |
| [`@lucid-agents/hono`](../hono) | Hono adapter for serving agents over HTTP |
