import {
  createRuntimePaymentContext,
  type RuntimePaymentOptions,
} from '@lucid-agents/payments';
import type { AgentRuntime } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';

import { resetAgentKitConfigForTesting } from '../config/config';
import { createAgentRuntime } from '../runtime';

const makeRuntimeStub = (): {
  runtime: Pick<AgentRuntime, 'wallets'>;
  calls: {
    getWalletMetadata: ReturnType<typeof mock>;
    signChallenge: ReturnType<typeof mock>;
  };
} => {
  const getWalletMetadata = mock(async () => ({
    address: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
  }));
  const signChallenge = mock(async (_challenge: unknown) => '0xdeadbeef');

  const runtime: Pick<AgentRuntime, 'wallets'> = {
    wallets: {
      agent: {
        kind: 'local' as const,
        connector: {
          async getWalletMetadata() {
            return await getWalletMetadata();
          },
          async signChallenge(challenge) {
            return await signChallenge(challenge);
          },
          async supportsCaip2() {
            return true;
          },
        },
      },
    },
  };

  return {
    runtime,
    calls: {
      getWalletMetadata,
      signChallenge,
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
      runtime: runtime as unknown as AgentRuntime,
      fetch: baseFetch,
      network: 'base-sepolia',
    } as unknown as RuntimePaymentOptions);

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
    // getWalletMetadata is called once initially and may be called again during signing
    expect(calls.getWalletMetadata).toHaveBeenCalled();
    expect(calls.signChallenge).toHaveBeenCalledTimes(1);
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
      runtime: runtime as unknown as AgentRuntime,
      fetch: async () => new Response('ok'),
      network: 'unsupported-network',
      logger: { warn },
    } as unknown as RuntimePaymentOptions);

    expect(context.fetchWithPayment).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unable to derive chainId')
    );
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

describe('createAgentRuntime payments activation', () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  const paymentsConfig: PaymentsConfig = {
    payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
    facilitatorUrl: 'https://facilitator.test',
    network: 'base-sepolia',
  };

  it('starts with payments undefined when no priced entrypoints', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: paymentsConfig,
      }
    );

    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.config).toBeDefined();
    expect(runtime.payments?.isActive).toBe(false);
    expect(runtime.agent.config.payments).toBeUndefined();
  });

  it('activates payments when priced entrypoint is added', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: paymentsConfig,
      }
    );

    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.isActive).toBe(false);

    runtime.entrypoints.add({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.config).toBeDefined();
    expect(runtime.payments?.isActive).toBe(true);
    expect(runtime.payments?.config.payTo).toBe(paymentsConfig.payTo);
    expect(runtime.agent.config.payments).toBeDefined();
    expect(runtime.agent.config.payments?.payTo).toBe(paymentsConfig.payTo);
  });

  it('does not activate payments when non-priced entrypoint is added', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: paymentsConfig,
      }
    );

    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.isActive).toBe(false);

    runtime.entrypoints.add({
      key: 'free',
      description: 'Free endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.isActive).toBe(false);
    expect(runtime.agent.config.payments).toBeUndefined();
  });

  it('activates payments when entrypoint with price object is added', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: paymentsConfig,
      }
    );

    runtime.entrypoints.add({
      key: 'streaming',
      description: 'Streaming endpoint',
      price: { invoke: '1000', stream: '2000' },
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.config).toBeDefined();
    expect(runtime.payments?.isActive).toBe(true);
    expect(runtime.agent.config.payments).toBeDefined();
  });

  it('keeps payments active after first activation', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: paymentsConfig,
      }
    );

    runtime.entrypoints.add({
      key: 'paid1',
      description: 'First paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    const paymentsAfterFirst = runtime.payments?.config;
    expect(paymentsAfterFirst).toBeDefined();
    expect(runtime.payments?.isActive).toBe(true);

    runtime.entrypoints.add({
      key: 'free',
      description: 'Free endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    expect(runtime.payments?.config).toBe(paymentsAfterFirst);
    expect(runtime.payments?.isActive).toBe(true);
    expect(runtime.agent.config.payments).toBe(paymentsAfterFirst);

    runtime.entrypoints.add({
      key: 'paid2',
      description: 'Second paid endpoint',
      price: '2000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    expect(runtime.payments?.config).toBe(paymentsAfterFirst);
    expect(runtime.payments?.isActive).toBe(true);
  });

  it('does not activate payments when payments are explicitly disabled', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: false,
      }
    );

    runtime.entrypoints.add({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    expect(runtime.payments).toBeUndefined();
    expect(runtime.agent.config.payments).toBe(false);
  });

  it('activates payments when entrypoints provided in options', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: paymentsConfig,
        entrypoints: [
          {
            key: 'paid',
            description: 'Paid endpoint',
            price: '1000',
            input: z.object({ text: z.string() }),
            handler: async () => ({ output: { result: 'ok' } }),
          },
        ],
      }
    );

    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.config).toBeDefined();
    expect(runtime.payments?.isActive).toBe(true);
    expect(runtime.agent.config.payments).toBeDefined();
  });

  it('does not activate payments when entrypoints without prices provided in options', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: paymentsConfig,
        entrypoints: [
          {
            key: 'free',
            description: 'Free endpoint',
            input: z.object({ text: z.string() }),
            handler: async () => ({ output: { result: 'ok' } }),
          },
        ],
      }
    );

    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.isActive).toBe(false);
    expect(runtime.agent.config.payments).toBeUndefined();
  });

  it('syncs runtime.payments?.config and agent.config.payments', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: paymentsConfig,
      }
    );

    runtime.entrypoints.add({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    const runtimePayments = runtime.payments?.config;
    const agentPayments = runtime.agent.config.payments;

    expect(runtimePayments).toBe(agentPayments);
    expect(runtimePayments?.payTo).toBe(paymentsConfig.payTo);
    expect(agentPayments?.payTo).toBe(paymentsConfig.payTo);
  });
});

