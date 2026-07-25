import { a2a } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import {
  type BatchSettlementServerOptions,
  payments,
  type PaymentStorageFactory,
  type SIWxStorageFactory,
  type X402ReconciliationOptions,
} from '@lucid-agents/payments';
import type { TaskStore } from '@lucid-agents/types/a2a';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { z } from 'zod';

type EvmNetwork = `eip155:${string}`;
type SolanaNetwork = `solana:${string}`;
type OfferReceiptIssuer = NonNullable<
  X402ReconciliationOptions['offerReceipt']
>['issuer'];

export type X402PaymentMethodsExampleOptions = {
  evm: {
    network: EvmNetwork;
    payTo: `0x${string}`;
    asset: `0x${string}`;
    exactFacilitatorUrl: string;
    uptoFacilitatorUrl: string;
    batchFacilitatorUrl: string;
  };
  solana: {
    network: SolanaNetwork;
    payTo: string;
    asset: string;
    facilitatorUrl: string;
  };
  /** Public HTTPS origin that wallets sign for SIWX. */
  siwxOrigin: string;
  /** Durable payment history and reservation configuration for production. */
  paymentStorage?: PaymentsConfig['storage'];
  paymentStorageFactory?: PaymentStorageFactory;
  /** Durable SIWX nonce and entitlement configuration for production. */
  siwxStorage?: NonNullable<PaymentsConfig['siwx']>['storage'];
  siwxStorageFactory?: SIWxStorageFactory;
  /**
   * Paid tasks require an application-owned durable store. Without one, invoke
   * and SSE still work, while paid task admission fails closed by design.
   */
  taskStore?: TaskStore;
  /**
   * Use `{ mode: "development" }` only for local demos. Production should
   * inject a durable SQLite or Postgres channel store.
   */
  batchSettlement: BatchSettlementServerOptions;
  /**
   * Optional signing capability for official x402 offer/receipt extensions.
   * Private key material stays outside the payments configuration.
   */
  offerReceiptIssuer?: OfferReceiptIssuer;
};

export type X402StripeDestinationExampleOptions = {
  secretKey: string;
  facilitatorUrl: string;
  /** Stripe crypto destination mode currently supports Base mainnet only. */
  network: 'eip155:8453';
  /** Override only for a local Stripe-compatible test server. */
  apiBaseUrl?: string;
};

function reconciliation(
  issuer: OfferReceiptIssuer | undefined
): X402ReconciliationOptions {
  return {
    paymentIdentifier: { required: true },
    bazaar: { enabled: true },
    ...(issuer
      ? {
          offerReceipt: {
            issuer,
            includeTxHash: false,
            offerValiditySeconds: 300,
          },
        }
      : {}),
  };
}

/**
 * Build one x402 merchant that demonstrates every released seller scheme.
 *
 * The returned Hono app is safe to embed in tests or a larger service. Exact
 * and batch-settlement support invoke and SSE. They also support paid task
 * admission when `taskStore` is durable; upto is deliberately invoke-only.
 * SIWX demonstrates both auth-only access and paid entitlement reuse.
 */
