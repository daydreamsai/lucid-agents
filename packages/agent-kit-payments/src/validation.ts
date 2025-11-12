import { SupportedEVMNetworks, SupportedSVMNetworks, type Network } from 'x402/types';
import type { AgentMeta } from '@lucid-agents/agent-kit';
import type { PaymentsConfig } from './types';

const SUPPORTED_NETWORKS: Network[] = [
  ...SupportedEVMNetworks,
  ...SupportedSVMNetworks,
];

/**
 * Validates required agent metadata and throws descriptive errors if invalid.
 * @param meta - Agent metadata to validate
 * @throws Error if required fields are missing
 */
export function validateAgentMetadata(meta: AgentMeta): void {
  const missingFields: string[] = [];
  if (!meta.name) missingFields.push('name');
  if (!meta.version) missingFields.push('version');
  if (!meta.description) missingFields.push('description');

  if (missingFields.length > 0) {
    console.error(
      '[agent-kit] Required agent metadata is missing:',
      missingFields.join(', ')
    );
    throw new Error(
      `Missing required agent metadata: ${missingFields.join(', ')}. ` +
        `Please ensure AGENT_NAME, AGENT_VERSION, and AGENT_DESCRIPTION are set in your .env file.`
    );
  }
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
