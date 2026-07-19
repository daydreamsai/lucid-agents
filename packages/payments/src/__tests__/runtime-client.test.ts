import { describe, expect, it, mock } from 'bun:test';

import type { AgentRuntime } from '@lucid-agents/types/core';
import type {
  PaymentTracker,
  PaymentsRuntime,
} from '@lucid-agents/types/payments';
import type {
  WalletConnector,
  WalletsRuntime,
} from '@lucid-agents/types/wallets';

import { createRuntimePaymentContext } from '../runtime';

type PaymentClientRuntime = NonNullable<
  Parameters<typeof createRuntimePaymentContext>[0]['runtime']
>;

const ADDRESS = '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429';
const UPDATED_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const NORMALIZED_ADDRESS = ADDRESS.toLowerCase() as `0x${string}`;
const PRIVATE_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const nullContext = {
  fetchWithPayment: null,
  signer: null,
  walletAddress: null,
  chainId: null,
};

const runtimeWithConnector = (
  connector?: Partial<WalletConnector>,
  payments?: Partial<PaymentsRuntime>
): PaymentClientRuntime =>
  ({
    wallets: connector
      ? ({
          agent: {
            kind: 'local',
            connector: {
              getWalletMetadata: async () => ({ address: ADDRESS }),
              signChallenge: async () => '0xdeadbeef',
              supportsCaip2: async () => true,
              ...connector,
            },
          },
        } satisfies WalletsRuntime)
      : undefined,
    payments,
  }) as unknown as AgentRuntime<{
    wallets?: WalletsRuntime;
    payments?: PaymentsRuntime;
  }>;

const paymentRequired = (amount = '1000'): Response =>
  new Response(null, {
    status: 402,
    headers: {
      'PAYMENT-REQUIRED': Buffer.from(
        JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: 'exact',
              network: 'eip155:84532',
              amount,
              description: 'payment',
              mimeType: 'application/json',
              payTo: ADDRESS,
              maxTimeoutSeconds: 30,
              asset: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
              extra: { name: 'USDC', version: '2' },
            },
          ],
          resource: { url: 'https://example.com', method: 'POST' },
        })
      ).toString('base64'),
    },
  });

