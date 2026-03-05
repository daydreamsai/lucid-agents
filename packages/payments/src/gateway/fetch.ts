/**
 * Circle Gateway fetch wrapper for @lucid-agents/payments (buyer-side).
 *
 * Creates a fetch-compatible function that automatically pays 402 responses
 * using Circle Gateway batched payments — gasless for the buyer.
 *
 * @see https://developers.circle.com/gateway/nanopayments
 */

import type { GatewayFetchOptions } from './types';

/**
 * A fetch-compatible function with optional preconnect support.
 */
export type GatewayFetch = typeof fetch & {
  preconnect?: () => Promise<void>;
};

type GatewayClientInstance = {
  pay<T = unknown>(
    url: string,
    options?: { method?: string; body?: unknown; headers?: Record<string, string> }
  ): Promise<{ data: T; amount: bigint; formattedAmount: string; transaction: string; status: number }>;
};

type GatewayClientCtor = new (config: { chain: string; privateKey: string }) => GatewayClientInstance;

function loadGatewayClient(): GatewayClientCtor {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@circle-fin/x402-batching/client') as { GatewayClient: GatewayClientCtor };
    return mod.GatewayClient;
  } catch {
    throw new Error(
      '[lucid-agents/payments] createGatewayFetch requires @circle-fin/x402-batching. ' +
        'Install it: npm install @circle-fin/x402-batching'
    );
  }
}

/**
 * Create a fetch function that automatically pays 402 responses using
 * Circle Gateway batched payments.
 *
 * The returned fetch is a drop-in replacement for the global `fetch` that
 * intercepts HTTP 402 responses and pays using the buyer's Circle Gateway
 * balance — no gas required.
 *
 * @param options - Gateway fetch configuration
 * @param deps - Optional dependency injection (primarily for testing)
 * @returns A fetch-compatible function with automatic 402 payment
 *
 * @example
 * ```typescript
 * import { createGatewayFetch } from '@lucid-agents/payments';
 *
 * const gatewayFetch = createGatewayFetch({
 *   privateKey: process.env.PRIVATE_KEY as `0x${string}`,
 *   chain: 'base',
 * });
 *
 * // Use like regular fetch — 402 payments are handled automatically
 * const response = await gatewayFetch('https://api.example.com/resource');
 * const data = await response.json();
 * ```
 */
export function createGatewayFetch(
  options: GatewayFetchOptions,
  deps?: { GatewayClient?: GatewayClientCtor }
): GatewayFetch {
  const { privateKey, chain, fetchImpl } = options;

  if (!privateKey || privateKey.trim().length === 0) {
    throw new Error('[lucid-agents/payments] createGatewayFetch requires a non-empty privateKey');
  }
  if (!chain) {
    throw new Error('[lucid-agents/payments] createGatewayFetch requires a chain');
  }

  let _gatewayClient: GatewayClientInstance | null = null;

  function getGatewayClient(): GatewayClientInstance {
    if (!_gatewayClient) {
      const GatewayClientCtor = deps?.GatewayClient ?? loadGatewayClient();
      _gatewayClient = new GatewayClientCtor({ chain, privateKey });
    }
    return _gatewayClient!;
  }

  async function payFn(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    const method =
      init?.method ??
      (input instanceof Request ? input.method : undefined) ??
      'GET';

    const headers = init?.headers
      ? Object.fromEntries(new Headers(init.headers as HeadersInit).entries())
      : undefined;

    let body: unknown;
    if (init?.body) {
      if (typeof init.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      } else {
        body = init.body;
      }
    }

    // First try the request without payment
    const baseFetch = fetchImpl ?? fetch;
    const initialResponse = await baseFetch(input, init);

    // If not a 402, return as-is
    if (initialResponse.status !== 402) {
      return initialResponse;
    }

    // 402 detected — pay via Circle Gateway
    console.info('[lucid-agents/payments:gateway] 402 received, paying via Circle Gateway', url);

    try {
      const result = await getGatewayClient().pay(url, {
        method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
        ...(body !== undefined ? { body } : {}),
        ...(headers ? { headers } : {}),
      });

      const responseBody = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
      return new Response(responseBody, {
        status: result.status,
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Transaction': result.transaction,
          'X-Payment-Amount': result.formattedAmount,
        },
      });
    } catch (err) {
      console.warn('[lucid-agents/payments:gateway] fetch failed', (err as Error)?.message ?? err);
      throw err;
    }
  }

  const gatewayFetch: GatewayFetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      return payFn(input, init);
    },
    { preconnect: async () => {} }
  );

  return gatewayFetch;
}
