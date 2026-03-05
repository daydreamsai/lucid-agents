import type { CircleGatewayConfig } from './types';

/**
 * Default Circle Gateway facilitator URL.
 */
const DEFAULT_GATEWAY_URL = 'https://gateway.circle.com';

/**
 * Creates a Circle Gateway BatchFacilitatorClient for server-side
 * payment verification and settlement.
 *
 * The facilitator communicates with Circle Gateway's x402 endpoints:
 * - POST /v1/x402/verify — verify payment signatures
 * - POST /v1/x402/settle — settle batched payments
 * - GET /v1/x402/supported — list supported payment kinds
 *
 * @param config - Optional Gateway configuration
 * @returns A BatchFacilitatorClient instance
 *
 * @example
 * ```typescript
 * import { createCircleGatewayFacilitator } from '@lucid-agents/payments';
 *
 * const facilitator = createCircleGatewayFacilitator();
 * // Use with payments extension:
 * .use(payments({ config: { ...paymentsFromEnv(), facilitator: 'circle-gateway' } }))
 * ```
 */
export async function createCircleGatewayFacilitator(config?: CircleGatewayConfig) {
  const url = config?.facilitatorUrl ?? DEFAULT_GATEWAY_URL;

  // Dynamic import to avoid hard failure when optional peer dep is missing
  const { BatchFacilitatorClient } = await import('@circle-fin/x402-batching/server');

  return new BatchFacilitatorClient({ url });
}
