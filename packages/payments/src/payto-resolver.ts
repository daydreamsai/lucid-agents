import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { createStripePayToAddress } from './stripe-payto';

export type DynamicPayToContext = {
  paymentHeader?: string | null;
  [key: string]: unknown;
};

export type DynamicPayToResolver = (
  context: DynamicPayToContext
) => Promise<string>;

function parsePaymentHeader(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    try {
      const decoded = Buffer.from(payload, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch {
      return undefined;
    }
  }
}

function extractPayToFromPaymentHeader(
  paymentHeader: string | null | undefined
): string | undefined {
  if (!paymentHeader) return undefined;
  const parsed = parsePaymentHeader(paymentHeader) as
    | {
        payload?: {
          authorization?: { to?: unknown };
        };
      }
    | undefined;

  const to = parsed?.payload?.authorization?.to;
  return typeof to === 'string' && to.length > 0 ? to : undefined;
}

function isStripeMode(
  payments: PaymentsConfig
): payments is PaymentsConfig & { stripe: NonNullable<PaymentsConfig['stripe']> } {
  return 'stripe' in payments && typeof payments.stripe === 'object';
}

export function resolvePayTo(
  payments: PaymentsConfig
): string | DynamicPayToResolver {
  if (!isStripeMode(payments)) {
    return payments.payTo;
  }

  return async (context: DynamicPayToContext) => {
    const existingPayTo = extractPayToFromPaymentHeader(context.paymentHeader);
    if (context.paymentHeader && !existingPayTo) {
      throw new Error('Unable to extract payTo from payment header');
    }
    if (existingPayTo) {
      return existingPayTo;
    }

    try {
      return await createStripePayToAddress(payments.stripe, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Stripe payTo resolution failed: ${message}`);
    }
  };
}

