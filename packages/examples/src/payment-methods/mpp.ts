import { a2a } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { custom, evm, lightning, mpp, stripe, tempo } from '@lucid-agents/mpp';
import type { TaskStore } from '@lucid-agents/types/a2a';
import type {
  EvmServerConfig,
  LightningServerConfig,
  MppConfig,
  MppCredentialVerifier,
  StripeServerConfig,
  TempoServerConfig,
  TempoSessionServerConfig,
} from '@lucid-agents/types/mpp';
import { z } from 'zod';

export type MppChargeMethodsExampleOptions = {
  tempo: TempoServerConfig;
  stripe: StripeServerConfig;
  evm: EvmServerConfig;
  custom: {
    name: string;
    config: Record<string, unknown>;
  };
  lightning: LightningServerConfig;
  /**
   * Shared application trust boundary for custom and Lightning descriptors.
   * It must validate and settle the complete signed provider claim.
   */
  verifyCustomCredential: MppCredentialVerifier;
  secretKey: string;
  challengeStore?: MppConfig['challengeStore'];
  /**
   * Paid tasks require an application-owned durable store. Without one, invoke
   * and SSE still work, while paid task admission fails closed by design.
   */
  taskStore?: TaskStore;
};

export type TempoSessionExampleOptions = {
  session: TempoSessionServerConfig;
  secretKey: string;
  challengeStore?: MppConfig['challengeStore'];
};

/**
 * Build one merchant exposing every released MPP charge path.
 *
 * Tempo, Stripe, and EVM use native mppx verification. The named custom method
 * and Lightning descriptor use the injected application verifier. Every route
 * supports invoke and SSE, plus task admission when `taskStore` is durable.
 * `charge-any` also demonstrates client-driven `Accept-Payment` negotiation.
 */
export async function createMppChargeMethodsExample(
  options: MppChargeMethodsExampleOptions
) {
  const customMethod = custom.server(
    options.custom.name,
    options.custom.config
  );
  const methods = [
    tempo.server(options.tempo),
    stripe.server(options.stripe),
    evm.server(options.evm),
    customMethod,
    lightning.server(options.lightning),
  ];
  const agent = await createAgent({
    name: 'mpp-charge-methods',
    version: '1.0.0',
    description:
      'Canonical Tempo, Stripe, EVM, custom, and Lightning MPP charge example',
  })
    .use(http())
    .use(a2a(options.taskStore ? { tasks: { store: options.taskStore } } : {}))
    .use(
      mpp({
        allowInsecureHttpForDevelopment: true,
        config: {
          methods,
          currency: 'usd',
          defaultIntent: 'charge',
          secretKey: options.secretKey,
          verifyCredential: options.verifyCustomCredential,
          ...(options.challengeStore
            ? { challengeStore: options.challengeStore }
            : {}),
        },
      })
    )
    .build();
  const { app, addEntrypoint } = await createAgentApp(agent);

  const chargeMethods = [
    { key: 'tempo-charge', method: 'tempo' },
    { key: 'stripe-charge', method: 'stripe' },
    { key: 'evm-charge', method: 'evm' },
    { key: 'custom-charge', method: options.custom.name },
    { key: 'lightning-custom-charge', method: 'lightning' },
  ] as const;

  for (const { key, method } of chargeMethods) {
    addEntrypoint({
      key,
      description: `${method} charge over invoke, SSE, or task admission`,
      price: { invoke: '0.01', stream: '0.01' },
      paymentProtocol: 'mpp',
      metadata: {
        mpp: {
          intent: 'charge',
          methods: [method],
          description: `${method} one-shot charge`,
        },
      },
      input: z.object({ prompt: z.string() }),
      output: z.object({ result: z.string() }),
      handler: async ({ input }) => ({
        output: { result: `${method}: ${input.prompt}` },
      }),
      stream: async ({ input }, emit) => {
        await emit({ kind: 'text', text: `${method}: ${input.prompt}` });
        return {
          status: 'succeeded',
          output: { result: `${method}: ${input.prompt}` },
        };
      },
    });
  }

  addEntrypoint({
    key: 'charge-any',
    description:
      'Multi-method charge selected by the client with Accept-Payment',
    price: { invoke: '0.01', stream: '0.01' },
    paymentProtocol: 'mpp',
    metadata: {
      mpp: {
        intent: 'charge',
        methods: methods.map(method => method.name),
        description: 'Choose an available MPP charge method',
      },
    },
    input: z.object({ prompt: z.string() }),
    output: z.object({ result: z.string() }),
    handler: async ({ input }) => ({
      output: { result: input.prompt },
    }),
    stream: async ({ input }, emit) => {
      await emit({ kind: 'text', text: input.prompt });
      return {
        status: 'succeeded',
        output: { result: input.prompt },
      };
    },
  });

  return {
    agent,
    app,
    close: () => agent.close(),
  };
}

/**
 * Build the separate Tempo TIP-1034 session example.
 *
 * Session invokes deduct one configured unit. SSE charges delivered units and
 * emits payment receipt/voucher control events. Production callers must inject
 * a durable SQLite or Postgres session store in `session`.
 */
export async function createTempoSessionExample(
  options: TempoSessionExampleOptions
) {
  const agent = await createAgent({
    name: 'tempo-session-method',
    version: '1.0.0',
    description: 'Canonical durable Tempo TIP-1034 session example',
  })
    .use(http())
    .use(
      mpp({
        allowInsecureHttpForDevelopment: true,
        config: {
          methods: [tempo.session(options.session)],
          currency: options.session.currency,
          defaultIntent: 'session',
          secretKey: options.secretKey,
          ...(options.challengeStore
            ? { challengeStore: options.challengeStore }
            : {}),
        },
      })
    )
    .build();
  const { app, addEntrypoint } = await createAgentApp(agent);

  addEntrypoint({
    key: 'tempo-session-report',
    description:
      'Tempo session invoke charges one unit; SSE meters delivered chunks',
    price: {
      invoke: options.session.amount,
      stream: options.session.amount,
    },
    paymentProtocol: 'mpp',
    metadata: {
      mpp: {
        intent: 'session',
        methods: ['tempo'],
        description: 'Metered Tempo TIP-1034 session',
      },
    },
    input: z.object({ prompt: z.string() }),
    output: z.object({
      result: z.string(),
      units: z.number().int().nonnegative(),
    }),
    handler: async ({ input }) => ({
      output: { result: input.prompt, units: 1 },
    }),
    stream: async ({ input }, emit) => {
      const words = input.prompt.split(/\s+/u).filter(Boolean);
      for (const word of words) {
        await emit({ kind: 'text', text: word });
      }
      return {
        status: 'succeeded',
        output: { result: input.prompt, units: words.length },
      };
    },
  });

  return {
    agent,
    app,
    close: () => agent.close(),
  };
}
