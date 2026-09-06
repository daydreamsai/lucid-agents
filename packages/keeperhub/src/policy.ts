import {
  canonicalAmount,
  canonicalChainId,
  type CanonicalTransferBody,
  type ChainInput,
  normalizeAddress,
} from './client';

/**
 * What this agent is willing to execute. Evaluated before any reservation or
 * KeeperHub call, so a denied request costs the buyer nothing and KeeperHub nothing.
 * KeeperHub's own caps (daily native value, 100 USD per stablecoin transfer) still apply underneath.
 */
export interface ExecutionPolicy {
  /** Chains this agent executes on. Required and non-empty. */
  chains: ChainInput[];
  /** Token contracts allowed, plus the literal "native" for the chain's native asset. Omit to allow any. */
  tokens?: Array<string | 'native'> | undefined;
  /** Recipient allowlist. Omit to allow any recipient. */
  recipients?: string[] | undefined;
  /** Largest single execution, in the token's human units. Omit for no local ceiling. */
  maxAmount?: string | undefined;
}

export interface NormalizedPolicy {
  chains: ReadonlySet<string>;
  tokens: ReadonlySet<string> | null;
  recipients: ReadonlySet<string> | null;
  maxAmount: string | null;
}

export type PolicyRule = 'chain' | 'token' | 'recipient' | 'max_amount';

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; rule: PolicyRule; reason: string };

export function normalizePolicy(policy: ExecutionPolicy): NormalizedPolicy {
  if (!Array.isArray(policy.chains) || policy.chains.length === 0) {
    throw new Error('keeperhub(): policy.chains must list at least one chain');
  }
  const chains = new Set(policy.chains.map(canonicalChainId));
  const tokens = policy.tokens
    ? new Set(
        policy.tokens.map(t =>
          t === 'native' ? 'native' : normalizeAddress(t)
        )
      )
    : null;
  const recipients = policy.recipients
    ? new Set(policy.recipients.map(normalizeAddress))
    : null;
  const maxAmount =
    policy.maxAmount !== undefined ? canonicalAmount(policy.maxAmount) : null;
  return { chains, tokens, recipients, maxAmount };
}

/** Compare two canonical decimal strings without floating point. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const [ai = '0', af = ''] = canonicalAmount(a).split('.');
  const [bi = '0', bf = ''] = canonicalAmount(b).split('.');
  const scale = Math.max(af.length, bf.length);
  const A = BigInt(ai + af.padEnd(scale, '0'));
  const B = BigInt(bi + bf.padEnd(scale, '0'));
  return A < B ? -1 : A > B ? 1 : 0;
}

export function evaluateTransfer(
  policy: NormalizedPolicy,
  body: CanonicalTransferBody
): PolicyDecision {
  if (!policy.chains.has(body.chainId)) {
    return {
      allowed: false,
      rule: 'chain',
      reason: `chain ${body.chainId} is not in the agent's policy (${[...policy.chains].join(', ')})`,
    };
  }
  const token = body.tokenAddress ?? 'native';
  if (policy.tokens && !policy.tokens.has(token)) {
    return {
      allowed: false,
      rule: 'token',
      reason: `token ${token} is not in the agent's policy`,
    };
  }
  if (policy.recipients && !policy.recipients.has(body.recipientAddress)) {
    return {
      allowed: false,
      rule: 'recipient',
      reason: `recipient ${body.recipientAddress} is not in the agent's allowlist`,
    };
  }
  if (
    policy.maxAmount !== null &&
    compareDecimal(body.amount, policy.maxAmount) > 0
  ) {
    return {
      allowed: false,
      rule: 'max_amount',
      reason: `amount ${body.amount} exceeds the agent's maximum of ${policy.maxAmount}`,
    };
  }
  return { allowed: true };
}

/** A serialisable summary for the agent card. Never includes secrets. */
export function describePolicy(
  policy: NormalizedPolicy
): Record<string, unknown> {
  return {
    chains: [...policy.chains],
    tokens: policy.tokens ? [...policy.tokens] : 'any',
    recipients: policy.recipients ? [...policy.recipients] : 'any',
    maxAmount: policy.maxAmount ?? 'unbounded (KeeperHub caps apply)',
  };
}
