import type { EntrypointDef, AgentRuntime } from '@lucid-agents/types/core';
import type {
  PaymentsConfig,
  PaymentRequirement,
  RuntimePaymentRequirement,
  PaymentsRuntime,
  PaymentStorageConfig,
} from '@lucid-agents/types/payments';
import { createPaymentTracker, type PaymentTracker } from './payment-tracker';
import { createInMemoryPaymentStorage } from './in-memory-payment-storage';
import type { PaymentStorage } from './payment-storage';
import { encodePaymentRequiredHeader } from './utils';
import { createInMemorySIWxStorage } from './siwx-in-memory-storage';
import type { SIWxStorage } from './siwx-storage';
import type { SIWxConfig, SIWxStorageConfig } from '@lucid-agents/types/siwx';
import type { WalletsRuntime } from '@lucid-agents/types/wallets';
import {
  createIncomingPaymentAuthorizer,
  preflightIncomingPayment,
} from './incoming';
import { normalizePaymentNetwork, validatePaymentsConfig } from './validation';
import { compileX402Offers } from './x402-offers';
import {
  resolveBatchSettlementServerOptions,
  type BatchSettlementServerOptions,
  type ResolvedBatchSettlementServerOptions,
} from './batch-settlement';
import { normalizeSIWxPublicOrigin } from './siwx-origin';
import {
  projectX402Payment,
  x402OpenApiComponents,
  type X402ReconciliationOptions,
} from './x402-reconciliation';

/**
 * Checks if an entrypoint has an explicit price set.
 * Also validates the price format and warns about common mistakes.
 */
export function entrypointHasExplicitPrice(entrypoint: EntrypointDef): boolean {
  const { price } = entrypoint;

  if (!price) {
    return false;
  }

  if (typeof price === 'string') {
    return price.trim().length > 0;
  }

  if (typeof price === 'object') {
    if ('amount' in price) {
      const priceObj = price as Record<string, unknown>;
      console.warn(
        `[lucid-agents/payments] Invalid price format for entrypoint "${entrypoint.key}": ` +
          `{ amount: ${priceObj.amount} } is not valid. ` +
          `Use string format: price: "${priceObj.amount}" or object format: { invoke: "${priceObj.amount}" }`
      );
      return false;
    }

    const hasInvoke = price.invoke;
    const hasStream = price.stream;
    const invokeDefined =
      typeof hasInvoke === 'string'
        ? hasInvoke.trim().length > 0
        : hasInvoke !== undefined;
    const streamDefined =
      typeof hasStream === 'string'
        ? hasStream.trim().length > 0
        : hasStream !== undefined;
    return invokeDefined || streamDefined;
  }

  if (typeof price === 'number') {
    console.warn(
      `[lucid-agents/payments] Invalid price format for entrypoint "${entrypoint.key}": ` +
        `Price must be a string, not a number. Use: price: "${price}"`
    );
  }

  return false;
}

/**
 * Resolves active payments configuration for an entrypoint.
 * Activates payments if the entrypoint has an explicit price and payments config is available.
 */
export function resolveActivePayments(
  entrypoint: EntrypointDef,
  paymentsOption: PaymentsConfig | false | undefined,
  resolvedPayments: PaymentsConfig | undefined,
  currentActivePayments: PaymentsConfig | undefined
): PaymentsConfig | undefined {
  // If payments are explicitly disabled, return undefined
  if (paymentsOption === false) {
    return undefined;
  }

  // If payments are already active, keep them active
  if (currentActivePayments) {
    return currentActivePayments;
  }

  // If no resolved payments config, don't activate
  if (!resolvedPayments) {
    return undefined;
  }

  const hasX402Offers =
    compileX402Offers(entrypoint, resolvedPayments, 'invoke') !== undefined ||
    (entrypoint.stream !== undefined &&
      compileX402Offers(entrypoint, resolvedPayments, 'stream') !== undefined);
  if (!hasX402Offers && !entrypoint.siwx?.authOnly) {
    return undefined;
  }

  // Activate payments for this entrypoint
  return { ...resolvedPayments };
}

/**
 * Evaluates payment requirement for an entrypoint and returns HTTP response if needed.
 */
export function evaluatePaymentRequirement(
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream' | 'task',
  activePayments: PaymentsConfig | undefined
): RuntimePaymentRequirement {
  const requirement = resolvePaymentRequirement(
    entrypoint,
    kind,
    activePayments
  );
  if (requirement.required) {
    const requiredRequirement = requirement as Extract<
      PaymentRequirement,
      { required: true }
    >;
    const enriched: RuntimePaymentRequirement = {
      ...requiredRequirement,
      response: paymentRequiredResponse(requiredRequirement),
    };
    return enriched;
  }
  return requirement as RuntimePaymentRequirement;
}

