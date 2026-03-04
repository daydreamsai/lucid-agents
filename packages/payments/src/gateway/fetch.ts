import type { GatewayFetchOptions } from './types';
import type { WrappedFetch } from '../x402';
import { privateKeyToAccount } from 'viem/accounts';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';

/**
 * Default chain for Gateway operations.
 */
const DEFAULT_CHAIN = 'base';

/**
 * Creates a Gateway-enabled fetch function for making gasless x402 payments.
 *
 * Uses Circle Gateway's BatchEvmScheme alongside the standard ExactEvmScheme
 * via CompositeEvmScheme, so it handles both Gateway-batched and standard
 * on-chain x402 payments transparently.
 *
 * @param options - Gateway fetch configuration
 * @returns A fetch function that automatically handles x402 payments (both Gateway and standard)
 *
 * @example
 * ```typescript
 * import { createGatewayFetch } from '@lucid-agents/payments';
 *
 * const fetch = createGatewayFetch({
 *   privateKey: '0x...',
 *   chain: 'base',
 * });
 *
 * // Automatically handles both Gateway and standard x402 payments
 * const response = await fetch('https://api.example.com/paid-endpoint');
 * ```
 */
export async function createGatewayFetch(options: GatewayFetchOptions): Promise<WrappedFetch> {
  const chain = options.chain ?? DEFAULT_CHAIN;

  if (!options.privateKey) {
    throw new Error(
      '[agent-kit-payments:gateway] createGatewayFetch requires a privateKey'
    );
  }

  const account = privateKeyToAccount(options.privateKey as `0x${string}`);
  const signer = toClientEvmSigner(account);

  // Dynamic import to avoid hard failure when optional peer dep is missing
  const { registerBatchScheme } = await import('@circle-fin/x402-batching/client');

  // Create x402 client with composite scheme (Gateway + standard)
  const client = new x402Client();
  const fallbackScheme = new ExactEvmScheme(signer);

  registerBatchScheme(client, {
    signer,
    fallbackScheme,
  });

  console.info(
    '[agent-kit-payments:gateway] created Gateway-enabled fetch',
    `chain=${chain}`,
    `address=${account.address}`
  );

  const paymentFetch = wrapFetchWithPayment(fetch, client);

  const wrappedFetch: WrappedFetch = Object.assign(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      console.info('[agent-kit-payments:gateway] fetch request', url);

      try {
        const response = await paymentFetch(input, init ?? {});
        const paymentHeader =
          response.headers.get('PAYMENT-RESPONSE') ??
          response.headers.get('X-PAYMENT-RESPONSE');
        console.info(
          '[agent-kit-payments:gateway] fetch response',
          url,
          response.status,
          paymentHeader ? '(paid)' : '(no payment)'
        );
        return response;
      } catch (error) {
        console.warn(
          '[agent-kit-payments:gateway] fetch failed',
          url,
          (error as Error)?.message ?? error
        );
        throw error;
      }
    },
    {
      preconnect: async () => {},
    }
  );

  return wrappedFetch;
}