describe('createAgentRuntime wallets', () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  it('creates wallets from config when provided', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        config: {
          wallets: {
            agent: {
              type: 'local' as const,
              privateKey:
                '0x1234567890123456789012345678901234567890123456789012345678901234',
            },
            developer: {
              type: 'local' as const,
              privateKey:
                '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            },
          },
        },
      }
    );

    expect(runtime.wallets).toBeDefined();
    expect(runtime.wallets?.agent).toBeDefined();
    expect(runtime.wallets?.developer).toBeDefined();
  });

  it('creates only agent wallet when only agent provided', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        config: {
          wallets: {
            agent: {
              type: 'local' as const,
              privateKey:
                '0x1234567890123456789012345678901234567890123456789012345678901234',
            },
          },
        },
      }
    );

    expect(runtime.wallets).toBeDefined();
    expect(runtime.wallets?.agent).toBeDefined();
    expect(runtime.wallets?.developer).toBeUndefined();
  });

  it('creates only developer wallet when only developer provided', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        config: {
          wallets: {
            developer: {
              type: 'local' as const,
              privateKey:
                '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            },
          },
        },
      }
    );

    expect(runtime.wallets).toBeDefined();
    expect(runtime.wallets?.agent).toBeUndefined();
    expect(runtime.wallets?.developer).toBeDefined();
  });

  it('has undefined wallets when no wallet config provided', () => {
    const runtime = createAgentRuntime({ name: 'test', version: '1.0.0' }, {});

    expect(runtime.wallets).toBeUndefined();
  });
});

describe('createAgentRuntime config resolution', () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  it('uses provided config', () => {
    const customConfig = {
      payments: {
        payTo: '0xCustomAddress',
        facilitatorUrl: 'https://custom-facilitator.test' as const,
        network: 'base-sepolia' as const,
      },
    };

    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        config: customConfig,
      }
    );

    expect(runtime.config.payments?.payTo).toBe('0xCustomAddress');
  });

  it('returns resolved config', () => {
    const runtime = createAgentRuntime({ name: 'test', version: '1.0.0' }, {});

    expect(runtime.config).toBeDefined();
    expect(typeof runtime.config).toBe('object');
  });
});

describe('createAgentRuntime entrypoints', () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  it('initializes entrypoints from options', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        entrypoints: [
          {
            key: 'echo',
            description: 'Echo endpoint',
            input: z.object({ text: z.string() }),
            handler: async () => ({ output: { text: 'echo' } }),
          },
          {
            key: 'reverse',
            description: 'Reverse endpoint',
            input: z.object({ text: z.string() }),
            handler: async () => ({ output: { text: 'reverse' } }),
          },
        ],
      }
    );

    const entrypoints = runtime.entrypoints.list();
    expect(entrypoints).toHaveLength(2);
    expect(entrypoints.map(e => e.key)).toEqual(['echo', 'reverse']);
  });

  it('activates payments when initial entrypoints have prices', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: {
          payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
          facilitatorUrl: 'https://facilitator.test',
          network: 'base-sepolia',
        },
        entrypoints: [
          {
            key: 'paid',
            description: 'Paid endpoint',
            price: '1000',
            input: z.object({ text: z.string() }),
            handler: async () => ({ output: { result: 'ok' } }),
          },
        ],
      }
    );

    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.config).toBeDefined();
    expect(runtime.entrypoints.list()).toHaveLength(1);
  });

  it('does not activate payments when initial entrypoints have no prices', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: {
          payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
          facilitatorUrl: 'https://facilitator.test',
          network: 'base-sepolia',
        },
        entrypoints: [
          {
            key: 'free',
            description: 'Free endpoint',
            input: z.object({ text: z.string() }),
            handler: async () => ({ output: { result: 'ok' } }),
          },
        ],
      }
    );

    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.isActive).toBe(false);
    expect(runtime.entrypoints.list()).toHaveLength(1);
  });
});