export const resolvePaymentRequirement = (
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream' | 'task',
  payments?: PaymentsConfig
): PaymentRequirement => {
  if (!payments) {
    return { required: false };
  }

  if (entrypoint.paymentProtocol === 'mpp') {
    return { required: false };
  }

  const compiled = compileX402Offers(entrypoint, payments, kind);
  const primary = compiled?.offers[0];
  if (!compiled || !primary) {
    return { required: false };
  }

  return {
    required: true,
    payTo: typeof primary.payTo === 'string' ? primary.payTo : undefined,
    price:
      typeof primary.price === 'object'
        ? primary.price.amount
        : String(primary.price),
    network: primary.network,
    facilitatorUrl: primary.facilitatorUrl,
    ...(compiled.source === 'legacy'
      ? {}
      : { offers: compiled.offers.map(offer => offer.publicOffer) }),
  };
};

export const paymentRequiredResponse = (
  requirement: Extract<PaymentRequirement, { required: true }>
) => {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
  });
  headers.set(
    'PAYMENT-REQUIRED',
    encodePaymentRequiredHeader({
      price: requirement.price,
      network: requirement.network,
      payTo: requirement.payTo,
      facilitatorUrl: requirement.facilitatorUrl,
    })
  );
  return new Response(
    JSON.stringify({
      x402Version: 2,
      error: {
        code: 'payment_required',
        price: requirement.price,
        network: requirement.network,
        ...(requirement.payTo ? { payTo: requirement.payTo } : {}),
      },
    }),
    {
      status: 402,
      headers,
    }
  );
};

/**
 * Creates payment storage based on configuration.
 * Defaults to portable in-memory storage if no storage config is provided.
 * @param storageConfig - Storage configuration
 * @param agentId - Optional agent ID for multi-agent platforms (only used for Postgres)
 */
function createStorageFromConfig(
  storageConfig?: PaymentStorageConfig,
  _agentId?: string
): PaymentStorage {
  if (!storageConfig || storageConfig.type === 'in-memory') {
    return createInMemoryPaymentStorage();
  }
  throw new Error(
    `Payment storage "${storageConfig.type}" requires an explicit storageFactory ` +
      `from @lucid-agents/payments/storage/${storageConfig.type}`
  );
}

/**
 * Creates SIWX storage based on configuration.
 * Defaults to in-memory if no storage config is provided.
 */
function createSIWxStorageFromConfig(
  storageConfig?: SIWxStorageConfig
): SIWxStorage {
  if (!storageConfig || storageConfig.type === 'in-memory') {
    return createInMemorySIWxStorage();
  }
  throw new Error(
    `SIWX storage "${storageConfig.type}" requires an explicit siwxStorageFactory ` +
      `from @lucid-agents/payments/storage/${storageConfig.type}`
  );
}

export type PaymentStorageFactory = (
  storageConfig?: PaymentStorageConfig,
  agentId?: string
) => PaymentStorage;

export type SIWxStorageFactory = (
  storageConfig?: SIWxStorageConfig
) => SIWxStorage;

