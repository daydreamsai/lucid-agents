import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { createAgentApp } from '@lucid-agents/hono';
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import type { PaymentsConfig } from '@lucid-agents/types/payments';

describe('Hono Solana Payments', () => {
  const solanaPayments: PaymentsConfig = {
    payTo: '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz', // Solana Base58 address
    facilitatorUrl: 'https://facilitator.test',
    network: 'solana-devnet',
  };

  it('creates agent with Solana network configuration', async () => {
    const agent = await createAgent({
      name: 'solana-agent',
      version: '1.0.0',
      description: 'Agent accepting Solana payments',
    })
      .use(http())
      .use(payments({ config: solanaPayments }))
      .build();
    const { app, addEntrypoint } = await createAgentApp(agent);

    addEntrypoint({
      key: 'echo',
      description: 'Echo back input',
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      async handler({ input }) {
        return {
          output: { text: input.text },
          usage: { total_tokens: 0 },
        };
      },
    });

    expect(app).toBeDefined();
  });

  it('includes Solana network in payment requirements', async () => {
    // Note: This test verifies configuration only.
    // Actual 402 response testing would require mocking the x402-hono middleware
    // which handles payment verification. The middleware is an external package
    // that should support solana-devnet and solana networks.

    const agent = await createAgent({
      name: 'solana-agent',
      version: '1.0.0',
    })
      .use(http())
      .use(payments({ config: solanaPayments }))
      .build();
    const { app, addEntrypoint } = await createAgentApp(agent);

    addEntrypoint({
      key: 'paid-task',
      description: 'A paid task',
      input: z.object({ data: z.string() }),
      async handler({ input }) {
        return {
          output: { result: `Processed: ${input.data}` },
        };
      },
    });

    // Verify app was created successfully with Solana config
    expect(app).toBeDefined();
  });

  it('accepts Solana Base58 address format', async () => {
    const validSolanaAddresses = [
      '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    ];

    for (const address of validSolanaAddresses) {
      const config: PaymentsConfig = {
        payTo: address,
        facilitatorUrl: 'https://facilitator.test',
        network: 'solana',
      };

      const agent = await createAgent({ name: 'test', version: '1.0.0' })
        .use(http())
        .use(payments({ config }))
        .build();
      const { app } = await createAgentApp(agent);

      expect(app).toBeDefined();
    }
  });

  it('accepts both Solana mainnet and devnet configurations', async () => {
    // Note: Testing actual payment flow requires mocking x402-hono middleware.
    // This test verifies that Solana network configs are accepted by the app.

    const networks = [
      { value: 'solana', name: 'mainnet' },
      { value: 'solana-devnet', name: 'devnet' },
    ] as const;

    for (const { value: network, name } of networks) {
      const agent = await createAgent({ name: 'test', version: '1.0.0' })
        .use(http())
        .use(
          payments({
            config: {
              ...solanaPayments,
              network,
            },
          })
        )
        .build();
      const { app, addEntrypoint } = await createAgentApp(agent);

      addEntrypoint({
        key: 'test',
        async handler() {
          return { output: { ok: true } };
        },
      });

      expect(app).toBeDefined();
    }
  });

  it('includes manifest with Solana payment metadata', async () => {
    const agent = await createAgent({
      name: 'solana-agent',
      version: '1.0.0',
      description: 'Solana payment agent',
    })
      .use(http())
      .use(payments({ config: solanaPayments }))
      .build();
    const { app } = await createAgentApp(agent);

    const request = new Request('http://localhost/.well-known/agent.json', {
      method: 'GET',
    });

    const response = await app.fetch(request);
    expect(response.status).toBe(200);

    const manifest = await response.json();
    expect(manifest.payments).toBeDefined();
    expect(Array.isArray(manifest.payments)).toBe(true);
    expect(manifest.payments.length).toBeGreaterThan(0);

    const payment = manifest.payments[0];
    expect(payment.method).toBe('x402');
    expect(payment.network).toBe('solana-devnet');
    expect(payment.payee).toBe('9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz');
  });

  it('rejects unsupported network at configuration time', async () => {
    const invalidPayments = {
      payTo: '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz',
      facilitatorUrl: 'https://facilitator.test' as const,
      network: 'solana-mainnet' as any, // Invalid - should be 'solana'
    };

    const agent = await createAgent({ name: 'test', version: '1.0.0' })
      .use(http())
      .use(payments({ config: invalidPayments }))
      .build();
    const { addEntrypoint } = await createAgentApp(agent);

    // Should throw when adding entrypoint (validation happens during paywall setup)
    expect(() => {
      addEntrypoint({
        key: 'test',
        async handler() {
          return { output: { ok: true } };
        },
      });
    }).toThrow(/Unsupported payment network: solana-mainnet/);
  });
});