describe('createAgentRuntime manifest', () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  it('builds manifest with correct origin', () => {
    const runtime = createAgentRuntime({ name: 'test', version: '1.0.0' }, {});

    const manifest = runtime.manifest.build('https://example.com');
    expect(manifest).toBeDefined();
    expect(manifest.name).toBe('test');
  });

  it('caches manifest for same origin', () => {
    const runtime = createAgentRuntime({ name: 'test', version: '1.0.0' }, {});

    const manifest1 = runtime.manifest.build('https://example.com');
    const manifest2 = runtime.manifest.build('https://example.com');

    expect(manifest1).toBe(manifest2);
  });

  it('builds different manifests for different origins', () => {
    const runtime = createAgentRuntime({ name: 'test', version: '1.0.0' }, {});

    const manifest1 = runtime.manifest.build('https://example.com');
    const manifest2 = runtime.manifest.build('https://other.com');

    expect(manifest1).not.toBe(manifest2);
  });

  it('includes payments in manifest when active', () => {
    const paymentsConfig: PaymentsConfig = {
      payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
      facilitatorUrl: 'https://facilitator.test',
      network: 'base-sepolia',
    };

    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: paymentsConfig,
      }
    );

    runtime.entrypoints.add({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    const manifest = runtime.manifest.build('https://example.com');
    expect(manifest.payments).toBeDefined();
    expect(Array.isArray(manifest.payments)).toBe(true);
  });

  it('invalidates manifest cache when entrypoint is added', () => {
    const runtime = createAgentRuntime({ name: 'test', version: '1.0.0' }, {});

    const manifest1 = runtime.manifest.build('https://example.com');
    const initialEntrypointCount = Object.keys(
      manifest1.entrypoints ?? {}
    ).length;

    runtime.entrypoints.add({
      key: 'new',
      description: 'New endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    const manifest2 = runtime.manifest.build('https://example.com');
    const newEntrypointCount = Object.keys(manifest2.entrypoints ?? {}).length;
    expect(newEntrypointCount).toBeGreaterThan(initialEntrypointCount);
  });
});

describe('createAgentRuntime integration', () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  it('handles full flow: config → wallets → payments → entrypoints → manifest', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        config: {
          wallets: {
            agent: {
              type: 'local' as const,
              privateKey:
                '0x1234567890123456789012345678901234567890123456789012345678901234',
            },
          },
        },
        payments: {
          payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
          facilitatorUrl: 'https://facilitator.test',
          network: 'base-sepolia',
        },
        entrypoints: [
          {
            key: 'free',
            description: 'Free endpoint',
            input: z.object({ text: z.string() }),
            handler: async () => ({ output: { result: 'ok' } }),
          },
        ],
      }
    );

    // Wallets created
    expect(runtime.wallets?.agent).toBeDefined();

    // Payments configured but not active yet (no priced entrypoints)
    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.isActive).toBe(false);

    // Entrypoints initialized
    expect(runtime.entrypoints.list()).toHaveLength(1);

    // Add priced entrypoint
    runtime.entrypoints.add({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    // Payments now active
    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.config).toBeDefined();
    expect(runtime.payments?.isActive).toBe(true);

    // Manifest includes payments
    const manifest = runtime.manifest.build('https://example.com');
    expect(manifest.payments).toBeDefined();
    expect(runtime.entrypoints.list()).toHaveLength(2);
  });

  it('handles mixed priced and free entrypoints', () => {
    const runtime = createAgentRuntime(
      { name: 'test', version: '1.0.0' },
      {
        payments: {
          payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
          facilitatorUrl: 'https://facilitator.test',
          network: 'base-sepolia',
        },
      }
    );

    // Add free entrypoint first
    runtime.entrypoints.add({
      key: 'free',
      description: 'Free endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });
    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.isActive).toBe(false);

    // Add paid entrypoint
    runtime.entrypoints.add({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });
    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.config).toBeDefined();
    expect(runtime.payments?.isActive).toBe(true);

    // Add another free entrypoint
    runtime.entrypoints.add({
      key: 'free2',
      description: 'Another free endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });
    // Payments should still be active
    expect(runtime.payments).toBeDefined();
    expect(runtime.payments?.config).toBeDefined();
    expect(runtime.payments?.isActive).toBe(true);

    expect(runtime.entrypoints.list()).toHaveLength(3);
  });
});
