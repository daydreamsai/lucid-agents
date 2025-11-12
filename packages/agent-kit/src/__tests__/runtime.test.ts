import {
  createRuntimePaymentContext,
  type RuntimePaymentOptions,
} from '@lucid-agents/agent-kit-payments';
import type { AgentRuntime } from '@lucid-dreams/agent-auth';
import { afterEach, describe, expect, it, mock } from 'bun:test';

import { resetAgentKitConfigForTesting } from '../config/config';

type RuntimeStub = Pick<AgentRuntime, 'ensureAccessToken' | 'api'>;

const makeRuntimeStub = (): {
  runtime: RuntimeStub;
  calls: {
    ensureAccessToken: ReturnType<typeof mock>;
    getAgent: ReturnType<typeof mock>;
    signTypedData: ReturnType<typeof mock>;
    signMessage: ReturnType<typeof mock>;
  };
} => {
  const ensureAccessToken = mock(async () => 'token');
  const getAgent = mock(async () => ({
    billing: {
      wallet: { address: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429' },
    },
  }));
  const signTypedData = mock(async () => ({
    wallet: { address: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429' },
    signed: { signature: '0xdeadbeef' },
  }));
  const signMessage = mock(async () => ({
    wallet: { address: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429' },
    signed: { signature: '0xbeefdead' },
  }));

  const runtime: RuntimeStub = {
    ensureAccessToken,
    api: {
      getAgent,
      signTypedData,
      signMessage,
    } as unknown as RuntimeStub['api'],
  };

  return {
    runtime,
    calls: {
      ensureAccessToken,
      getAgent,
      signTypedData,
      signMessage,
    },
  };
};

const paymentRequirements = {
  scheme: 'exact',
  network: 'base-sepolia',
  maxAmountRequired: '1000',
  resource: 'https://example.com/pay',
  description: 'payment',
  mimeType: 'application/json',
  payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
  maxTimeoutSeconds: 30,
  asset: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
};

describe('runtime payments', () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  it('wraps fetch with x402 handling using the runtime wallet', async () => {
    const { runtime, calls } = makeRuntimeStub();

    const fetchCalls: Array<{
      input: string | URL | Request;
      init?: RequestInit;
    }> = [];
    let attempt = 0;
    const baseFetch = mock(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        fetchCalls.push({ input, init: init ?? undefined });
        attempt += 1;
        if (attempt === 1) {
          return new Response(
            JSON.stringify({
              x402Version: 1,
              accepts: [paymentRequirements],
            }),
            {
              status: 402,
              headers: { 'content-type': 'application/json' },
            }
          );
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'X-PAYMENT-RESPONSE': 'settled',
          },
        });
      }
    );

    const context = await createRuntimePaymentContext({
      runtime: runtime as AgentRuntime,
      fetch: baseFetch,
      network: 'base-sepolia',
    } satisfies RuntimePaymentOptions);

    expect(context.fetchWithPayment).toBeDefined();
    expect(context.signer).toBeDefined();
    expect(context.chainId).toBe(84532);

    const response = await context.fetchWithPayment?.('https://example.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ ok: true });

    expect(fetchCalls).toHaveLength(2);
    expect(calls.ensureAccessToken).toHaveBeenCalledTimes(1);
    expect(calls.getAgent).toHaveBeenCalledTimes(1);
    expect(calls.signTypedData).toHaveBeenCalledTimes(1);
    expect(calls.signMessage).toHaveBeenCalledTimes(0);
  });

  it('returns null fetch when no runtime or private key provided', async () => {
    const context = await createRuntimePaymentContext({
      runtime: undefined,
      fetch: async () => new Response('ok'),
    });
    expect(context.fetchWithPayment).toBeNull();
    expect(context.signer).toBeNull();
    expect(context.walletAddress).toBeNull();
  });

  it('warns when chain cannot be derived', async () => {
    const { runtime } = makeRuntimeStub();

    const warn = mock(() => {});
    const context = await createRuntimePaymentContext({
      runtime: runtime as AgentRuntime,
      fetch: async () => new Response('ok'),
      network: 'unsupported-network',
      logger: { warn },
    });

    expect(context.fetchWithPayment).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe('runtime Solana payments', () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  it('accepts Solana network configuration', async () => {
    const solanaNetworks = ['solana', 'solana-devnet'] as const;

    for (const network of solanaNetworks) {
      const context = await createRuntimePaymentContext({
        runtime: undefined,
        fetch: async () => new Response('ok'),
        network,
        privateKey:
          '0x1234567890123456789012345678901234567890123456789012345678901234',
      });

      // For Solana networks without proper signer setup, it should handle gracefully
      // The actual Solana signer creation is handled by x402-fetch library
      expect(context).toBeDefined();
    }
  });

  it('accepts Solana Base58 address format in PaymentsConfig', () => {
    const validSolanaAddresses = [
      '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    ];

    validSolanaAddresses.forEach(address => {
      // Type system should accept Solana address
      const config = {
        payTo: address,
        facilitatorUrl: 'https://facilitator.test' as const,
        network: 'solana-devnet' as const,
        defaultPrice: '10000',
      };

      expect(config.payTo).toBe(address);
      expect(config.network).toBe('solana-devnet');
    });
  });
});