describe('runtime payment client context', () => {
  it('validates private-key network configuration and contains signer failures', async () => {
    const warn = mock((_message: string) => undefined);
    const fetch = async () => new Response('ok');

    expect(
      await createRuntimePaymentContext({
        privateKey: PRIVATE_KEY,
        fetch,
        logger: { warn },
      })
    ).toEqual(nullContext);
    expect(
      await createRuntimePaymentContext({
        privateKey: PRIVATE_KEY,
        network: 'solana-devnet',
        fetch,
        logger: { warn },
      })
    ).toEqual(nullContext);
    expect(
      await createRuntimePaymentContext({
        privateKey: 'invalid',
        network: 'base',
        fetch,
        logger: { warn },
      })
    ).toEqual(nullContext);

    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining('requires options.network'),
      expect.stringContaining('Unsupported network'),
      expect.stringContaining('Failed to initialise paid fetch'),
    ]);
  });

  it('creates a private-key context, preserves preconnect, and enforces its spend cap', async () => {
    const preconnect = mock(async (_input: RequestInfo | URL) => undefined);
    const fetch = Object.assign(
      mock(async () => paymentRequired()),
      {
        preconnect,
      }
    );
    const context = await createRuntimePaymentContext({
      privateKey: PRIVATE_KEY,
      network: 'base-sepolia',
      maxPaymentBaseUnits: 999n,
      fetch,
    });

    expect(context.walletAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(context.chainId).toBe(84532);
    expect(context.signer).toBeDefined();
    await (
      context.fetchWithPayment as typeof fetch & {
        preconnect: typeof preconnect;
      }
    ).preconnect('https://example.com');
    expect(preconnect).toHaveBeenCalledWith('https://example.com');

    await expect(
      context.fetchWithPayment?.('https://example.com')
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fails closed when an agent wallet or usable address is unavailable', async () => {
    const warn = mock((_message: string) => undefined);
    const fetch = async () => new Response('ok');

    expect(
      await createRuntimePaymentContext({
        runtime: runtimeWithConnector(),
        network: 'base',
        fetch,
        logger: { warn },
      })
    ).toEqual(nullContext);

    const missingAddress = await createRuntimePaymentContext({
      runtime: runtimeWithConnector({
        getWalletMetadata: async () => {
          throw new Error('wallet unavailable');
        },
      }),
      network: 'base',
      fetch,
      logger: { warn },
    });
    expect(missingAddress).toEqual({ ...nullContext, chainId: 8453 });

    const zeroAddress = await createRuntimePaymentContext({
      runtime: runtimeWithConnector({
        getWalletMetadata: async () => ({
          address: '0x0000000000000000000000000000000000000000',
        }),
      }),
      network: 'base',
      fetch,
      logger: { warn },
    });
    expect(zeroAddress).toEqual({ ...nullContext, chainId: 8453 });
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('rejects unknown CAIP-2 networks even when an explicit chain id exists', async () => {
    const warn = mock((_message: string) => undefined);
    const context = await createRuntimePaymentContext({
      runtime: runtimeWithConnector({}),
      network: 'unknown-network',
      chainId: 123,
      fetch: async () => new Response('ok'),
      logger: { warn },
    });

    expect(context).toEqual({
      ...nullContext,
      walletAddress: NORMALIZED_ADDRESS,
      chainId: 123,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unable to derive CAIP-2 network')
    );
  });

  it('adapts typed-data signing and refreshes the proxied wallet address', async () => {
    const signChallenge = mock(async () => '0xdeadbeef');
    const getWalletMetadata = mock()
      .mockResolvedValueOnce({ address: ADDRESS })
      .mockResolvedValueOnce({ address: UPDATED_ADDRESS });
    const context = await createRuntimePaymentContext({
      runtime: runtimeWithConnector({ getWalletMetadata, signChallenge }),
      chainId: 8453,
      fetch: async () => new Response('ok'),
    });

    await expect(
      context.signer?.signTypedData({
        domain: {},
        types: {},
        message: {},
        primaryType: '',
      })
    ).rejects.toThrow('missing primaryType');
    expect(
      await context.signer?.signTypedData({
        domain: { chainId: 1 },
        types: { Message: [{ name: 'value', type: 'string' }] },
        message: { value: 'hello' },
        primaryType: 'Message',
      })
    ).toBe('0xdeadbeef');
    expect(signChallenge).toHaveBeenCalledTimes(1);
    expect(context.signer?.address).toBe(UPDATED_ADDRESS);
  });

  it('wraps configured policies and contains fetch-wrapper initialization errors', async () => {
    const tracker = {} as PaymentTracker;
    const payments = {
      policyGroups: [{ name: 'bounded' }],
      paymentTracker: tracker,
    } as Partial<PaymentsRuntime>;
    const valid = await createRuntimePaymentContext({
      runtime: runtimeWithConnector({}, payments),
      network: 'base',
      fetch: async () => new Response('ok'),
    });
    expect(valid.fetchWithPayment).toBeFunction();

    const warn = mock((_message: string) => undefined);
    const failingFetch = async () => new Response('ok');
    Object.defineProperty(failingFetch, 'preconnect', {
      get() {
        throw new Error('preconnect unavailable');
      },
    });
    const failed = await createRuntimePaymentContext({
      runtime: runtimeWithConnector({}),
      network: 'base',
      fetch: failingFetch,
      logger: { warn },
    });
    expect(failed.fetchWithPayment).toBeNull();
    expect(failed.walletAddress).toBe(NORMALIZED_ADDRESS);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to initialise runtime-backed paid fetch')
    );
  });
});
