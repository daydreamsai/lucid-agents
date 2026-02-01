import type { PaymentsConfig } from '@lucid-agents/types/payments';
import {
  type Network,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
} from 'x402/types';

const SUPPORTED_NETWORKS: Network[] = [
  ...SupportedEVMNetworks,
  ...SupportedSVMNetworks,
];

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
  if (!payments.payTo) {
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
