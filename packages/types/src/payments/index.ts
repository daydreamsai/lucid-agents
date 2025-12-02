import type { Network, Resource } from 'x402/types';

/**
 * Solana address type (base58 encoded).
 */
export type SolanaAddress = string;

/**
 * Spending limit configuration for a specific scope.
 */
export type SpendingLimit = {
  /** Maximum payment amount per individual request in USD (stateless) */
  maxPaymentUsd?: number;
  /** Maximum total spending amount in USD (stateful, tracks across requests) */
  maxTotalUsd?: number;
  /** Time window in milliseconds for total spending limit (optional - if not provided, lifetime limit) */
  windowMs?: number;
};

/**
 * Spending limits configuration at different scopes.
 */
export type SpendingLimitsConfig = {
  /** Global spending limits applied to all payments */
  global?: SpendingLimit;
  /** Per-target limits keyed by agent URL or domain */
  perTarget?: Record<string, SpendingLimit>;
  /** Per-endpoint limits keyed by full endpoint URL */
  perEndpoint?: Record<string, SpendingLimit>;
};

/**
 * Rate limiting configuration for a policy group.
 */
export type RateLimitConfig = {
  /** Maximum number of payments allowed within the time window */
  maxPayments: number;
  /** Time window in milliseconds */
  windowMs: number;
};

/**
 * Payment policy group configuration.
 * Policy groups are evaluated in order - all groups must pass (first violation blocks the payment).
 */
export type PaymentPolicyGroup = {
  /** Policy group identifier (e.g., "Daily Spending Limit", "API Usage Policy") */
  name: string;
  /** Spending limits at global, per-target, or per-endpoint scope */
  spendingLimits?: SpendingLimitsConfig;
  /** Whitelist of allowed recipient addresses or domains */
  allowedRecipients?: string[];
  /** Blacklist of blocked recipient addresses or domains (takes precedence over whitelist) */
  blockedRecipients?: string[];
  /** Rate limiting configuration (scoped per policy group) */
  rateLimits?: RateLimitConfig;
};

/**
 * Payment configuration for x402 protocol.
 * Supports both EVM (0x...) and Solana (base58) addresses.
 */
export type PaymentsConfig = {
  payTo: `0x${string}` | SolanaAddress;
  facilitatorUrl: Resource;
  network: Network;
  /** Optional policy groups for payment controls and limits */
  policyGroups?: PaymentPolicyGroup[];
};

/**
 * Price for an entrypoint - either a flat string or separate invoke/stream prices.
 */
export type EntrypointPrice = string | { invoke?: string; stream?: string };

/**
 * Payment requirement for an entrypoint.
 */
export type PaymentRequirement =
  | { required: false }
  | {
      required: true;
      payTo: string;
      price: string;
      network: Network;
      facilitatorUrl?: string;
    };

/**
 * HTTP-specific payment requirement that includes the Response object.
 */
export type RuntimePaymentRequirement =
  | { required: false }
  | (Extract<PaymentRequirement, { required: true }> & {
      response: Response;
    });

/**
 * Payments runtime type.
 * Returned by AgentRuntime.payments when payments are configured.
 */
export type PaymentsRuntime = {
  readonly config: PaymentsConfig;
  readonly isActive: boolean;
  requirements: (
    entrypoint: import('../core').EntrypointDef,
    kind: 'invoke' | 'stream'
  ) => RuntimePaymentRequirement;
  activate: (entrypoint: import('../core').EntrypointDef) => void;
  /** Optional spending tracker for total spending limits (only present if policy groups have total spending limits) */
  readonly spendingTracker?: unknown; // SpendingTracker instance (type exported from payments package)
  /** Optional rate limiter for rate limiting (only present if policy groups have rate limits) */
  readonly rateLimiter?: unknown; // RateLimiter instance (type exported from payments package)
  /** Policy groups configured for this runtime */
  readonly policyGroups?: PaymentPolicyGroup[];
};
