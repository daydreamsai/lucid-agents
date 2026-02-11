import type { Network } from '@x402/core/types';
import type { PaymentsConfig } from '@lucid-agents/types/payments';

/**
 * Supported EVM networks (CAIP-2 format)
 */
const SupportedEVMNetworks: Network[] = [
  'eip155:1',        // Ethereum mainnet
  'eip155:11155111', // Ethereum Sepolia
  'eip155:8453',     // Base mainnet
  'eip155:84532',    // Base Sepolia
  'eip155:137',      // Polygon
  'eip155:80002',    // Polygon Amoy
  'eip155:43114',    // Avalanche
  'eip155:43113',    // Avalanche Fuji
];

/**
 * Supported SVM networks (CAIP-2 format)
 */
const SupportedSVMNetworks: Network[] = [
  'solana:mainnet',
  'solana:devnet',
];

const SupportedNamedNetworks = [
  'ethereum',
  'sepolia',
  'base',
  'base-sepolia',
  'solana',
  'solana-devnet',
] as const;

const SUPPORTED_NETWORKS: Network[] = [
  ...SupportedEVMNetworks,
  ...SupportedSVMNetworks,
  ...(SupportedNamedNetworks as unknown as Network[]),
];

const BASE_NETWORKS = new Set(['base', 'eip155:8453']);

function isStripeMode(
  payments: PaymentsConfig
): payments is PaymentsConfig & { stripe: NonNullable<PaymentsConfig['stripe']> } {
  return 'stripe' in payments && typeof payments.stripe === 'object';
}

function normalizeNetwork(network: string): string {
  return network.trim().toLowerCase();
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

    const normalizedNetwork = normalizeNetwork(network);
    if (!BASE_NETWORKS.has(normalizedNetwork)) {
      throw new Error(
        `Stripe destination mode currently supports only Base mainnet (base / eip155:8453). Received: ${network}.`
      );
    }
  }

  if (!SUPPORTED_NETWORKS.includes(network as Network)) {
    console.error(
      `[agent-kit] Payment configuration error for entrypoint "${entrypointKey}":`,
      `Unsupported network: ${network}`,
      `Supported networks: ${SUPPORTED_NETWORKS.join(', ')}`
    );
    throw new Error(
      `Unsupported payment network: ${network}. ` +
        `Supported networks: ${SUPPORTED_NETWORKS.join(', ')}. ` +
        `Please use one of the supported networks in your configuration.`
    );
  }
}
