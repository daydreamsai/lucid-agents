import type { Network } from '@x402/core/types';
import type {
  EntrypointDef,
  AgentCore,
  AgentRuntime,
} from '@lucid-agents/types/core';
import type { EntrypointPrice } from '@lucid-agents/types/payments';
import type {
  PaymentsConfig,
  PaymentRequirement,
  RuntimePaymentRequirement,
  PaymentPolicyGroup,
  PaymentsRuntime,
  PaymentStorageConfig,
} from '@lucid-agents/types/payments';
import { resolvePrice } from './pricing';
import { createPaymentTracker, type PaymentTracker } from './payment-tracker';
import { createRateLimiter, type RateLimiter } from './rate-limiter';
import { createSQLitePaymentStorage } from './sqlite-payment-storage';
import { createInMemoryPaymentStorage } from './in-memory-payment-storage';
import { createPostgresPaymentStorage } from './postgres-payment-storage';
import type { PaymentStorage } from './payment-storage';
import { encodePaymentRequiredHeader } from './utils';

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

  // If entrypoint has no explicit price, don't activate payments
  if (!entrypointHasExplicitPrice(entrypoint)) {
    return undefined;
  }

  // If no resolved payments config, don't activate
  if (!resolvedPayments) {
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
  kind: 'invoke' | 'stream',
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
  kind: 'invoke' | 'stream',
  payments?: PaymentsConfig
): PaymentRequirement => {
  if (!payments) {
    return { required: false };
  }

  const network = entrypoint.network ?? payments.network;
  if (!network) {
    return { required: false };
  }

  const price = resolvePrice(entrypoint, payments, kind);
  if (!price) {
    return { required: false };
  }

  return {
    required: true,
    payTo: payments.payTo,
    price,
    network,
    facilitatorUrl: payments.facilitatorUrl,
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
        payTo: requirement.payTo,
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
 * Defaults to SQLite if no storage config is provided.
 * @param storageConfig - Storage configuration
 * @param agentId - Optional agent ID for multi-agent platforms (only used for Postgres)
 */
function createStorageFromConfig(
  storageConfig?: PaymentStorageConfig,
  agentId?: string
): PaymentStorage {
  if (!storageConfig) {
    // Default: SQLite
    return createSQLitePaymentStorage();
  }

  switch (storageConfig.type) {
    case 'in-memory':
      return createInMemoryPaymentStorage();
    case 'postgres':
      if (!storageConfig.postgres?.connectionString) {
        throw new Error(
          'Postgres storage requires connectionString in postgres config'
        );
      }
      return createPostgresPaymentStorage(
        storageConfig.postgres.connectionString,
        agentId
      );
    case 'sqlite':
    default:
      return createSQLitePaymentStorage(storageConfig.sqlite?.dbPath);
  }
}

export function createPaymentsRuntime(
  paymentsOption: PaymentsConfig | false | undefined,
  agentId?: string,
  customStorageFactory?: (
    storageConfig?: PaymentStorageConfig,
    agentId?: string
  ) => PaymentStorage
): PaymentsRuntime | undefined {
  const config: PaymentsConfig | undefined =
    paymentsOption === false ? undefined : paymentsOption;

  if (!config) {
    return undefined;
  }

  let isActive = false;

  // Create storage and payment tracker
  let paymentTracker: PaymentTracker | undefined;
  let rateLimiter: RateLimiter | undefined;

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

  if (policyGroups && policyGroups.length > 0) {
    const needsRateLimiter = policyGroups.some(
      group => group.rateLimits !== undefined
    );

    if (needsRateLimiter) {
      rateLimiter = createRateLimiter();
    }
  }

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
    get rateLimiter() {
      return rateLimiter;
    },
    get policyGroups() {
      return policyGroups;
    },
    requirements(entrypoint: EntrypointDef, kind: 'invoke' | 'stream') {
      return evaluatePaymentRequirement(
        entrypoint,
        kind,
        isActive ? config : undefined
      );
    },
    activate(entrypoint: EntrypointDef) {
      if (isActive || !config) return;

      if (entrypointHasExplicitPrice(entrypoint)) {
        isActive = true;
      }
    },
    resolvePrice(entrypoint: EntrypointDef, which: 'invoke' | 'stream') {
      return resolvePrice(entrypoint, config, which);
    },
    async getFetchWithPayment(
      runtime: AgentRuntime,
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
