import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import { registerExactSvmScheme } from '@x402/svm/exact/server';
import type { PaymentsConfig } from '@lucid-agents/types/payments';

export type ResourceServerOptions = {
  /**
   * Whether to register EVM scheme support (default: true)
   */
  evm?: boolean;
  /**
   * Whether to register SVM (Solana) scheme support (default: true)
   */
  svm?: boolean;
  /**
   * Specific EVM networks to register (optional, registers wildcard by default)
   */
  evmNetworks?: string[];
  /**
   * Specific SVM networks to register (optional, registers wildcard by default)
   */
  svmNetworks?: string[];
};

/**
 * Creates an HTTPFacilitatorClient from a facilitator URL.
 */
export function createFacilitatorClient(
  facilitatorUrl: string
): HTTPFacilitatorClient {
  return new HTTPFacilitatorClient({ url: facilitatorUrl });
}

/**
 * Creates a configured x402ResourceServer with EVM and/or SVM scheme support.
 *
 * @param facilitatorUrl - URL of the facilitator service
 * @param options - Configuration options for scheme registration
 * @returns Configured x402ResourceServer instance
 *
 * @example
 * ```typescript
 * // Default: registers both EVM and SVM schemes
 * const server = createResourceServer('https://facilitator.example.com');
 *
 * // Only EVM
 * const evmServer = createResourceServer(url, { svm: false });
 *
 * // Only SVM
 * const svmServer = createResourceServer(url, { evm: false });
 * ```
 */
export function createResourceServer(
  facilitatorUrl: string,
  options: ResourceServerOptions = {}
): x402ResourceServer {
  const { evm = true, svm = true, evmNetworks, svmNetworks } = options;

  const facilitatorClient = createFacilitatorClient(facilitatorUrl);
  const resourceServer = new x402ResourceServer(facilitatorClient);

  if (evm) {
    registerExactEvmScheme(resourceServer, {
      networks: evmNetworks as `${string}:${string}`[] | undefined,
    });
  }

  if (svm) {
    registerExactSvmScheme(resourceServer, {
      networks: svmNetworks as `${string}:${string}`[] | undefined,
    });
  }

  return resourceServer;
}

/**
 * Creates a resource server from PaymentsConfig.
 * Convenience function that extracts the facilitator URL from config.
 */
export function createResourceServerFromConfig(
  payments: PaymentsConfig,
  options?: ResourceServerOptions
): x402ResourceServer {
  return createResourceServer(payments.facilitatorUrl as string, options);
}

// Re-export x402ResourceServer type for external use
export type { x402ResourceServer } from '@x402/core/server';
