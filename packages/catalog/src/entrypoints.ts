import { z } from 'zod';
import type { EntrypointDef } from '@lucid-agents/types/core';
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
): EntrypointDef[] {
  const { keyPrefix, network, handlerFactory, inputSchema } = options ?? {};

  return items.map((item): EntrypointDef => {
    const key = keyPrefix ? `${keyPrefix}${item.key}` : item.key;
    const entrypointNetwork = item.network ?? network;

    const metadata = {
      ...item.metadata,
      catalogItem: item,
    };

    const entrypoint: EntrypointDef = {
      key,
      description: item.description,
      price: item.price as EntrypointDef['price'],
      input: inputSchema ?? defaultInputSchema,
      metadata,
      ...(entrypointNetwork ? { network: entrypointNetwork as EntrypointDef['network'] } : {}),
    };

    if (handlerFactory) {
      entrypoint.handler = handlerFactory(item) as EntrypointDef['handler'];
    }

    return entrypoint;
  });
}