export function createPaymentsRuntime(
  paymentsOption: PaymentsConfig | false | undefined,
  agentId?: string,
  customStorageFactory?: (
    storageConfig?: PaymentStorageConfig,
    agentId?: string
  ) => PaymentStorage,
  customSIWxStorageFactory?: SIWxStorageFactory,
  batchSettlementOptions?: BatchSettlementServerOptions,
  reconciliationOptions?: X402ReconciliationOptions
): PaymentsRuntime | undefined {
  const normalizedSIWx =
    paymentsOption && paymentsOption.siwx?.enabled
      ? {
          ...paymentsOption.siwx,
          origin: normalizeSIWxPublicOrigin(paymentsOption.siwx.origin),
        }
      : paymentsOption
        ? paymentsOption.siwx
        : undefined;
  const config: PaymentsConfig | undefined =
    paymentsOption === false || !paymentsOption
      ? undefined
      : {
          ...paymentsOption,
          network:
            typeof paymentsOption.network === 'string'
              ? normalizePaymentNetwork(paymentsOption.network)
              : paymentsOption.network,
          ...(normalizedSIWx ? { siwx: normalizedSIWx } : {}),
        };

  if (!config) {
    return undefined;
  }

  let isActive = false;

  // Create storage and payment tracker
  let paymentTracker: PaymentTracker | undefined;

  const policyGroups = config.policyGroups;

  try {
    const storage = customStorageFactory
      ? customStorageFactory(config.storage, agentId)
      : createStorageFromConfig(config.storage, agentId);
    paymentTracker = createPaymentTracker(storage);
  } catch (error) {
    throw new Error(
      `Failed to initialize payment storage: ${(error as Error).message}`
    );
  }

  // Create SIWX storage if enabled
  let siwxStorage: SIWxStorage | undefined;
  const siwxConfig = config.siwx;

  if (siwxConfig?.enabled) {
    try {
      siwxStorage = customSIWxStorageFactory
        ? customSIWxStorageFactory(siwxConfig.storage)
        : createSIWxStorageFromConfig(siwxConfig.storage);
    } catch (error) {
      throw new Error(
        `Failed to initialize SIWX storage: ${(error as Error).message}`
      );
    }
  }

  let batchSettlement: ResolvedBatchSettlementServerOptions | undefined;
  const incomingOptions: {
    paymentTracker?: PaymentTracker;
    siwxStorage?: SIWxStorage;
    siwxConfig?: SIWxConfig;
    batchSettlement?: ResolvedBatchSettlementServerOptions;
    reconciliation?: X402ReconciliationOptions;
  } = {
    paymentTracker,
    siwxStorage,
    siwxConfig,
    reconciliation: reconciliationOptions,
  };
  const authorizeIncoming = createIncomingPaymentAuthorizer(
    config,
    incomingOptions
  );
  let closePromise: Promise<void> | undefined;

  return {
    get config() {
      return config;
    },
    get isActive() {
      return isActive;
    },
    get paymentTracker() {
      return paymentTracker;
    },
    get policyGroups() {
      return policyGroups;
    },
    get siwxStorage() {
      return siwxStorage;
    },
    get siwxConfig() {
      return siwxConfig;
    },
    requirements(
      entrypoint: EntrypointDef,
      kind: 'invoke' | 'stream' | 'task'
    ) {
      return evaluatePaymentRequirement(
        entrypoint,
        kind,
        isActive ? config : undefined
      );
    },
    activate(entrypoint: EntrypointDef) {
      if (!config) return;

      const invokeOffers = compileX402Offers(entrypoint, config, 'invoke');
      const streamOffers = entrypoint.stream
        ? compileX402Offers(entrypoint, config, 'stream')
        : undefined;
      const offers = invokeOffers?.offers ?? streamOffers?.offers;
      if (offers || entrypoint.siwx?.authOnly) {
        for (const offer of offers ?? []) {
          validatePaymentsConfig(config, offer.network, entrypoint.key);
        }
        if (
          offers?.some(offer => offer.scheme === 'batch-settlement') &&
          !batchSettlement
        ) {
          batchSettlement = resolveBatchSettlementServerOptions(
            batchSettlementOptions
          );
          incomingOptions.batchSettlement = batchSettlement;
        }
        isActive = true;
      }
    },
    resolvePrice(entrypoint: EntrypointDef, which: 'invoke' | 'stream') {
      if (entrypoint.paymentProtocol === 'mpp') return null;
      const primary = compileX402Offers(entrypoint, config, which)?.offers[0];
      if (!primary) return null;
      return typeof primary.price === 'object'
        ? primary.price.amount
        : String(primary.price);
    },
    projectPayment(entrypoint, kind) {
      return projectX402Payment(
        entrypoint,
        kind,
        config,
        reconciliationOptions
      );
    },
    openApiComponents: x402OpenApiComponents,
    authorize(request, entrypoint, kind, verifiedPayment) {
      return authorizeIncoming(request, entrypoint, kind, verifiedPayment);
    },
    preflightIncoming(request, payment) {
      return preflightIncomingPayment(config, paymentTracker, request, payment);
    },
    authorizeSIWx(request, entrypoint, kind) {
      return authorizeIncoming.authorizeSIWx(request, entrypoint, kind);
    },
    async close() {
      closePromise ??= (async () => {
        await Promise.all([
          paymentTracker?.close(),
          Promise.resolve(siwxStorage?.close?.()),
          Promise.resolve(batchSettlement?.storage.close()),
        ]);
      })();
      await closePromise;
    },
    async getFetchWithPayment(
      runtime: AgentRuntime<{
        wallets?: WalletsRuntime;
        payments?: PaymentsRuntime;
      }>,
      network?: string
    ): Promise<
      | ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)
      | null
    > {
      const { createRuntimePaymentContext } = await import('./runtime');
      const paymentContext = await createRuntimePaymentContext({
        runtime,
        network,
      });
      return paymentContext.fetchWithPayment as
        | ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)
        | null;
    },
  };
}
