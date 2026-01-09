/**
 * ERC-8004 January 2026 Specification Configuration
 * Contract addresses and constants
 *
 * Updated for ERC-8004 Jan 2026 spec update:
 * - Only ETH Sepolia is deployed with new addresses as of Jan 2026
 * - Other chains await new contract deployments
 * - Validation Registry is under active development (see note below)
 *
 * Reference: https://github.com/erc-8004/erc-8004-contracts
 */

import type { Hex } from '@lucid-agents/wallet';

/**
 * Official ERC-8004 registry addresses by chain
 *
 * NOTE: As of Jan 2026 spec update, only ETH Sepolia has deployed addresses.
 * Other chains will be enabled once new contracts are deployed.
 */
type RegistryAddresses = {
  IDENTITY_REGISTRY: Hex;
  REPUTATION_REGISTRY: Hex;
  VALIDATION_REGISTRY: Hex;
};

const CHAIN_ADDRESSES: Record<number, RegistryAddresses> = {
  // ETH Sepolia (11155111) - Jan 2026 spec update addresses
  11155111: {
    IDENTITY_REGISTRY: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as Hex,
    REPUTATION_REGISTRY: '0x8004B663056A597Dffe9eCcC1965A193B7388713' as Hex,
    // Validation Registry: Under active development, address kept for backward compatibility
    // Will be updated in follow-up spec update later this year
    VALIDATION_REGISTRY: '0x8004CB39f29c09145F24Ad9dDe2A108C1A2cdfC5' as Hex,
  },
  // TODO: Base Sepolia (84532) - Awaiting Jan 2026 spec contract deployment
  // 84532: {
  //   IDENTITY_REGISTRY: '0x...' as Hex,
  //   REPUTATION_REGISTRY: '0x...' as Hex,
  //   VALIDATION_REGISTRY: '0x...' as Hex,
  // },
  // TODO: Linea Sepolia (59141) - Awaiting Jan 2026 spec contract deployment
  // 59141: {
  //   IDENTITY_REGISTRY: '0x...' as Hex,
  //   REPUTATION_REGISTRY: '0x...' as Hex,
  //   VALIDATION_REGISTRY: '0x...' as Hex,
  // },
  // TODO: Polygon Amoy (80002) - Awaiting Jan 2026 spec contract deployment
  // 80002: {
  //   IDENTITY_REGISTRY: '0x...' as Hex,
  //   REPUTATION_REGISTRY: '0x...' as Hex,
  //   VALIDATION_REGISTRY: '0x...' as Hex,
  // },
  // TODO: Hedera Testnet (296) - Awaiting Jan 2026 spec contract deployment
  // 296: {
  //   IDENTITY_REGISTRY: '0x...' as Hex,
  //   REPUTATION_REGISTRY: '0x...' as Hex,
  //   VALIDATION_REGISTRY: '0x...' as Hex,
  // },
  // TODO: HyperEVM Testnet (998) - Awaiting Jan 2026 spec contract deployment
  // 998: {
  //   IDENTITY_REGISTRY: '0x...' as Hex,
  //   REPUTATION_REGISTRY: '0x...' as Hex,
  //   VALIDATION_REGISTRY: '0x...' as Hex,
  // },
  // TODO: SKALE Base Sepolia Testnet (202402221200) - Awaiting Jan 2026 spec contract deployment
  // 202402221200: {
  //   IDENTITY_REGISTRY: '0x...' as Hex,
  //   REPUTATION_REGISTRY: '0x...' as Hex,
  //   VALIDATION_REGISTRY: '0x...' as Hex,
  // },
} as const;

/**
 * Supported chain IDs for ERC-8004 registries
 * Based on official deployments: https://github.com/erc-8004/erc-8004-contracts
 */
export const SUPPORTED_CHAINS = {
  BASE_SEPOLIA: 84532,
  ETHEREUM_SEPOLIA: 11155111,
  LINEA_SEPOLIA: 59141,
  POLYGON_AMOY: 80002,
  HEDERA_TESTNET: 296,
  HYPEREVM_TESTNET: 998,
  SKALE_BASE_SEPOLIA: 202402221200,
  ETHEREUM_MAINNET: 1,
  BASE_MAINNET: 8453,
  ARBITRUM: 42161,
  OPTIMISM: 10,
  POLYGON: 137,
} as const;

export type SupportedChainId =
  (typeof SUPPORTED_CHAINS)[keyof typeof SUPPORTED_CHAINS];

/**
 * Default network configuration
 */
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
 * Throws an error if the chain is not supported
 */
export function getRegistryAddresses(chainId: number): RegistryAddresses {
  const addresses = CHAIN_ADDRESSES[chainId];
  if (!addresses) {
    const supportedChains = Object.keys(CHAIN_ADDRESSES)
      .map(id => `${id}`)
      .join(', ');
    throw new Error(
      `Chain ID ${chainId} is not supported. Supported chains: ${supportedChains}. ` +
        `See https://github.com/erc-8004/erc-8004-contracts for official deployments.`
    );
  }
  return addresses;
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
  return chainId in CHAIN_ADDRESSES;
}

/**
 * Verify if an address is a valid ERC-8004 registry on any supported chain
 */
export function isERC8004Registry(address: Hex, chainId?: number): boolean {
  const normalized = address.toLowerCase();

  if (chainId !== undefined) {
    // Check if chain is supported first
    if (!isChainSupported(chainId)) {
      return false;
    }
    // Check specific chain
    const addresses = getRegistryAddresses(chainId);
    return Object.values(addresses).some(
      addr => addr.toLowerCase() === normalized
    );
  }

  // Check all supported chains
  const supportedChainIds = Object.keys(CHAIN_ADDRESSES).map(Number);
  return supportedChainIds.some(cid => {
    const addresses = getRegistryAddresses(cid);
    return Object.values(addresses).some(
      addr => addr.toLowerCase() === normalized
    );
  });
}
