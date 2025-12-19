import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig, PriceOrFn } from '@lucid-agents/types/payments';

/**
 * Resolves the price for an entrypoint.
 * Returns null if no price is explicitly set on the entrypoint.
 * Supports both static prices (string/number) and dynamic prices (function).
 */
export function resolvePrice(
  entrypoint: EntrypointDef,
  payments: PaymentsConfig | undefined,
  which: 'invoke' | 'stream'
): PriceOrFn | null {
  if (!entrypoint.price) {
    return null;
  }

  // Static string or number price
  if (typeof entrypoint.price === 'string' || typeof entrypoint.price === 'number') {
    return entrypoint.price;
  }

  // Dynamic price function
  if (typeof entrypoint.price === 'function') {
    return entrypoint.price;
  }

  // Object with invoke/stream prices (each can be static or dynamic)
  const priceConfig = entrypoint.price as { invoke?: PriceOrFn; stream?: PriceOrFn };
  return priceConfig[which] ?? null;
}
