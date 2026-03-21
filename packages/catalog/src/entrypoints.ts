import { z } from 'zod';
import type { CatalogItem, HandlerFactory } from './types';

export type GenerateOptions = {
  keyPrefix?: string;
  network?: string;
  handlerFactory?: HandlerFactory;
  inputSchema?: z.ZodTypeAny;
};

const defaultInputSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
});

export function generateEntrypoints(
  items: CatalogItem[],
  options?: GenerateOptions,
): any[] {
  const { keyPrefix, network, handlerFactory, inputSchema } = options ?? {};

  return items.map((item) => {
    const key = keyPrefix ? `${keyPrefix}${item.key}` : item.key;
    const entrypointNetwork = item.network ?? network;

    const metadata = {
      ...item.metadata,
      catalogItem: item,
    };

    const entrypoint: Record<string, unknown> = {
      key,
      description: item.description,
      price: item.price,
      input: inputSchema ?? defaultInputSchema,
      metadata,
    };

    if (entrypointNetwork) {
      entrypoint.network = entrypointNetwork;
    }

    if (handlerFactory) {
      entrypoint.handler = handlerFactory(item);
    }

    return entrypoint;
  });
}
