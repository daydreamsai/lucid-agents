/**
 * Circle Gateway Facilitator for @lucid-agents/payments (seller-side).
 *
 * Wraps `BatchFacilitatorClient` from `@circle-fin/x402-batching/server` to
 * provide gasless batched payment settlement via Circle Gateway.
 *
 * @see https://developers.circle.com/gateway/nanopayments
 */

import type { CircleGatewayConfig } from './types';

const DEFAULT_CIRCLE_GATEWAY_URL = 'https://gateway.circle.com';

/**
 * Minimal interface for Circle Gateway facilitator operations.
 */
export interface CircleGatewayFacilitator {
  /** The Gateway URL this facilitator targets */
  readonly gatewayUrl: string;
  verify(
    paymentPayload: Record<string, unknown>,
    paymentRequirements: Record<string, unknown>
  ): Promise<{ isValid: boolean; invalidReason?: string; payer?: string }>;
  settle(
    paymentPayload: Record<string, unknown>,
    paymentRequirements: Record<string, unknown>
  ): Promise<{ success: boolean; errorReason?: string; payer?: string; transaction: string; network: string }>;
  getSupported(): Promise<{
    kinds: Array<{ x402Version: number; scheme: string; network: string; extra?: Record<string, unknown> }>;
    extensions: string[];
    signers: Record<string, string[]>;
  }>;
  /** The underlying BatchFacilitatorClient instance */
  readonly client: unknown;
}

type BatchFacilitatorClientCtor = new (config?: { url?: string; apiKey?: string }) => {
  verify(p: unknown, r: unknown): Promise<{ isValid: boolean; invalidReason?: string; payer?: string }>;
  settle(p: unknown, r: unknown): Promise<{ success: boolean; errorReason?: string; payer?: string; transaction: string; network: string }>;
  getSupported(): Promise<{ kinds: Array<{ x402Version: number; scheme: string; network: string; extra?: Record<string, unknown> }>; extensions: string[]; signers: Record<string, string[]> }>;
};

function loadBatchFacilitatorClient(): BatchFacilitatorClientCtor {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@circle-fin/x402-batching/server') as { BatchFacilitatorClient: BatchFacilitatorClientCtor };
    return mod.BatchFacilitatorClient;
  } catch {
    throw new Error(
      '[lucid-agents/payments] Circle Gateway facilitator requires @circle-fin/x402-batching. ' +
        'Install it: npm install @circle-fin/x402-batching'
    );
  }
}

/**
 * Create a Circle Gateway facilitator for settling batched x402 payments.
 *
 * Returns a `CircleGatewayFacilitator` wrapping `BatchFacilitatorClient`
 * from `@circle-fin/x402-batching/server`. Use this on the seller side when
 * you want gasless settlement — Circle covers gas fees for buyers.
 *
 * @param config - Optional Circle Gateway configuration
 * @param deps - Optional dependency injection (primarily for testing)
 * @returns A facilitator compatible with x402 resource servers
 *
 * @example
 * ```typescript
 * import { createCircleGatewayFacilitator } from '@lucid-agents/payments';
 *
 * const facilitator = createCircleGatewayFacilitator({
 *   gatewayUrl: 'https://gateway.circle.com',
 * });
 * ```
 */
export function createCircleGatewayFacilitator(
  config?: CircleGatewayConfig,
  deps?: { BatchFacilitatorClient?: BatchFacilitatorClientCtor }
): CircleGatewayFacilitator {
  const gatewayUrl = config?.gatewayUrl ?? DEFAULT_CIRCLE_GATEWAY_URL;

  let _client: ReturnType<BatchFacilitatorClientCtor> | null = null;

  function getClient() {
    if (!_client) {
      const Ctor = deps?.BatchFacilitatorClient ?? loadBatchFacilitatorClient();
      _client = new Ctor({
        url: gatewayUrl,
        ...(config?.apiKey ? { apiKey: config.apiKey } : {}),
      });
    }
    return _client!;
  }

  return {
    get gatewayUrl() {
      return gatewayUrl;
    },
    async verify(paymentPayload, paymentRequirements) {
      return getClient().verify(paymentPayload, paymentRequirements);
    },
    async settle(paymentPayload, paymentRequirements) {
      return getClient().settle(paymentPayload, paymentRequirements);
    },
    async getSupported() {
      return getClient().getSupported();
    },
    get client() {
      return getClient();
    },
  };
}
