import type { Network } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';

/**
 * Supported EVM networks (CAIP-2 format)
 */
const SupportedEVMNetworks: Network[] = [
  'eip155:1', // Ethereum mainnet
  'eip155:11155111', // Ethereum Sepolia
  'eip155:8453', // Base mainnet
  'eip155:84532', // Base Sepolia
  'eip155:137', // Polygon
  'eip155:80002', // Polygon Amoy
  'eip155:43114', // Avalanche
  'eip155:43113', // Avalanche Fuji
];

/**
 * Supported SVM networks (CAIP-2 format)
 */
const SupportedSVMNetworks: Network[] = [
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
];

const SUPPORTED_NETWORKS: Network[] = [
  ...SupportedEVMNetworks,
  ...SupportedSVMNetworks,
];

const LEGACY_NETWORK_ALIASES: Readonly<Record<string, Network>> = {
  ethereum: 'eip155:1',
  sepolia: 'eip155:11155111',
  base: 'eip155:8453',
  'base-sepolia': 'eip155:84532',
  solana: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'solana-mainnet': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'solana:mainnet': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'solana-devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  'solana:devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
};

const BASE_NETWORKS = new Set<Network>(['eip155:8453']);

function isStripeMode(
  payments: PaymentsConfig
): payments is PaymentsConfig & {
  stripe: NonNullable<PaymentsConfig['stripe']>;
} {
  return 'stripe' in payments && typeof payments.stripe === 'object';
}

/**
 * Resolve historical network aliases at the configuration boundary. Runtime
 * state, manifests, and x402 payloads always use the canonical CAIP-2 value.
 */
export function normalizePaymentNetwork(network: string): Network {
  const trimmed = network.trim();
  const normalizedAlias = trimmed.toLowerCase();
  const canonical =
    LEGACY_NETWORK_ALIASES[normalizedAlias] ??
    (normalizedAlias.startsWith('eip155:') ? normalizedAlias : trimmed);
  if (!SUPPORTED_NETWORKS.includes(canonical as Network)) {
    throw new Error(
      `Unsupported payment network: ${network}. ` +
        `Supported networks: ${SUPPORTED_NETWORKS.join(', ')}.`
    );
  }
  return canonical as Network;
}

/**
 * Validates payment configuration and throws descriptive errors if invalid.
 * @param payments - Payment configuration to validate
 * @param network - Network configuration (may be from entrypoint or payments)
 * @param entrypointKey - Entrypoint key for error messages
 * @throws Error if required payment configuration is missing
 */
export function validatePaymentsConfig(
  payments: PaymentsConfig,
  network: string | undefined,
  entrypointKey: string
): void {
  if (!isStripeMode(payments) && !payments.payTo) {
    console.error(
      `[agent-kit] Payment configuration error for entrypoint "${entrypointKey}":`,
      'PAYMENTS_RECEIVABLE_ADDRESS is not set.',
      'Please set the environment variable or configure payments.payTo in your agent setup.'
    );
    throw new Error(
      `Payment configuration error: PAYMENTS_RECEIVABLE_ADDRESS environment variable is not set. ` +
        `This is required to receive payments. Please set PAYMENTS_RECEIVABLE_ADDRESS to your wallet address.`
    );
  }

  if (!payments.facilitatorUrl) {
    console.error(
      `[agent-kit] Payment configuration error for entrypoint "${entrypointKey}":`,
      'FACILITATOR_URL is not set.',
      'Please set the environment variable or configure payments.facilitatorUrl.'
    );
    throw new Error(
      `Payment configuration error: FACILITATOR_URL environment variable is not set. ` +
        `This is required for payment processing.`
    );
  }

  if (!network) {
    console.error(
      `[agent-kit] Payment configuration error for entrypoint "${entrypointKey}":`,
      'NETWORK is not set.',
      'Please set the NETWORK environment variable or configure payments.network.'
    );
    throw new Error(
      `Payment configuration error: NETWORK is not set. ` +
        `This is required for payment processing.`
    );
  }

  if (isStripeMode(payments)) {
    const secretKey = payments.stripe.secretKey?.trim();
    if (!secretKey) {
      console.error(
        `[agent-kit] Payment configuration error for entrypoint "${entrypointKey}":`,
        'STRIPE_SECRET_KEY is not set.',
        'Please set STRIPE_SECRET_KEY or configure payments.stripe.secretKey.'
      );
      throw new Error(
        'Payment configuration error: STRIPE_SECRET_KEY is not set. This is required for Stripe destination mode.'
      );
    }

    const normalizedNetwork = normalizePaymentNetwork(network);
    if (!BASE_NETWORKS.has(normalizedNetwork)) {
      throw new Error(
        `Stripe destination mode currently supports only Base mainnet (eip155:8453). Received: ${network}.`
      );
    }
  }

  try {
    normalizePaymentNetwork(network);
  } catch {
    console.error(
      `[agent-kit] Payment configuration error for entrypoint "${entrypointKey}":`,
      `Unsupported network: ${network}`,
      `Supported networks: ${SUPPORTED_NETWORKS.join(', ')}`
    );
    throw new Error(
      `Unsupported payment network: ${network}. ` +
        `Supported networks: ${SUPPORTED_NETWORKS.join(', ')}. ` +
        `Please use a supported CAIP-2 identifier in your configuration.`
    );
  }
}
