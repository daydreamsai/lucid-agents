import type { MppConfig, MppPaymentMethod, MppPaymentIntent, EntrypointMppConfig } from './types';
import type { EntrypointDef } from '@lucid-agents/types/core';

/**
 * Challenge parameters for an MPP 402 response.
 */
export type ChallengeParams = {
  id: string;
  method: MppPaymentMethod;
  intent: MppPaymentIntent;
  amount: string;
  currency: string;
  description?: string;
  expires?: string;
  digest?: string;
};

/**
 * Generate a unique challenge ID.
 */
function generateChallengeId(): string {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Escape a string for safe embedding inside a quoted HTTP header parameter.
 * Prevents header injection via unescaped quotes or CRLF sequences.
 */
function escapeHeaderValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, '');
}

/**
 * Format a single WWW-Authenticate challenge value.
 * Per MPP spec: Payment id="...", method="...", intent="...", amount="...", ...
 */
function formatChallengeValue(params: ChallengeParams): string {
  const parts = [
    `id="${escapeHeaderValue(params.id)}"`,
    `method="${escapeHeaderValue(params.method)}"`,
    `intent="${escapeHeaderValue(params.intent)}"`,
    `amount="${escapeHeaderValue(params.amount)}"`,
    `currency="${escapeHeaderValue(params.currency)}"`,
  ];

  if (params.description) {
    parts.push(`description="${escapeHeaderValue(params.description)}"`);
  }
  if (params.expires) {
    parts.push(`expires="${escapeHeaderValue(params.expires)}"`);
  }
  if (params.digest) {
    parts.push(`digest="${escapeHeaderValue(params.digest)}"`);
  }

  return `Payment ${parts.join(', ')}`;
}

/**
 * Resolve the price for an entrypoint, checking entrypoint-level overrides first.
 */
export function resolveEntrypointPrice(
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream'
): string | null {
  const { price } = entrypoint;
  if (!price) return null;

  if (typeof price === 'string') {
    return price.trim().length > 0 ? price : null;
  }

  if (typeof price === 'object') {
    const value = kind === 'stream' ? price.stream : price.invoke;
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

/**
 * Resolve MPP-specific config from entrypoint metadata.
 */
export function resolveEntrypointMppConfig(
  entrypoint: EntrypointDef
): EntrypointMppConfig | undefined {
  return entrypoint.metadata?.mpp as EntrypointMppConfig | undefined;
}

/**
 * Build a 402 Payment Required response with MPP WWW-Authenticate headers.
 *
 * Supports multiple payment methods - each gets its own WWW-Authenticate header.
 */
export function buildChallengeResponse(options: {
  amount: string;
  currency: string;
  intent: MppPaymentIntent;
  methods: MppPaymentMethod[];
  description?: string;
  expirySeconds?: number;
}): Response {
  const { amount, currency, intent, methods, description, expirySeconds = 300 } = options;

  const expires = new Date(Date.now() + expirySeconds * 1000).toISOString();
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
  });

  // Each payment method gets its own WWW-Authenticate header value
  const challenges: ChallengeParams[] = methods.map(method => ({
    id: generateChallengeId(),
    method,
    intent,
    amount,
    currency,
    description,
    expires,
  }));

  // Multiple WWW-Authenticate headers per MPP spec
  const authenticateValues = challenges.map(formatChallengeValue);
  for (const value of authenticateValues) {
    headers.append('WWW-Authenticate', value);
  }

  const body = {
    type: 'https://paymentauth.org/problems/payment-required',
    title: 'Payment Required',
    status: 402,
    detail: description ?? 'This resource requires payment.',
    challenges: challenges.map(c => ({
      id: c.id,
      method: c.method,
      intent: c.intent,
      amount: c.amount,
      currency: c.currency,
      expires: c.expires,
    })),
  };

  return new Response(JSON.stringify(body), {
    status: 402,
    headers,
  });
}
