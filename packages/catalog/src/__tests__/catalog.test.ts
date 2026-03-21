import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { z } from 'zod';

// Types we'll implement
import {
  parseCatalogYaml,
  parseCatalogCsv,
  type CatalogItem,
  type CatalogConfig,
  CatalogItemSchema,
  generateEntrypoints,
  catalog,
} from '../index';

describe('CatalogItemSchema', () => {
  it('validates a complete catalog item', () => {
    const item = {
      key: 'product-1',
      name: 'Premium API Call',
      description: 'Get premium data',
      price: '0.50',
    };
    const result = CatalogItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('validates item with invoke/stream pricing', () => {
    const item = {
      key: 'product-2',
      name: 'Streaming API',
      description: 'Stream data',
      price: { invoke: '1.00', stream: '0.10' },
    };
    const result = CatalogItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('validates item with metadata', () => {
    const item = {
      key: 'product-3',
      name: 'Custom Product',
      description: 'A product',
      price: '2.00',
      metadata: { category: 'ai', tier: 'premium' },
    };
    const result = CatalogItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('rejects item without key', () => {
    const item = { name: 'No Key', price: '1.00' };
    const result = CatalogItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it('rejects item without name', () => {
    const item = { key: 'no-name', price: '1.00' };
    const result = CatalogItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it('allows item without price (free)', () => {
    const item = { key: 'free-item', name: 'Free Thing', description: 'Free' };
    const result = CatalogItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it('validates item with network field', () => {
    const item = {
      key: 'net-item',
      name: 'Network Product',
      price: '1.00',
      network: 'base-sepolia',
    };
    const result = CatalogItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });
});

describe('parseCatalogYaml', () => {
  it('parses a simple YAML catalog', () => {
    const yamlContent = `
products:
  - key: widget-a
    name: Widget A
    description: A fine widget
    price: "1.00"
  - key: widget-b
    name: Widget B
    description: Another widget
    price: "2.50"
`;
    const items = parseCatalogYaml(yamlContent);
    expect(items).toHaveLength(2);
    expect(items[0].key).toBe('widget-a');
    expect(items[0].name).toBe('Widget A');
    expect(items[0].price).toBe('1.00');
    expect(items[1].key).toBe('widget-b');
    expect(items[1].price).toBe('2.50');
  });

  it('parses YAML with invoke/stream pricing', () => {
    const yamlContent = `
products:
  - key: streaming-api
    name: Streaming API
    description: Streamed data
    price:
      invoke: "5.00"
      stream: "0.50"
`;
    const items = parseCatalogYaml(yamlContent);
    expect(items).toHaveLength(1);
    expect(items[0].price).toEqual({ invoke: '5.00', stream: '0.50' });
  });

  it('parses YAML with metadata', () => {
    const yamlContent = `
products:
  - key: premium
    name: Premium
    description: Premium tier
    price: "10.00"
    metadata:
      tier: premium
      rateLimit: 1000
`;
    const items = parseCatalogYaml(yamlContent);
    expect(items[0].metadata).toEqual({ tier: 'premium', rateLimit: 1000 });
  });

  it('parses YAML with network field', () => {
    const yamlContent = `
products:
  - key: solana-product
    name: Solana Product
    price: "1.00"
    network: solana-devnet
`;
    const items = parseCatalogYaml(yamlContent);
    expect(items[0].network).toBe('solana-devnet');
  });

  it('supports flat array format (no products wrapper)', () => {
    const yamlContent = `
- key: item-1
  name: Item 1
  price: "1.00"
- key: item-2
  name: Item 2
  price: "2.00"
`;
    const items = parseCatalogYaml(yamlContent);
    expect(items).toHaveLength(2);
  });

  it('throws on invalid YAML structure', () => {
    expect(() => parseCatalogYaml('not: valid: yaml: [')).toThrow();
  });

  it('throws on items missing required fields', () => {
    const yamlContent = `
products:
  - description: no key or name
    price: "1.00"
`;
    expect(() => parseCatalogYaml(yamlContent)).toThrow();
  });
});

describe('parseCatalogCsv', () => {
  it('parses a simple CSV catalog', async () => {
    const csvContent = `key,name,description,price
widget-a,Widget A,A fine widget,1.00
widget-b,Widget B,Another widget,2.50`;
    const items = await parseCatalogCsv(csvContent);
    expect(items).toHaveLength(2);
    expect(items[0].key).toBe('widget-a');
    expect(items[0].name).toBe('Widget A');
    expect(items[0].price).toBe('1.00');
  });

  it('handles quoted fields with commas', async () => {
    const csvContent = `key,name,description,price
api-1,"Advanced API","AI-powered, real-time data",3.00`;
    const items = await parseCatalogCsv(csvContent);
    expect(items[0].description).toBe('AI-powered, real-time data');
  });

  it('handles empty price as free', async () => {
    const csvContent = `key,name,description,price
free-item,Free Item,No cost,`;
    const items = await parseCatalogCsv(csvContent);
    expect(items[0].price).toBeUndefined();
  });

  it('parses CSV with network column', async () => {
    const csvContent = `key,name,description,price,network
sol-item,Sol Item,On Solana,1.00,solana-devnet`;
    const items = await parseCatalogCsv(csvContent);
    expect(items[0].network).toBe('solana-devnet');
  });

  it('parses CSV with metadata columns (prefixed with meta_)', async () => {
    const csvContent = `key,name,description,price,meta_category,meta_tier
premium,Premium,Top tier,10.00,ai,premium`;
    const items = await parseCatalogCsv(csvContent);
    expect(items[0].metadata).toEqual({ category: 'ai', tier: 'premium' });
  });

  it('throws on CSV missing key column', async () => {
    const csvContent = `name,description,price
Widget,A widget,1.00`;
    await expect(parseCatalogCsv(csvContent)).rejects.toThrow();
  });
});

describe('generateEntrypoints', () => {
  const sampleItems: CatalogItem[] = [
    { key: 'widget-a', name: 'Widget A', description: 'A widget', price: '1.00' },
    { key: 'widget-b', name: 'Widget B', description: 'B widget', price: '2.50' },
  ];

  it('generates one entrypoint per catalog item', () => {
    const entrypoints = generateEntrypoints(sampleItems);
    expect(entrypoints).toHaveLength(2);
    expect(entrypoints[0].key).toBe('widget-a');
    expect(entrypoints[1].key).toBe('widget-b');
  });

  it('sets price on entrypoints', () => {
    const entrypoints = generateEntrypoints(sampleItems);
    expect(entrypoints[0].price).toBe('1.00');
    expect(entrypoints[1].price).toBe('2.50');
  });

  it('sets description from catalog item', () => {
    const entrypoints = generateEntrypoints(sampleItems);
    expect(entrypoints[0].description).toBe('A widget');
  });

  it('generates entrypoints with invoke/stream pricing', () => {
    const items: CatalogItem[] = [
      { key: 'stream-api', name: 'Stream', price: { invoke: '5.00', stream: '0.50' } },
    ];
    const entrypoints = generateEntrypoints(items);
    expect(entrypoints[0].price).toEqual({ invoke: '5.00', stream: '0.50' });
  });

  it('generates entrypoints without price for free items', () => {
    const items: CatalogItem[] = [
      { key: 'free-item', name: 'Free' },
    ];
    const entrypoints = generateEntrypoints(items);
    expect(entrypoints[0].price).toBeUndefined();
  });

  it('passes metadata through to entrypoint', () => {
    const items: CatalogItem[] = [
      { key: 'meta-item', name: 'Meta', price: '1.00', metadata: { tier: 'gold' } },
    ];
    const entrypoints = generateEntrypoints(items);
    expect(entrypoints[0].metadata).toEqual({ tier: 'gold', catalogItem: items[0] });
  });

  it('applies custom handler factory when provided', () => {
    const handlerFactory = (item: CatalogItem) => {
      return async (ctx: any) => ({ output: { product: item.key } });
    };
    const entrypoints = generateEntrypoints(sampleItems, { handlerFactory });
    expect(entrypoints[0].handler).toBeDefined();
  });

  it('applies key prefix when provided', () => {
    const entrypoints = generateEntrypoints(sampleItems, { keyPrefix: 'shop/' });
    expect(entrypoints[0].key).toBe('shop/widget-a');
    expect(entrypoints[1].key).toBe('shop/widget-b');
  });

  it('applies network override to all entrypoints', () => {
    const entrypoints = generateEntrypoints(sampleItems, { network: 'base-sepolia' });
    expect(entrypoints[0].network).toBe('base-sepolia');
    expect(entrypoints[1].network).toBe('base-sepolia');
  });

  it('item-level network overrides global network', () => {
    const items: CatalogItem[] = [
      { key: 'item', name: 'Item', price: '1.00', network: 'solana-devnet' },
    ];
    const entrypoints = generateEntrypoints(items, { network: 'base-sepolia' });
    expect(entrypoints[0].network).toBe('solana-devnet');
  });

  it('sets default input schema with product key', () => {
    const entrypoints = generateEntrypoints(sampleItems);
    // Should have a basic input schema
    expect(entrypoints[0].input).toBeDefined();
  });

  it('applies custom input schema when provided', () => {
    const customInput = z.object({ quantity: z.number() });
    const entrypoints = generateEntrypoints(sampleItems, { inputSchema: customInput });
    expect(entrypoints[0].input).toBe(customInput);
  });
});

describe('catalog extension', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `catalog-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates a valid extension object', () => {
    const yamlPath = join(tmpDir, 'products.yaml');
    writeFileSync(yamlPath, `
products:
  - key: test
    name: Test
    price: "1.00"
`);
    const ext = catalog({ file: yamlPath });
    expect(ext.name).toBe('catalog');
    expect(ext.build).toBeDefined();
  });

  it('build returns catalog runtime with items', () => {
    const yamlPath = join(tmpDir, 'products.yaml');
    writeFileSync(yamlPath, `
products:
  - key: test-product
    name: Test Product
    price: "1.00"
  - key: another
    name: Another
    price: "2.00"
`);
    const ext = catalog({ file: yamlPath });
    const result = ext.build({ meta: { name: 'test', version: '1.0.0' }, runtime: {} });
    expect(result.catalog).toBeDefined();
    expect(result.catalog!.items).toHaveLength(2);
    expect(result.catalog!.items[0].key).toBe('test-product');
  });

  it('onBuild registers entrypoints from catalog', async () => {
    const yamlPath = join(tmpDir, 'products.yaml');
    writeFileSync(yamlPath, `
products:
  - key: alpha
    name: Alpha
    description: Alpha product
    price: "1.00"
  - key: beta
    name: Beta
    description: Beta product
    price: "2.00"
`);
    const ext = catalog({ file: yamlPath });
    ext.build({ meta: { name: 'test', version: '1.0.0' }, runtime: {} });

    // Simulate runtime with entrypoints.add
    const added: any[] = [];
    const mockRuntime = {
      entrypoints: {
        add: (def: any) => added.push(def),
        list: () => [],
        snapshot: () => [],
      },
    } as any;

    await ext.onBuild!(mockRuntime);
    expect(added).toHaveLength(2);
    expect(added[0].key).toBe('alpha');
    expect(added[0].price).toBe('1.00');
    expect(added[1].key).toBe('beta');
  });

  it('loads CSV files', async () => {
    const csvPath = join(tmpDir, 'products.csv');
    writeFileSync(csvPath, `key,name,description,price
item-1,Item 1,First item,1.00
item-2,Item 2,Second item,2.00`);
    const ext = catalog({ file: csvPath });
    // CSV loading is async, happens in onBuild
    ext.build({ meta: { name: 'test', version: '1.0.0' }, runtime: {} });

    const added: any[] = [];
    const mockRuntime = {
      entrypoints: {
        add: (def: any) => added.push(def),
        list: () => [],
        snapshot: () => [],
      },
    } as any;

    await ext.onBuild!(mockRuntime);
    expect(added).toHaveLength(2);
    expect(added[0].key).toBe('item-1');
  });

  it('applies handlerFactory from options', async () => {
    const yamlPath = join(tmpDir, 'products.yaml');
    writeFileSync(yamlPath, `
products:
  - key: test
    name: Test
    price: "1.00"
`);
    const handlerFactory = (item: CatalogItem) => {
      return async () => ({ output: { product: item.key, price: item.price } });
    };
    const ext = catalog({ file: yamlPath, handlerFactory });
    ext.build({ meta: { name: 'test', version: '1.0.0' }, runtime: {} });

    const added: any[] = [];
    const mockRuntime = {
      entrypoints: {
        add: (def: any) => added.push(def),
        list: () => [],
        snapshot: () => [],
      },
    } as any;

    await ext.onBuild!(mockRuntime);
    expect(added[0].handler).toBeDefined();
    const result = await added[0].handler({});
    expect(result.output.product).toBe('test');
  });

  it('applies keyPrefix from options', async () => {
    const yamlPath = join(tmpDir, 'products.yaml');
    writeFileSync(yamlPath, `
products:
  - key: test
    name: Test
    price: "1.00"
`);
    const ext = catalog({ file: yamlPath, keyPrefix: 'store/' });
    ext.build({ meta: { name: 'test', version: '1.0.0' }, runtime: {} });

    const added: any[] = [];
    const mockRuntime = {
      entrypoints: {
        add: (def: any) => added.push(def),
        list: () => [],
        snapshot: () => [],
      },
    } as any;

    await ext.onBuild!(mockRuntime);
    expect(added[0].key).toBe('store/test');
  });

  it('throws if file does not exist', () => {
    const ext = catalog({ file: '/nonexistent/path.yaml' });
    expect(() => ext.build({ meta: { name: 'test', version: '1.0.0' }, runtime: {} })).toThrow();
  });
});