export async function createX402PaymentMethodsExample(
  options: X402PaymentMethodsExampleOptions
) {
  const agent = await createAgent({
    name: 'x402-payment-methods',
    version: '1.0.0',
    description:
      'Canonical exact, upto, batch-settlement, SIWX, and reconciliation example',
  })
    .use(http())
    .use(a2a(options.taskStore ? { tasks: { store: options.taskStore } } : {}))
    .use(
      payments({
        agentId: 'x402-payment-methods',
        config: {
          payTo: options.evm.payTo,
          network: options.evm.network,
          facilitatorUrl: options.evm.exactFacilitatorUrl,
          ...(options.paymentStorage
            ? { storage: options.paymentStorage }
            : {}),
          siwx: {
            enabled: true,
            origin: options.siwxOrigin,
            storage: options.siwxStorage ?? { type: 'in-memory' },
          },
        },
        ...(options.paymentStorageFactory
          ? { storageFactory: options.paymentStorageFactory }
          : {}),
        ...(options.siwxStorageFactory
          ? { siwxStorageFactory: options.siwxStorageFactory }
          : {}),
        batchSettlement: options.batchSettlement,
        reconciliation: reconciliation(options.offerReceiptIssuer),
      })
    )
    .build();

  const { app, addEntrypoint } = await createAgentApp(agent);
  const exactOffers = [
    {
      scheme: 'exact' as const,
      network: options.evm.network,
      payTo: options.evm.payTo,
      facilitatorUrl: options.evm.exactFacilitatorUrl,
      price: { amount: '1000', asset: options.evm.asset },
    },
    {
      scheme: 'exact' as const,
      network: options.solana.network,
      payTo: options.solana.payTo,
      facilitatorUrl: options.solana.facilitatorUrl,
      price: { amount: '1000', asset: options.solana.asset },
    },
  ];

  addEntrypoint({
    key: 'exact-report',
    description:
      'Fixed-price report with EVM and Solana offers for invoke, stream, or task admission',
    paymentProtocol: 'x402',
    x402: { offers: exactOffers },
    input: z.object({ prompt: z.string() }),
    output: z.object({ report: z.string() }),
    handler: async ({ input }) => ({
      output: { report: `Report: ${input.prompt}` },
    }),
    stream: async ({ input }, emit) => {
      await emit({ kind: 'text', text: `Report: ${input.prompt}` });
      return {
        status: 'succeeded',
        output: { report: `Report: ${input.prompt}` },
      };
    },
  });

  addEntrypoint({
    key: 'metered-report',
    description:
      'Usage-metered EVM invoke that settles the actual units consumed',
    paymentProtocol: 'x402',
    x402: {
      offers: [
        {
          scheme: 'upto',
          network: options.evm.network,
          payTo: options.evm.payTo,
          facilitatorUrl: options.evm.uptoFacilitatorUrl,
          maximum: { amount: '10000', asset: options.evm.asset },
        },
      ],
    },
    input: z.object({ units: z.number().int().min(0).max(10) }),
    output: z.object({ units: z.number().int(), result: z.string() }),
    handler: async ({ input }) => ({
      output: {
        units: input.units,
        result: `Processed ${input.units} units`,
      },
      payment: {
        actualAmount: String(input.units * 1_000),
        asset: options.evm.asset,
      },
    }),
  });

  addEntrypoint({
    key: 'batch-report',
    description:
      'Channel-backed EVM report for repeated invoke, stream, or task payments',
    paymentProtocol: 'x402',
    x402: {
      offers: [
        {
          scheme: 'batch-settlement',
          network: options.evm.network,
          payTo: options.evm.payTo,
          facilitatorUrl: options.evm.batchFacilitatorUrl,
          maximum: { amount: '1000', asset: options.evm.asset },
        },
      ],
    },
    input: z.object({ prompt: z.string() }),
    output: z.object({ report: z.string() }),
    handler: async ({ input }) => ({
      output: { report: `Batch report: ${input.prompt}` },
    }),
    stream: async ({ input }, emit) => {
      await emit({ kind: 'text', text: `Batch report: ${input.prompt}` });
      return {
        status: 'succeeded',
        output: { report: `Batch report: ${input.prompt}` },
      };
    },
  });

  addEntrypoint({
    key: 'member-profile',
    description: 'SIWX-authenticated profile with no payment required',
    siwx: {
      authOnly: true,
      statement: 'Sign in to the payment methods example',
    },
    input: z.object({}),
    output: z.object({ address: z.string().optional() }),
    handler: async ({ auth }) => ({
      output: { address: auth?.address },
    }),
  });

  addEntrypoint({
    key: 'member-report',
    description:
      'Exact-paid report whose verified wallet can reuse a SIWX entitlement',
    paymentProtocol: 'x402',
    x402: { offers: [exactOffers[0]] },
    siwx: { enabled: true },
    input: z.object({ prompt: z.string() }),
    output: z.object({
      report: z.string(),
      address: z.string().optional(),
    }),
    handler: async ({ input, auth }) => ({
      output: {
        report: `Member report: ${input.prompt}`,
        address: auth?.address,
      },
    }),
  });

  return {
    agent,
    app,
    close: () => agent.close(),
  };
}

/**
 * Build an x402 merchant whose Base deposit address is created by Stripe for
 * each challenge. The secret remains server-side and the Agent Card advertises
 * dynamic payee resolution instead of exposing a fabricated static address.
 */
export async function createX402StripeDestinationExample(
  options: X402StripeDestinationExampleOptions
) {
  const agent = await createAgent({
    name: 'x402-stripe-destination',
    version: '1.0.0',
    description: 'x402 exact payments with Stripe crypto destination mode',
  })
    .use(http())
    .use(
      payments({
        config: {
          stripe: {
            secretKey: options.secretKey,
            ...(options.apiBaseUrl ? { apiBaseUrl: options.apiBaseUrl } : {}),
          },
          facilitatorUrl: options.facilitatorUrl,
          network: options.network,
        },
      })
    )
    .build();
  const { app, addEntrypoint } = await createAgentApp(agent);

  addEntrypoint({
    key: 'stripe-destination-report',
    description:
      'Fixed-price x402 report with a per-challenge Stripe deposit address',
    price: '0.01',
    paymentProtocol: 'x402',
    input: z.object({ prompt: z.string() }),
    output: z.object({ report: z.string() }),
    handler: async ({ input }) => ({
      output: { report: `Stripe destination report: ${input.prompt}` },
    }),
  });

  return {
    agent,
    app,
    close: () => agent.close(),
  };
}
