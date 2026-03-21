import YAML from 'yaml';
import { parse as csvParse } from 'csv-parse/sync';
import { CatalogItemSchema, type CatalogItem } from './types';

export function parseCatalogYaml(content: string): CatalogItem[] {
  const parsed = YAML.parse(content);

  let rawItems: unknown[];

  if (Array.isArray(parsed)) {
    rawItems = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    'products' in parsed &&
    Array.isArray(parsed.products)
  ) {
    rawItems = parsed.products;
  } else {
    throw new Error(
      'YAML must contain a "products" array or be a top-level array',
    );
  }

  const items: CatalogItem[] = [];
  for (const raw of rawItems) {
    const result = CatalogItemSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`Invalid catalog item: ${result.error.message}`);
    }
    items.push(result.data);
  }

  return items;
}

export function parseCatalogCsv(
  content: string,
): CatalogItem[] {
  const records = csvParse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  // Validate key column exists
  if (records.length > 0 && !('key' in records[0])) {
    throw new Error('CSV must have a "key" column');
  }

  const items: CatalogItem[] = [];
  for (const record of records) {
    const metadata: Record<string, unknown> = {};
    let hasMetadata = false;

    for (const [col, val] of Object.entries(record)) {
      if (col.startsWith('meta_')) {
        metadata[col.slice(5)] = val;
        hasMetadata = true;
      }
    }

    const item: CatalogItem = {
      key: record.key,
      name: record.name,
      description: record.description || undefined,
      price:
        record.price && record.price.trim() !== ''
          ? record.price
          : undefined,
      network: record.network || undefined,
      ...(hasMetadata ? { metadata } : {}),
    };

    const result = CatalogItemSchema.safeParse(item);
    if (!result.success) {
      throw new Error(
        `Invalid CSV row for key "${record.key}": ${result.error.message}`,
      );
    }
    items.push(result.data);
  }

  return items;
}
