import { z } from 'zod';
import type {
  EntrypointDef,
  PaymentProtocol,
} from '@lucid-agents/types/core';
import type { CatalogItem, HandlerFactory } from './types';

export type GenerateOptions = {
  keyPrefix?: string;
  network?: string;
  paymentProtocol?: PaymentProtocol;
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
  const {
    keyPrefix,
    network,
    paymentProtocol,
    handlerFactory,
    inputSchema,
  } = options ?? {};

  return items.map((item): EntrypointDef => {
    const key = keyPrefix ? `${keyPrefix}${item.key}` : item.key;
    const entrypointNetwork = item.network ?? network;
    const entrypointPaymentProtocol =
      item.paymentProtocol ?? paymentProtocol;

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
      ...(entrypointPaymentProtocol
        ? { paymentProtocol: entrypointPaymentProtocol }
        : {}),
    };

    if (handlerFactory) {
      entrypoint.handler = handlerFactory(item);
    }

    return entrypoint;
  });
}
