/**
 * ERC-8004 v1.0 Configuration
 * Contract addresses and constants
 */

import type { Hex } from '../utils';

/**
 * Default ERC-8004 registry addresses (CREATE2 deterministic)
 *
 * These addresses are deployed via CREATE2, ensuring the same address across chains.
 * They are deterministic and can be verified on any EVM-compatible network.
 *
 * Reference: https://github.com/ChaosChain/trustless-agents-erc-ri
 */
const DEFAULT_ADDRESSES = {
  /**
   * Identity Registry - ERC-721 NFTs representing agent identities
   * Functions: register(), ownerOf(), tokenURI(), agentExists()
   */
  IDENTITY_REGISTRY: '0x7177a6867296406881E20d6647232314736Dd09A' as Hex,

  /**
   * Reputation Registry - Peer feedback and reputation system
   * Functions: giveFeedback(), revokeFeedback(), getSummary(), getAllFeedback()
   */
  REPUTATION_REGISTRY: '0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322' as Hex,

  /**
   * Validation Registry - Validation requests and responses
   * Functions: validationRequest(), validationResponse(), getRequest(), getSummary()
   */
  VALIDATION_REGISTRY: '0x662b40A526cb4017d947e71eAF6753BF3eeE66d8' as Hex,
} as const;

/**
 * Chain-specific overrides for registries with different addresses
 *
 * Only add entries here if a specific chain has different addresses
 * than the deterministic CREATE2 defaults above.
 */
const CHAIN_OVERRIDES: Partial<
  Record<number, Partial<typeof DEFAULT_ADDRESSES>>
> = {
  // Example: If a chain has different registry addresses
  // 42161: {
  //   IDENTITY_REGISTRY: "0xDifferentAddress..." as Hex,
  // },
} as const;

/**
 * Supported chain IDs for ERC-8004 registries
 */
export const SUPPORTED_CHAINS = {
  BASE_SEPOLIA: 84532,
  ETHEREUM_MAINNET: 1,
  SEPOLIA: 11155111,
  BASE_MAINNET: 8453,
  ARBITRUM: 42161,
  OPTIMISM: 10,
  POLYGON: 137,
  POLYGON_AMOY: 80002,
} as const;

export type SupportedChainId =
  (typeof SUPPORTED_CHAINS)[keyof typeof SUPPORTED_CHAINS];

/**
 * Default network configuration
 */
export const DEFAULT_CHAIN_ID = 84532; // Base Sepolia
export const DEFAULT_NAMESPACE = 'eip155'; // EVM chains

/**
 * Default trust models supported by ERC-8004
 */
export const DEFAULT_TRUST_MODELS: string[] = [
  'feedback',
  'inference-validation',
];

/**
 * Get all registry addresses for a specific chain
 * Returns default addresses with any chain-specific overrides applied
 */
export function getRegistryAddresses(
  chainId: number
): typeof DEFAULT_ADDRESSES {
  const overrides = CHAIN_OVERRIDES[chainId] ?? {};
  return { ...DEFAULT_ADDRESSES, ...overrides };
}

/**
 * Get a specific registry address for a chain
 */
export function getRegistryAddress(
  registry: 'identity' | 'reputation' | 'validation',
  chainId: number
): Hex {
  const addresses = getRegistryAddresses(chainId);

  switch (registry) {
    case 'identity':
      return addresses.IDENTITY_REGISTRY;
    case 'reputation':
      return addresses.REPUTATION_REGISTRY;
    case 'validation':
      return addresses.VALIDATION_REGISTRY;
  }
}

/**
 * Check if a chain ID is supported by the ERC-8004 registries
 */
export function isChainSupported(chainId: number): boolean {
  return Object.values(SUPPORTED_CHAINS).includes(chainId as SupportedChainId);
}

/**
 * Verify if an address is a valid ERC-8004 registry on any supported chain
 */
export function isERC8004Registry(address: Hex, chainId?: number): boolean {
  const normalized = address.toLowerCase();

  if (chainId !== undefined) {
    // Check specific chain
    const addresses = getRegistryAddresses(chainId);
    return Object.values(addresses).some(
      addr => addr.toLowerCase() === normalized
    );
  }

  // Check all supported chains
  const chains = Object.values(SUPPORTED_CHAINS);
  return chains.some(cid => {
    const addresses = getRegistryAddresses(cid);
    return Object.values(addresses).some(
      addr => addr.toLowerCase() === normalized
    );
  });
}
