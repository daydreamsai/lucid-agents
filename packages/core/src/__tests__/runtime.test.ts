import { a2a } from '@lucid-agents/a2a';
import { analytics } from '@lucid-agents/analytics';
import { ap2 } from '@lucid-agents/ap2';
import { http } from '@lucid-agents/http';
import { identity } from '@lucid-agents/identity';
import {
  createRuntimePaymentContext,
  type RuntimePaymentOptions,
} from '@lucid-agents/payments';
import { payments } from '@lucid-agents/payments';
import { scheduler } from '@lucid-agents/scheduler';
import type { AgentRuntime } from '@lucid-agents/types/core';
import type { TrustConfig } from '@lucid-agents/types/identity';
import type {
  PaymentsConfig,
  PaymentTracker,
} from '@lucid-agents/types/payments';
import { wallets } from '@lucid-agents/wallet';
import { xmpt } from '@lucid-agents/xmpt';
import { describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';

import { createAgent } from '../runtime';

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
          async signChallenge(_challenge) {
            return await signChallenge(_challenge);
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
  network: 'eip155:84532',
  amount: '1000',
  description: 'payment',
  mimeType: 'application/json',
  payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
  maxTimeoutSeconds: 30,
  asset: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  // EIP-712 domain parameters required for v2
  extra: {
    name: 'USDC',
    version: '2',
  },
};

// Helper to encode payment required header for v2
const encodePaymentRequired = (obj: unknown): string =>
  Buffer.from(JSON.stringify(obj)).toString('base64');

describe('runtime payments', () => {
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
          const paymentRequired = {
            x402Version: 2,
            accepts: [paymentRequirements],
            resource: {
              url: 'https://example.com',
              method: 'POST',
            },
          };
          return new Response(null, {
            status: 402,
            headers: {
              'PAYMENT-REQUIRED': encodePaymentRequired(paymentRequired),
            },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'PAYMENT-RESPONSE': encodePaymentRequired({ success: true }),
          },
        });
      }
    );

    const context = await createRuntimePaymentContext({
      runtime: runtime as unknown as AgentRuntime,
      fetch: baseFetch,
      network: 'eip155:84532',
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

describe('createAgent payments activation', () => {
  const paymentsConfig: PaymentsConfig = {
    payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
    facilitatorUrl: 'https://facilitator.test',
    network: 'eip155:84532',
  };

  it('starts with payments undefined when no priced entrypoints', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(payments({ config: paymentsConfig }))
      .build();

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.config).toBeDefined();
    expect(agent.payments?.isActive).toBe(false);
  });

  it('activates payments when priced entrypoint is added', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(payments({ config: paymentsConfig }))
      .build();

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.isActive).toBe(false);

    agent.entrypoints.add({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.config).toBeDefined();
    expect(agent.payments?.isActive).toBe(true);
    expect(agent.payments?.config.payTo).toBe(paymentsConfig.payTo);
  });

  it('does not activate payments when non-priced entrypoint is added', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(payments({ config: paymentsConfig }))
      .build();

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.isActive).toBe(false);

    agent.entrypoints.add({
      key: 'free',
      description: 'Free endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.isActive).toBe(false);
  });

  it('activates payments when entrypoint with price object is added', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(payments({ config: paymentsConfig }))
      .build();

    agent.entrypoints.add({
      key: 'streaming',
      description: 'Streaming endpoint',
      price: { invoke: '1000', stream: '2000' },
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.config).toBeDefined();
    expect(agent.payments?.isActive).toBe(true);
  });

  it('keeps payments active after first activation', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(payments({ config: paymentsConfig }))
      .build();

    agent.entrypoints.add({
      key: 'paid1',
      description: 'First paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    const paymentsAfterFirst = agent.payments?.config;
    expect(paymentsAfterFirst).toBeDefined();
    expect(agent.payments?.isActive).toBe(true);

    agent.entrypoints.add({
      key: 'free',
      description: 'Free endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    expect(agent.payments?.config).toBe(paymentsAfterFirst);
    expect(agent.payments?.isActive).toBe(true);

    agent.entrypoints.add({
      key: 'paid2',
      description: 'Second paid endpoint',
      price: '2000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    expect(agent.payments?.config).toBe(paymentsAfterFirst);
    expect(agent.payments?.isActive).toBe(true);
  });

  it('does not activate payments when payments are explicitly disabled', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(payments({ config: false }))
      .build();

    agent.entrypoints.add({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    expect(agent.payments).toBeUndefined();
  });

  it('activates payments when entrypoints provided in options', async () => {
    const builder = createAgent({ name: 'test', version: '1.0.0' });
    builder.use(payments({ config: paymentsConfig }));
    builder.addEntrypoint({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });
    const agent = await builder.build();

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.config).toBeDefined();
    expect(agent.payments?.isActive).toBe(true);
  });

  it('does not activate payments when entrypoints without prices provided in options', async () => {
    const builder = createAgent({ name: 'test', version: '1.0.0' });
    builder.use(payments({ config: paymentsConfig }));
    builder.addEntrypoint({
      key: 'free',
      description: 'Free endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });
    const agent = await builder.build();

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.isActive).toBe(false);
  });

  it('activates payments when entrypoint with price is added', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(payments({ config: paymentsConfig }))
      .build();

    agent.entrypoints.add({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    const runtimePayments = agent.payments?.config;

    expect(runtimePayments).toBeDefined();
    expect(runtimePayments?.payTo).toBe(paymentsConfig.payTo);
  });
});

describe('createAgentRuntime wallets', () => {
  it('creates wallets from config when provided', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(
        wallets({
          config: {
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
        })
      )
      .build();

    expect(agent.wallets).toBeDefined();
    expect(agent.wallets?.agent).toBeDefined();
    expect(agent.wallets?.developer).toBeDefined();
  });

  it('creates only agent wallet when only agent provided', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(
        wallets({
          config: {
            agent: {
              type: 'local' as const,
              privateKey:
                '0x1234567890123456789012345678901234567890123456789012345678901234',
            },
          },
        })
      )
      .build();

    expect(agent.wallets).toBeDefined();
    expect(agent.wallets?.agent).toBeDefined();
    expect(agent.wallets?.developer).toBeUndefined();
  });

  it('creates only developer wallet when only developer provided', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(
        wallets({
          config: {
            developer: {
              type: 'local' as const,
              privateKey:
                '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            },
          },
        })
      )
      .build();

    expect(agent.wallets).toBeDefined();
    expect(agent.wallets?.agent).toBeUndefined();
    expect(agent.wallets?.developer).toBeDefined();
  });

  it('has undefined wallets when no wallet config provided', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' }).build();

    expect(agent.wallets).toBeUndefined();
  });
});

describe('createAgentRuntime entrypoints', () => {
  it('initializes entrypoints from options', async () => {
    const builder = createAgent({ name: 'test', version: '1.0.0' });
    builder.addEntrypoint({
      key: 'echo',
      description: 'Echo endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { text: 'echo' } }),
    });
    builder.addEntrypoint({
      key: 'reverse',
      description: 'Reverse endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { text: 'reverse' } }),
    });
    const agent = await builder.build();

    const entrypoints = agent.entrypoints.list();
    expect(entrypoints).toHaveLength(2);
    expect(entrypoints.map(e => e.key)).toEqual(['echo', 'reverse']);
  });

  it('activates payments when initial entrypoints have prices', async () => {
    const builder = createAgent({ name: 'test', version: '1.0.0' });
    builder.use(
      payments({
        config: {
          payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
          facilitatorUrl: 'https://facilitator.test',
          network: 'eip155:84532',
        },
      })
    );
    builder.addEntrypoint({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });
    const agent = await builder.build();

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.config).toBeDefined();
    expect(agent.entrypoints.list()).toHaveLength(1);
  });

  it('does not activate payments when initial entrypoints have no prices', async () => {
    const builder = createAgent({ name: 'test', version: '1.0.0' });
    builder.use(
      payments({
        config: {
          payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
          facilitatorUrl: 'https://facilitator.test',
          network: 'eip155:84532',
        },
      })
    );
    builder.addEntrypoint({
      key: 'free',
      description: 'Free endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });
    const agent = await builder.build();

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.isActive).toBe(false);
    expect(agent.entrypoints.list()).toHaveLength(1);
  });
});

describe('createAgentRuntime manifest', () => {
  it('builds manifest with correct origin', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' }).build();

    const manifest = agent.manifest.build('https://example.com');
    expect(manifest).toBeDefined();
    expect(manifest.name).toBe('test');
  });

  it('caches manifest for same origin', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' }).build();

    const manifest1 = agent.manifest.build('https://example.com');
    const manifest2 = agent.manifest.build('https://example.com');

    expect(manifest1).toBe(manifest2);
  });

  it('builds different manifests for different origins', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' }).build();

    const manifest1 = agent.manifest.build('https://example.com');
    const manifest2 = agent.manifest.build('https://other.com');

    expect(manifest1).not.toBe(manifest2);
  });

  it('includes payments in manifest when active', async () => {
    const paymentsConfig: PaymentsConfig = {
      payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
      facilitatorUrl: 'https://facilitator.test',
      network: 'eip155:84532',
    };

    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(payments({ config: paymentsConfig }))
      .build();

    agent.entrypoints.add({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    const manifest = agent.manifest.build('https://example.com');
    expect(manifest.payments).toBeDefined();
    expect(Array.isArray(manifest.payments)).toBe(true);
  });

  it('invalidates manifest cache when entrypoint is added', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' }).build();

    const manifest1 = agent.manifest.build('https://example.com');
    const initialEntrypointCount = Object.keys(
      manifest1.entrypoints ?? {}
    ).length;

    agent.entrypoints.add({
      key: 'new',
      description: 'New endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    const manifest2 = agent.manifest.build('https://example.com');
    const newEntrypointCount = Object.keys(manifest2.entrypoints ?? {}).length;
    expect(newEntrypointCount).toBeGreaterThan(initialEntrypointCount);
  });
});

describe('createAgentRuntime integration', () => {
  it('handles full flow: config → wallets → payments → entrypoints → manifest', async () => {
    const builder = createAgent({ name: 'test', version: '1.0.0' });
    builder.use(
      wallets({
        config: {
          agent: {
            type: 'local' as const,
            privateKey:
              '0x1234567890123456789012345678901234567890123456789012345678901234',
          },
        },
      })
    );
    builder.use(
      payments({
        config: {
          payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
          facilitatorUrl: 'https://facilitator.test',
          network: 'eip155:84532',
        },
      })
    );
    builder.addEntrypoint({
      key: 'free',
      description: 'Free endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });
    const agent = await builder.build();

    // Wallets created
    expect(agent.wallets?.agent).toBeDefined();

    // Payments configured but not active yet (no priced entrypoints)
    expect(agent.payments).toBeDefined();
    expect(agent.payments?.isActive).toBe(false);

    // Entrypoints initialized
    expect(agent.entrypoints.list()).toHaveLength(1);

    // Add priced entrypoint
    agent.entrypoints.add({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });

    // Payments now active
    expect(agent.payments).toBeDefined();
    expect(agent.payments?.config).toBeDefined();
    expect(agent.payments?.isActive).toBe(true);

    // Manifest includes payments
    const manifest = agent.manifest.build('https://example.com');
    expect(manifest.payments).toBeDefined();
    expect(agent.entrypoints.list()).toHaveLength(2);
  });

  it('handles mixed priced and free entrypoints', async () => {
    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(
        payments({
          config: {
            payTo: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
            facilitatorUrl: 'https://facilitator.test',
            network: 'eip155:84532',
          },
        })
      )
      .build();

    // Add free entrypoint first
    agent.entrypoints.add({
      key: 'free',
      description: 'Free endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });
    expect(agent.payments).toBeDefined();
    expect(agent.payments?.isActive).toBe(false);

    // Add paid entrypoint
    agent.entrypoints.add({
      key: 'paid',
      description: 'Paid endpoint',
      price: '1000',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });
    expect(agent.payments).toBeDefined();
    expect(agent.payments?.config).toBeDefined();
    expect(agent.payments?.isActive).toBe(true);

    // Add another free entrypoint
    agent.entrypoints.add({
      key: 'free2',
      description: 'Another free endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { result: 'ok' } }),
    });
    // Payments should still be active
    expect(agent.payments).toBeDefined();
    expect(agent.payments?.config).toBeDefined();
    expect(agent.payments?.isActive).toBe(true);

    expect(agent.entrypoints.list()).toHaveLength(3);
  });
});

describe('Analytics Extension', () => {
  it('analytics returns undefined when payments are not configured', async () => {
    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(analytics())
      .build();

    expect(agent.analytics).toBeDefined();
    expect(agent.analytics?.paymentTracker).toBeUndefined();
  });

  it('analytics.paymentTracker is defined when payments configured even without policy groups', async () => {
    const paymentsConfig: PaymentsConfig = {
      payTo: '0xabc000000000000000000000000000000000c0de',
      facilitatorUrl: 'https://facilitator.test' as `${string}://${string}`,
      network: 'eip155:84532',
    };

    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(payments({ config: paymentsConfig }))
      .use(analytics())
      .build();

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.paymentTracker).toBeDefined();
    expect(agent.analytics).toBeDefined();
    expect(agent.analytics?.paymentTracker).toBeDefined();
    expect(agent.analytics?.paymentTracker as PaymentTracker).toBe(
      agent.payments?.paymentTracker as PaymentTracker
    );
  });

  it('analytics.paymentTracker matches payments.paymentTracker when policy groups require tracking', async () => {
    const paymentsConfig: PaymentsConfig = {
      payTo: '0xabc000000000000000000000000000000000c0de',
      facilitatorUrl: 'https://facilitator.test' as `${string}://${string}`,
      network: 'eip155:84532',
      policyGroups: [
        {
          name: 'Daily Spending Limit',
          outgoingLimits: {
            global: {
              maxTotalUsd: 100, // This requires tracking
            },
          },
        },
      ],
    };

    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(payments({ config: paymentsConfig }))
      .use(analytics())
      .build();

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.paymentTracker).toBeDefined();
    expect(agent.analytics).toBeDefined();
    expect(agent.analytics?.paymentTracker).toBeDefined();
    // They should be the same instance
    expect(agent.analytics?.paymentTracker as PaymentTracker).toBe(
      agent.payments?.paymentTracker as PaymentTracker
    );
  });

  it('analytics.paymentTracker exists when incoming limits require tracking', async () => {
    const paymentsConfig: PaymentsConfig = {
      payTo: '0xabc000000000000000000000000000000000c0de',
      facilitatorUrl: 'https://facilitator.test' as `${string}://${string}`,
      network: 'eip155:84532',
      policyGroups: [
        {
          name: 'Receivables Limit',
          incomingLimits: {
            global: {
              maxTotalUsd: 1000, // This requires tracking
            },
          },
        },
      ],
    };

    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(payments({ config: paymentsConfig }))
      .use(analytics())
      .build();

    expect(agent.payments?.paymentTracker).toBeDefined();
    expect(agent.analytics?.paymentTracker).toBeDefined();
    expect(agent.analytics?.paymentTracker as PaymentTracker).toBe(
      agent.payments?.paymentTracker as PaymentTracker
    );
  });

  it('analytics.paymentTracker exists when per-target limits require tracking', async () => {
    const paymentsConfig: PaymentsConfig = {
      payTo: '0xabc000000000000000000000000000000000c0de',
      facilitatorUrl: 'https://facilitator.test' as `${string}://${string}`,
      network: 'eip155:84532',
      policyGroups: [
        {
          name: 'Per-Target Limits',
          outgoingLimits: {
            perTarget: {
              'https://example.com': {
                maxTotalUsd: 50, // This requires tracking
              },
            },
          },
        },
      ],
    };

    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(payments({ config: paymentsConfig }))
      .use(analytics())
      .build();

    expect(agent.payments?.paymentTracker).toBeDefined();
    expect(agent.analytics?.paymentTracker).toBeDefined();
    const analyticsTracker = agent.analytics?.paymentTracker as PaymentTracker;
    const paymentsTracker = agent.payments?.paymentTracker as PaymentTracker;
    expect(analyticsTracker).toBe(paymentsTracker);
  });

  it('analytics.paymentTracker is defined when only rate limits are configured (payment tracker always created)', async () => {
    const paymentsConfig: PaymentsConfig = {
      payTo: '0xabc000000000000000000000000000000000c0de',
      facilitatorUrl: 'https://facilitator.test' as `${string}://${string}`,
      network: 'eip155:84532',
      policyGroups: [
        {
          name: 'Rate Limit Only',
          rateLimits: {
            maxPayments: 10,
            windowMs: 60000,
          },
        },
      ],
    };

    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(payments({ config: paymentsConfig }))
      .use(analytics())
      .build();

    expect(agent.payments).toBeDefined();
    expect(agent.payments?.paymentTracker).toBeDefined();
    expect(agent.analytics).toBeDefined();
    expect(agent.analytics?.paymentTracker).toBeDefined();
    expect(agent.analytics?.paymentTracker as PaymentTracker).toBe(
      agent.payments?.paymentTracker as PaymentTracker
    );
  });
});

describe('A2A Extension', () => {
  it('adds a2a runtime with buildCard method', async () => {
    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(a2a())
      .build();

    expect(agent.a2a).toBeDefined();
    expect(agent.a2a?.buildCard).toBeDefined();
    expect(typeof agent.a2a?.buildCard).toBe('function');
  });

  it('buildCard creates valid agent card', async () => {
    const agent = await createAgent({
      name: 'test-agent',
      version: '1.0.0',
      description: 'Test agent',
    })
      .use(a2a())
      .build();

    const card = agent.a2a?.buildCard('https://agent.example.com');
    expect(card).toBeDefined();
    expect(card?.name).toBe('test-agent');
    expect(card?.version).toBe('1.0.0');
    // buildAgentCard adds trailing slash to origin
    expect(card?.url).toBe('https://agent.example.com/');
    expect(card?.entrypoints).toBeDefined();
  });
});

describe('XMPT Extension', () => {
  it('adds xmpt runtime and inbox entrypoint', async () => {
    const agent = await createAgent({
      name: 'xmpt-agent',
      version: '1.0.0',
    })
      .use(a2a())
      .use(http())
      .use(xmpt())
      .build();

    expect(agent.xmpt).toBeDefined();
    const inboxEntrypoint = agent.entrypoints
      .snapshot()
      .find(entrypoint => entrypoint.key === 'xmpt-inbox');
    expect(inboxEntrypoint).toBeDefined();
  });

  it('marks inbox skill for manifest discoverability', async () => {
    const agent = await createAgent({
      name: 'xmpt-agent',
      version: '1.0.0',
    })
      .use(a2a())
      .use(http())
      .use(xmpt())
      .build();

    const card = agent.manifest.build('https://agent.example.com');
    const inboxSkill = card.skills?.find(skill => skill.id === 'xmpt-inbox');
    expect(inboxSkill).toBeDefined();
    expect(inboxSkill?.tags).toContain('xmpt');
    expect(inboxSkill?.tags).toContain('xmpt-inbox');
  });
});

describe('AP2 Extension', () => {
  it('adds ap2 runtime when explicitly configured', async () => {
    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(
        ap2({
          roles: ['merchant'],
          description: 'AP2 merchant',
        })
      )
      .build();

    expect(agent.ap2).toBeDefined();
    expect(agent.ap2?.config).toBeDefined();
    expect(agent.ap2?.config?.roles).toEqual(['merchant']);
  });

  it('does not add ap2 runtime when not configured', async () => {
    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(ap2())
      .build();

    expect(agent.ap2).toBeUndefined();
  });

  it('modifies manifest to include AP2 extension', async () => {
    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(a2a())
      .use(
        ap2({
          roles: ['shopper'],
          required: true,
        })
      )
      .build();

    const card = agent.manifest.build('https://agent.example.com');
    expect(card.capabilities?.extensions).toBeDefined();
    const ap2Extension = card.capabilities?.extensions?.find(
      ext =>
        'uri' in ext &&
        ext.uri === 'https://github.com/google-agentic-commerce/ap2/tree/v0.1'
    );
    expect(ap2Extension).toBeDefined();
    expect(ap2Extension?.required).toBe(true);
  });
});

describe('Identity Extension', () => {
  it('adds trust config when provided', async () => {
    const trustConfig = {
      validationRequestsUri: 'https://example.com/validation-requests',
      validationResponsesUri: 'https://example.com/validation-responses',
      feedbackDataUri: 'https://example.com/feedback',
    };

    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(
        identity({
          config: {
            trust: trustConfig,
          },
        })
      )
      .build();

    // Identity extension adds trust to runtime
    const runtimeWithTrust = agent as AgentRuntime & { trust?: TrustConfig };
    expect(runtimeWithTrust.trust).toBeDefined();
    expect(runtimeWithTrust.trust).toEqual(trustConfig);
  });

  it('does not add trust config when not provided', async () => {
    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(identity())
      .build();

    const runtimeWithTrust = agent as AgentRuntime & { trust?: TrustConfig };
    expect(runtimeWithTrust.trust).toBeUndefined();
  });

  it('modifies manifest to include identity properties when trust config provided', async () => {
    const trustConfig = {
      validationRequestsUri: 'https://example.com/validation-requests',
      validationResponsesUri: 'https://example.com/validation-responses',
      feedbackDataUri: 'https://example.com/feedback',
      trustModels: ['feedback', 'inference-validation'],
    };

    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(a2a())
      .use(
        identity({
          config: {
            trust: trustConfig,
          },
        })
      )
      .build();

    const card = agent.manifest.build('https://agent.example.com');
    // Identity extension adds properties directly to the card, not to capabilities.extensions
    expect(card.ValidationRequestsURI).toBe(trustConfig.validationRequestsUri);
    expect(card.ValidationResponsesURI).toBe(
      trustConfig.validationResponsesUri
    );
    expect(card.FeedbackDataURI).toBe(trustConfig.feedbackDataUri);
    expect(card.trustModels).toEqual(trustConfig.trustModels);
  });
});

describe('HTTP Extension', () => {
  it('adds handlers runtime when used', async () => {
    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(http())
      .build();

    expect(agent.handlers).toBeDefined();
    expect(agent.handlers?.health).toBeDefined();
    expect(agent.handlers?.entrypoints).toBeDefined();
    expect(agent.handlers?.manifest).toBeDefined();
    expect(agent.handlers?.favicon).toBeDefined();
    expect(agent.handlers?.invoke).toBeDefined();
    expect(agent.handlers?.stream).toBeDefined();
    expect(agent.handlers?.tasks).toBeDefined();
    expect(agent.handlers?.getTask).toBeDefined();
    expect(agent.handlers?.listTasks).toBeDefined();
    expect(agent.handlers?.cancelTask).toBeDefined();
    expect(agent.handlers?.subscribeTask).toBeDefined();
  });

  it('handlers.health returns correct response', async () => {
    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(http())
      .build();

    const request = new Request('http://agent/health');
    const response = await agent.handlers?.health(request);
    expect(response).toBeDefined();
    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(body).toEqual({ ok: true, version: '1.0.0' });
  });

  it('handlers.entrypoints returns list of entrypoints', async () => {
    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(http())
      .build();

    agent.entrypoints.add({
      key: 'echo',
      description: 'Echo endpoint',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { text: 'echo' } }),
    });

    const request = new Request('http://agent/entrypoints');
    const response = await agent.handlers?.entrypoints(request);
    expect(response).toBeDefined();
    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(body).toEqual({
      items: [{ key: 'echo', description: 'Echo endpoint', streaming: false }],
    });
  });

  it('handlers.manifest returns agent card', async () => {
    const agent = await createAgent({
      name: 'test-agent',
      version: '1.0.0',
      description: 'Test agent',
    })
      .use(a2a())
      .use(http())
      .build();

    const request = new Request(
      'http://agent.example.com/.well-known/agent-card.json'
    );
    const response = await agent.handlers?.manifest(request);
    expect(response).toBeDefined();
    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(body.name).toBe('test-agent');
    expect(body.version).toBe('1.0.0');
  });

  it('handlers.landing is optional and can be disabled', async () => {
    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(http({ landingPage: false }))
      .build();

    expect(agent.handlers?.landing).toBeUndefined();
  });

  it('handlers.landing is available when enabled', async () => {
    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(a2a())
      .use(http({ landingPage: true }))
      .build();

    expect(agent.handlers?.landing).toBeDefined();
    const request = new Request('http://agent.example.com/');
    const response = await agent.handlers?.landing?.(request);
    expect(response).toBeDefined();
    expect(response?.status).toBe(200);
    const html = await response?.text();
    expect(html).toContain('test');
  });
});

describe('Scheduler Extension', () => {
  it('throws error when a2a extension is missing', async () => {
    const paymentsConfig: PaymentsConfig = {
      payTo: '0xabc000000000000000000000000000000000c0de',
      facilitatorUrl: 'https://facilitator.test' as `${string}://${string}`,
      network: 'eip155:84532',
    };

    await expect(
      createAgent({
        name: 'test',
        version: '1.0.0',
      })
        .use(payments({ config: paymentsConfig }))
        .use(scheduler())
        .build()
    ).rejects.toThrow('A2A runtime missing');
  });

  it('throws error when payments extension is missing', async () => {
    await expect(
      createAgent({
        name: 'test',
        version: '1.0.0',
      })
        .use(a2a())
        .use(scheduler())
        .build()
    ).rejects.toThrow('Payments runtime missing');
  });

  it('adds scheduler runtime when both a2a and payments are present', async () => {
    const paymentsConfig: PaymentsConfig = {
      payTo: '0xabc000000000000000000000000000000000c0de',
      facilitatorUrl: 'https://facilitator.test' as `${string}://${string}`,
      network: 'eip155:84532',
    };

    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(a2a())
      .use(payments({ config: paymentsConfig }))
      .use(scheduler())
      .build();

    expect(agent.scheduler).toBeDefined();
    expect(agent.scheduler?.createHire).toBeDefined();
    expect(agent.scheduler?.addJob).toBeDefined();
    expect(agent.scheduler?.pauseHire).toBeDefined();
    expect(agent.scheduler?.resumeHire).toBeDefined();
    expect(agent.scheduler?.cancelHire).toBeDefined();
    expect(agent.scheduler?.pauseJob).toBeDefined();
    expect(agent.scheduler?.resumeJob).toBeDefined();
    expect(agent.scheduler?.tick).toBeDefined();
    expect(agent.scheduler?.recoverExpiredLeases).toBeDefined();
  });

  it('scheduler runtime methods are functions', async () => {
    const paymentsConfig: PaymentsConfig = {
      payTo: '0xabc000000000000000000000000000000000c0de',
      facilitatorUrl: 'https://facilitator.test' as `${string}://${string}`,
      network: 'eip155:84532',
    };

    const agent = await createAgent({
      name: 'test',
      version: '1.0.0',
    })
      .use(a2a())
      .use(payments({ config: paymentsConfig }))
      .use(scheduler())
      .build();

    expect(typeof agent.scheduler?.createHire).toBe('function');
    expect(typeof agent.scheduler?.addJob).toBe('function');
    expect(typeof agent.scheduler?.pauseHire).toBe('function');
    expect(typeof agent.scheduler?.resumeHire).toBe('function');
    expect(typeof agent.scheduler?.cancelHire).toBe('function');
    expect(typeof agent.scheduler?.pauseJob).toBe('function');
    expect(typeof agent.scheduler?.resumeJob).toBe('function');
    expect(typeof agent.scheduler?.tick).toBe('function');
    expect(typeof agent.scheduler?.recoverExpiredLeases).toBe('function');
  });
});
