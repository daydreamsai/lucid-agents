/**
 * Address normalization and CAIP-10 utilities
 */

import type { Hex } from './types';

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
  try {
    return normalizeAddress(value);
  } catch {
    return ZERO_ADDRESS;
  }
}

/**
 * Convert address to CAIP-10 format (Chain Agnostic Improvement Proposal)
 * Format: {namespace}:{chainId}:{address}
 * Example: "eip155:1:0x1234..."
 */
export function toCaip10(params: {
  namespace?: string;
  chainId: number | string;
  address: string;
}): string {
  const namespace = params.namespace ?? 'eip155';
  const chainRef =
    typeof params.chainId === 'number'
      ? params.chainId.toString(10)
      : `${params.chainId ?? ''}`;
  if (!chainRef) throw new Error('chainId is required for CAIP-10');
  const address = normalizeAddress(params.address);
  return `${namespace}:${chainRef}:${address}`;
}
