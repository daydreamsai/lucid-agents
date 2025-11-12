/**
 * Address normalization and validation utilities
 */

export type Hex = `0x${string}`;

export const ZERO_ADDRESS: Hex = '0x0000000000000000000000000000000000000000';

/**
 * Normalize an Ethereum address to lowercase hex format
 * Throws if the address is invalid
 */
export function normalizeAddress(value: string | null | undefined): Hex {
  if (!value) {
    throw new Error('invalid hex address');
  }
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(`invalid hex address: ${value}`);
  }
  return trimmed.toLowerCase() as Hex;
}

/**
 * Sanitize an address - returns ZERO_ADDRESS if invalid instead of throwing
 */
export function sanitizeAddress(value: string | null | undefined): Hex {
  if (!value) return ZERO_ADDRESS;
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return ZERO_ADDRESS;
  }
  return trimmed.toLowerCase() as Hex;
}
