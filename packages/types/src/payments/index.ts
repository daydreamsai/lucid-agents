import type { Network, Resource } from 'x402/types';
import type { AgentRuntime, EntrypointDef } from '../core';

/**
 * Solana address type (base58 encoded).
 */
export type SolanaAddress = string;

/**
 * Outgoing payment limit configuration for a specific scope.
 */
export type OutgoingLimit = {
  /** Maximum payment amount per individual request in USD (stateless) */
  maxPaymentUsd?: number;
  /** Maximum total outgoing amount in USD (stateful, tracks across requests) */
  maxTotalUsd?: number;
  /** Time window in milliseconds for total outgoing limit (optional - if not provided, lifetime limit) */
  windowMs?: number;
};

/**
 * Incoming payment limit configuration for a specific scope.
 */
export type IncomingLimit = {
  /** Maximum payment amount per individual request in USD (stateless) */
  maxPaymentUsd?: number;
  /** Maximum total incoming amount in USD (stateful, tracks across requests) */
  maxTotalUsd?: number;
  /** Time window in milliseconds for total incoming limit (optional - if not provided, lifetime limit) */
  windowMs?: number;
};

/**
 * Outgoing limits configuration at different scopes.
 */
export type OutgoingLimitsConfig = {
  /** Global outgoing limits applied to all payments */
  global?: OutgoingLimit;
  /** Per-target limits keyed by agent URL or domain */
  perTarget?: Record<string, OutgoingLimit>;
  /** Per-endpoint limits keyed by full endpoint URL */
  perEndpoint?: Record<string, OutgoingLimit>;
};

/**
 * Incoming limits configuration at different scopes.
 */
export type IncomingLimitsConfig = {
  /** Global incoming limits applied to all payments */
  global?: IncomingLimit;
  /** Per-sender limits keyed by sender address or domain */
  perSender?: Record<string, IncomingLimit>;
  /** Per-endpoint limits keyed by full endpoint URL */
  perEndpoint?: Record<string, IncomingLimit>;
};

/**
 * Payment direction: outgoing (agent pays) or incoming (agent receives).
 */
export type PaymentDirection = 'outgoing' | 'incoming';

/**
 * Payment record stored in the database.
 */
export type PaymentRecord = {
  id?: number;
  groupName: string;
  scope: string;
  direction: PaymentDirection;
  amount: bigint;
  timestamp: number;
};

/**
 * Payment tracker interface for reading payment data.
 */
export interface PaymentTracker {
  getAllData(): Promise<PaymentRecord[]>;
}

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
  /** Outgoing payment limits at global, per-target, or per-endpoint scope */
  outgoingLimits?: OutgoingLimitsConfig;
  /** Incoming payment limits at global, per-sender, or per-endpoint scope */
  incomingLimits?: IncomingLimitsConfig;
  /** Whitelist of allowed recipient addresses or domains (for outgoing payments) */
  allowedRecipients?: string[];
  /** Blacklist of blocked recipient addresses or domains (for outgoing payments, takes precedence over whitelist) */
  blockedRecipients?: string[];
  /** Whitelist of allowed sender addresses or domains (for incoming payments) */
  allowedSenders?: string[];
  /** Blacklist of blocked sender addresses or domains (for incoming payments, takes precedence over whitelist) */
  blockedSenders?: string[];
  /** Rate limiting configuration (scoped per policy group) */
  rateLimits?: RateLimitConfig;
};

/**
 * Storage configuration for payment tracking.
 */
export type PaymentStorageConfig = {
  /** Storage type: 'sqlite' (default), 'in-memory', or 'postgres' */
  type: 'sqlite' | 'in-memory' | 'postgres';
  /** SQLite-specific configuration */
  sqlite?: {
    /** Custom database path (defaults to `.data/payments.db`) */
    dbPath?: string;
  };
  /** Postgres-specific configuration */
  postgres?: {
    /** Postgres connection string */
    connectionString: string;
  };
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
  /** Optional storage configuration (defaults to SQLite) */
  storage?: PaymentStorageConfig;
};

/**
 * HTTP request context passed to dynamic price functions.
 * Simplified version of x402's HTTPRequestContext.
 */
export type PriceContext = {
  adapter: {
    getHeader(name: string): string | undefined;
    getMethod(): string;
    getPath(): string;
    getUrl(): string;
    getQueryParams?(): Record<string, string | string[]>;
    getQueryParam?(name: string): string | string[] | undefined;
    getBody?(): unknown;
  };
  path: string;
  method: string;
};

/**
 * Static price value - a string like "$0.01" or a number.
 */
export type StaticPrice = string | number;

/**
 * Dynamic price function that receives request context.
 * Used for request-based pricing (e.g., different tiers).
 */
export type DynamicPriceFn = (
  context: PriceContext
) => StaticPrice | Promise<StaticPrice>;

/**
 * Price can be static or dynamic (function).
 */
export type PriceOrFn = StaticPrice | DynamicPriceFn;

/**
 * Price for an entrypoint - can be:
 * - A static string like "$0.01"
 * - A dynamic function for request-based pricing
 * - An object with separate invoke/stream prices (each can be static or dynamic)
 */
export type EntrypointPrice =
  | PriceOrFn
  | { invoke?: PriceOrFn; stream?: PriceOrFn };

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
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ) => RuntimePaymentRequirement;
  activate: (entrypoint: EntrypointDef) => void;
  resolvePrice: (
    entrypoint: EntrypointDef,
    which: 'invoke' | 'stream'
  ) => PriceOrFn | null;
  /** Payment tracker for bi-directional payment tracking (outgoing and incoming) */
  readonly paymentTracker?: unknown; // PaymentTracker instance (type exported from payments package)
  /** Optional rate limiter for rate limiting (only present if policy groups have rate limits) */
  readonly rateLimiter?: unknown; // RateLimiter instance (type exported from payments package)
  /** Policy groups configured for this runtime */
  readonly policyGroups?: PaymentPolicyGroup[];
  /** x402 resource server for payment middleware (only present if facilitatorUrl is configured) */
  readonly resourceServer?: unknown; // x402ResourceServer instance (type exported from payments package)
  /**
   * Get fetch function with payment support.
   * Returns a fetch function that automatically includes x402 payment headers.
   * Returns null if payment context cannot be created (e.g., no wallet configured).
   */
  getFetchWithPayment: (
    runtime: AgentRuntime,
    network?: string
  ) => Promise<((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null>;
};
