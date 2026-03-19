import type { EntrypointDef, AgentRuntime } from '@lucid-agents/types/core';
import type { MppRuntime } from './types';

/**
 * Options for the MPP charge middleware.
 */
export type MppChargeOptions = {
  /** Payment amount in the configured currency */
  amount: string;
  /** Human-readable description */
  description?: string;
  /** Override currency */
  currency?: string;
  /** Restrict to specific payment methods */
  methods?: string[];
};

/**
 * Options for the MPP session middleware.
 */
export type MppSessionOptions = {
  /** Per-unit cost */
  amount: string;
  /** Unit type description */
  unitType?: string;
  /** Suggested deposit for the session channel */
  suggestedDeposit?: string;
  /** Minimum required deposit */
  minDeposit?: string;
};

/**
 * Evaluate whether a request needs MPP payment.
 * Returns the 402 response if payment is required, or null if not.
 *
 * This is a framework-agnostic helper. Framework adapters (express, hono)
 * can wrap this in their middleware pattern.
 */
export function evaluateMppPayment(
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream',
  mppRuntime: MppRuntime | undefined
): Response | null {
  if (!mppRuntime?.isActive) return null;

  const requirement = mppRuntime.requirements(entrypoint, kind);
  if (!requirement.required) return null;

  return requirement.response;
}

/**
 * Validate an MPP credential from the Payment header.
 * Returns the decoded credential or null if invalid.
 *
 * NOTE: In production, credential validation should be handled by the
 * mppx server SDK. This is a lightweight check for presence.
 */
export function extractMppCredential(
  request: Request
): { challengeId: string; payload: Record<string, unknown> } | null {
  const paymentHeader = request.headers.get('Payment');
  if (!paymentHeader) return null;

  // Extract credential from Payment header: credential="base64url-encoded-json"
  const match = paymentHeader.match(/credential="([^"]+)"/);
  if (!match?.[1]) return null;

  try {
    // base64url decode
    const decoded = atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
    const credential = JSON.parse(decoded);
    return {
      challengeId: credential.challenge_id ?? credential.challengeId,
      payload: credential.payload ?? credential,
    };
  } catch {
    return null;
  }
}

/**
 * Create a Payment-Receipt header value.
 */
export function createReceiptHeader(receipt: {
  challengeId: string;
  status: 'settled' | 'pending';
  amount?: string;
  method?: string;
}): string {
  const json = JSON.stringify(receipt);
  return btoa(json);
}
