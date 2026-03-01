/**
 * TRC-8004 TRON Support — Chain Configuration
 *
 * TRON chain IDs and deployed TRC-8004 registry contract addresses.
 * These are the M2M Machine-to-Machine protocol registry contracts,
 * compatible with the ERC-8004 standard on TRON (TRC-8004).
 *
 * Registry addresses are stored as pre-computed 0x hex for use with
 * the existing lucid-agents type system.
 */

import type { Hex } from '@lucid-agents/wallet';

/**
 * CAIP-2 namespace for TRON.
 * Used in CAIP-10 address format: `tron:{chainId}:{address}`
 */
export const TRON_NAMESPACE = 'tron';

/**
 * TRON chain IDs.
 * These are the genesis block identifiers for each TRON network.
 */
export const TRON_CHAINS = {
  /** TRON Mainnet */
  MAINNET: 728126428,
  /** TRON Shasta Testnet */
  SHASTA: 2494104990,
} as const;

type TronChainId = (typeof TRON_CHAINS)[keyof typeof TRON_CHAINS];
export type { TronChainId };

/**
 * Registry addresses by TRON chain ID.
 *
 * Pre-computed hex addresses (converted from TRON base58 format):
 *
 * TRON Mainnet:
 *   IdentityRegistry:   THmfi8uJuUpTfUmYLDX7UD1KaE4P6HKgqA
 *   ReputationRegistry:  TV8KWmp8qcj55sjs1NSjVxmRmZP7CYzNxH
 *   ValidationRegistry:  TCoJA4BYXWZhp5eanCchMw67VA83tQ83n1
 *
 * TRON Shasta Testnet:
 *   IdentityRegistry:   TFKNqk9bjwWp5uRiiGimqfLhVQB8jSxYi7
 *   ReputationRegistry:  TRaYogyr2qc7WgsmuVF5Js39aCmoG7vZrA
 *   ValidationRegistry:  TPgGWWyUdxNryUCN49TdT4b3F4WB3Edr16
 */

type RegistryAddresses = {
  IDENTITY_REGISTRY: Hex;
  REPUTATION_REGISTRY: Hex;
  VALIDATION_REGISTRY: Hex;
};
export type { RegistryAddresses };

const TRON_CHAIN_ADDRESSES = {
  // TRON Mainnet — M2M TRC-8004 deployment (Feb 2026)
  [TRON_CHAINS.MAINNET]: {
    IDENTITY_REGISTRY: '0x55924f4501997a8d9b6ddc4af351c4de957f8f29' as Hex,
    REPUTATION_REGISTRY: '0xd22391db9c9bd218a5eca5757259decc1d19f360' as Hex,
    VALIDATION_REGISTRY: '0x1f088560b3d1fea32b1bbfd7ea4350f23f65e093' as Hex,
  },
  // TRON Shasta Testnet — M2M TRC-8004 deployment (Feb 2026)
  [TRON_CHAINS.SHASTA]: {
    IDENTITY_REGISTRY: '0x3aa92963de476e4c7f10e070d4cc99ed93602da2' as Hex,
    REPUTATION_REGISTRY: '0xab38fa199ec496d2b5dd570a0bb81056ca99c189' as Hex,
    VALIDATION_REGISTRY: '0x965d9e2d1b24d1d2746f1aaeee77de85c2b672d9' as Hex,
  },
} as const satisfies Readonly<Record<number, RegistryAddresses>>;

/**
 * Get all registry addresses for a specific TRON chain.
 * Throws an error if the chain is not supported.
 */
export function getTronRegistryAddresses(chainId: number): RegistryAddresses {
  if (!isTronChainSupported(chainId)) {
    const supportedChains = Object.entries(TRON_CHAINS)
      .map(([name, id]) => `${name} (${id})`)
      .join(', ');
    throw new Error(
      `TRON chain ID ${chainId} is not supported. Supported chains: ${supportedChains}.`
    );
  }
  return TRON_CHAIN_ADDRESSES[chainId];
}

/**
 * Get a specific registry address for a TRON chain.
 */
export function getTronRegistryAddress(
  registry: 'identity' | 'reputation' | 'validation',
  chainId: number
): Hex {
  const addresses = getTronRegistryAddresses(chainId);

  switch (registry) {
    case 'identity':
      return addresses.IDENTITY_REGISTRY;
    case 'reputation':
      return addresses.REPUTATION_REGISTRY;
    case 'validation':
      return addresses.VALIDATION_REGISTRY;
    default:
      throw new Error(
        `Unknown registry '${registry}' for TRON chain ${chainId}`
      );
  }
}

/**
 * Check if a chain ID is a supported TRON chain.
 * Acts as a type predicate to narrow `chainId` to `TronChainId`.
 */
export function isTronChainSupported(
  chainId: number
): chainId is TronChainId {
  return chainId in TRON_CHAIN_ADDRESSES;
}
