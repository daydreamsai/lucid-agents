import { privateKeyToAccount, type LocalAccount } from 'viem/accounts';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import type { Hex } from './crypto';

export type WrappedFetch = typeof fetch & {
  preconnect?: () => Promise<void>;
};

export type X402Account = LocalAccount;

/**
 * Supported EVM networks for x402 payments.
 * Maps network names to CAIP-2 chain identifiers.
 */
const SUPPORTED_EVM_NETWORKS: Record<string, string> = {
  base: 'eip155:8453',
  'base-sepolia': 'eip155:84532',
  ethereum: 'eip155:1',
  sepolia: 'eip155:11155111',
};

export type CreateX402FetchOptions = {
  account: X402Account;
  fetchImpl?: typeof fetch;
  /** Networks to register. Defaults to all supported EVM networks. */
  networks?: string[];
};

export const createX402Fetch = ({
  account,
  fetchImpl,
  networks,
}: CreateX402FetchOptions): WrappedFetch => {
  if (!account) {
    throw new Error('[agent-kit-payments] createX402Fetch requires an account');
  }

  console.info(
    '[agent-kit-payments:x402] creating paid fetch',
    account.address ? `for ${account.address}` : '(account address unavailable)'
  );

  // Create EVM signer from the account
  const signer = toClientEvmSigner(account);

  // Create x402 client and register networks
  const client = new x402Client();
  const networksToRegister = networks ?? Object.keys(SUPPORTED_EVM_NETWORKS);

  for (const network of networksToRegister) {
    const caip2Id = SUPPORTED_EVM_NETWORKS[network];
    if (caip2Id) {
      client.register(caip2Id as `${string}:${string}`, new ExactEvmScheme(signer));
    }
  }

  console.info(
    '[agent-kit-payments:x402] registered networks:',
    networksToRegister.join(', ')
  );

  // Wrap fetch with payment handling
  const paymentFetch = wrapFetchWithPayment(fetchImpl ?? fetch, client);
  console.info('[agent-kit-payments:x402] wrapFetchWithPayment initialised');

  const describeInput = (input: Parameters<typeof fetch>[0]) => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    if (typeof (input as Request)?.url === 'string') {
      return (input as Request).url;
    }
    return '[object Request]';
  };

  const wrappedFetch: WrappedFetch = Object.assign(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => {
      const requestUrl = describeInput(input);
      const requestMethod =
        init?.method ??
        (input instanceof Request ? input.method : undefined) ??
        'POST';
      console.info(
        '[agent-kit-payments:x402] fetch request',
        requestUrl,
        requestMethod
      );
      try {
        const response = await paymentFetch(input, init ?? {});
        const paymentHeader =
          response.headers.get('PAYMENT-RESPONSE') ??
          response.headers.get('X-PAYMENT-RESPONSE');
        console.info(
          '[agent-kit-payments:x402] fetch response',
          requestUrl,
          response.status,
          paymentHeader ? '(paid)' : '(no x402 header)'
        );
        return response;
      } catch (error) {
        console.warn(
          '[agent-kit-payments:x402] fetch failed',
          requestUrl,
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
};

export const accountFromPrivateKey = (privateKey: Hex): X402Account => {
  if (!privateKey || privateKey.trim().length === 0) {
    throw new Error(
      '[agent-kit-payments] accountFromPrivateKey requires a non-empty private key'
    );
  }
  return privateKeyToAccount(privateKey);
};
