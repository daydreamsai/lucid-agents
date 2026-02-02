import type { EntrypointDef } from '@lucid-agents/types/core';
import type {
  EntrypointPrice,
  PaymentsConfig,
} from '@lucid-agents/types/payments';

/**
 * Validates that a price value is in the correct format.
 * Valid formats:
 * - string: "20000" (flat price for both invoke and stream)
 * - object: { invoke?: string; stream?: string }
 *
 * Invalid formats (will log warning):
 * - { amount: number } - common mistake, should be string "20000"
 * - number - should be string
 */
function validatePriceFormat(
  price: unknown,
  entrypointKey: string
): price is EntrypointPrice {
  if (typeof price === 'string') {
    return true;
  }

  if (price && typeof price === 'object') {
    const priceObj = price as Record<string, unknown>;

    if ('amount' in priceObj) {
      console.warn(
        `[lucid-agents/payments] Invalid price format for entrypoint "${entrypointKey}": ` +
          `{ amount: ${priceObj.amount} } is not valid. ` +
          `Use string format: price: "${priceObj.amount}" or object format: { invoke: "${priceObj.amount}" }`
      );
      return false;
    }

    const hasValidKeys = Object.keys(priceObj).every(
      key => key === 'invoke' || key === 'stream'
    );
    const hasValidValues = Object.values(priceObj).every(
      val => val === undefined || typeof val === 'string'
    );

    if (!hasValidKeys || !hasValidValues) {
      console.warn(
        `[lucid-agents/payments] Invalid price format for entrypoint "${entrypointKey}": ` +
          `Expected { invoke?: string; stream?: string } but got ${JSON.stringify(price)}`
      );
      return false;
    }

    return true;
  }

  if (typeof price === 'number') {
    console.warn(
      `[lucid-agents/payments] Invalid price format for entrypoint "${entrypointKey}": ` +
        `Price must be a string, not a number. Use: price: "${price}"`
    );
    return false;
  }

  return false;
}

/**
 * Resolves the price for an entrypoint.
 * Returns null if no price is explicitly set on the entrypoint or if the format is invalid.
 */
export function resolvePrice(
  entrypoint: EntrypointDef,
  payments: PaymentsConfig | undefined,
  which: 'invoke' | 'stream'
): string | null {
  if (!entrypoint.price) {
    return null;
  }

  if (!validatePriceFormat(entrypoint.price, entrypoint.key)) {
    return null;
  }

  if (typeof entrypoint.price === 'string') {
    return entrypoint.price;
  } else {
    return entrypoint.price[which] ?? null;
  }
}
