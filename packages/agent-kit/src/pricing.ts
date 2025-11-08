import type { EntrypointDef, PaymentsConfig } from './types';

export function resolveEntrypointPrice(
  entrypoint: EntrypointDef,
  payments: PaymentsConfig | undefined,
  which: 'invoke' | 'stream'
): string | undefined {
  if (typeof entrypoint.price === 'string') return entrypoint.price;
  if (typeof entrypoint.price === 'object' && entrypoint.price) {
    const value = entrypoint.price[which];
    if (value) return value;
  }
  return payments?.defaultPrice;
}
