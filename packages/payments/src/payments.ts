import type { x402ResourceServer } from '@x402/core/server';
import type { EntrypointDef, AgentRuntime } from '@lucid-agents/types/core';
import type {
  PaymentsConfig,
  PaymentRequirement,
  RuntimePaymentRequirement,
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
import { createResourceServerFromConfig } from './resource-server';

/**
 * Checks if an entrypoint has an explicit price set.
 */
export function entrypointHasExplicitPrice(entrypoint: EntrypointDef): boolean {
  const { price } = entrypoint;
  if (typeof price === 'string') {
    return price.trim().length > 0;
  }
  if (price && typeof price === 'object') {
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

  // Dynamic prices (functions) can't be resolved without request context.
  // Let the x402 middleware handle dynamic pricing - return required: false here.
  if (typeof price === 'function') {
    return { required: false };
  }

  return {
    required: true,
    payTo: payments.payTo,
    price: String(price),
    network,
    facilitatorUrl: payments.facilitatorUrl,
  };
};

export const paymentRequiredResponse = (
  requirement: Extract<PaymentRequirement, { required: true }>
) => {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'X-Price': requirement.price,
    'X-Network': requirement.network,
    'X-Pay-To': requirement.payTo,
  });
  if (requirement.facilitatorUrl) {
    headers.set('X-Facilitator', requirement.facilitatorUrl);
  }
  return new Response(
    JSON.stringify({
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
 */
function createStorageFromConfig(
  storageConfig?: PaymentStorageConfig
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
        storageConfig.postgres.connectionString
      );
    case 'sqlite':
    default:
      return createSQLitePaymentStorage(storageConfig.sqlite?.dbPath);
  }
}

export function createPaymentsRuntime(
  paymentsOption: PaymentsConfig | false | undefined
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
  let resourceServer: x402ResourceServer | undefined;

  const policyGroups = config.policyGroups;

  // Create resource server if facilitatorUrl is configured
  if (config.facilitatorUrl) {
    try {
      resourceServer = createResourceServerFromConfig(config);
    } catch (error) {
      console.warn(
        `[payments] Failed to create resource server: ${(error as Error).message}`
      );
    }
  }

  // Check if we need payment tracking (for outgoing or incoming limits)
  if (policyGroups && policyGroups.length > 0) {
    const needsOutgoingTracking = policyGroups.some(
      group =>
        group.outgoingLimits?.global?.maxTotalUsd !== undefined ||
        Object.values(group.outgoingLimits?.perTarget ?? {}).some(
          limit => limit.maxTotalUsd !== undefined
        ) ||
        Object.values(group.outgoingLimits?.perEndpoint ?? {}).some(
          limit => limit.maxTotalUsd !== undefined
        )
    );

    // Check if any group needs incoming payment tracking
    const needsIncomingTracking = policyGroups.some(
      group =>
        group.incomingLimits?.global?.maxTotalUsd !== undefined ||
        Object.values(group.incomingLimits?.perSender ?? {}).some(
          limit => limit.maxTotalUsd !== undefined
        ) ||
        Object.values(group.incomingLimits?.perEndpoint ?? {}).some(
          limit => limit.maxTotalUsd !== undefined
        )
    );

    // Check if any group needs rate limiting
    const needsRateLimiter = policyGroups.some(
      group => group.rateLimits !== undefined
    );

    // Create payment tracker if we need tracking for either direction
    if (needsOutgoingTracking || needsIncomingTracking) {
      try {
        const storage = createStorageFromConfig(config.storage);
        paymentTracker = createPaymentTracker(storage);
      } catch (error) {
        // Storage initialization failed - throw error (agent startup fails)
        throw new Error(
          `Failed to initialize payment storage: ${(error as Error).message}`
        );
      }
    }

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
    get resourceServer() {
      return resourceServer;
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
