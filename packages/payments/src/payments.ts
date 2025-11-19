import type { Network } from 'x402/types';
import type { EntrypointDef, AgentCore } from '@lucid-agents/types/core';
import type { EntrypointPrice } from '@lucid-agents/types/payments';
import type {
  PaymentsConfig,
  PaymentRequirement,
  RuntimePaymentRequirement,
} from '@lucid-agents/types/payments';
import type { AgentKitConfig } from '@lucid-agents/types/core';
import { resolvePrice } from './pricing';

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

export function createPaymentsRuntime(
  paymentsOption: PaymentsConfig | false | undefined,
  agentConfig: AgentKitConfig
): import('@lucid-agents/types/payments').PaymentsRuntime | undefined {
  const config: PaymentsConfig | undefined =
    paymentsOption === false
      ? undefined
      : (paymentsOption ?? agentConfig.payments);

  if (!config) {
    return undefined;
  }

  let isActive = false;

  return {
    get config() {
      return config;
    },
    get isActive() {
      return isActive;
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
  };
}
