import type { Network } from '../core/network';
import type { AgentAuthContext, SIWxConfig, SIWxStorage } from '../siwx';
import type { WalletsRuntime } from '../wallets';

/**
 * Resource URL type for x402 facilitator endpoints
 */
export type Resource = string;
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
  /** Per-sender limits keyed by a cryptographically verified payer address. */
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
export type PaymentReservationResult = {
  allowed: boolean;
  reservationId?: string;
  reason?: string;
};

export type PaymentLimitCheckResult = {
  allowed: boolean;
  reason?: string;
  currentTotal?: bigint;
};

export interface PaymentTracker {
  reserveIncomingLimit(
    groupName: string,
    scope: string,
    maxTotalUsd: number,
    windowMs: number | undefined,
    amount: bigint
  ): Promise<PaymentReservationResult>;
  reserveOutgoingLimit(
    groupName: string,
    scope: string,
    maxTotalUsd: number,
    windowMs: number | undefined,
    amount: bigint
  ): Promise<PaymentReservationResult>;
  reserveRateLimit(
    groupName: string,
    direction: PaymentDirection,
    maxPayments: number,
    windowMs: number
  ): Promise<PaymentReservationResult>;
  commitReservation(reservationId: string): Promise<void>;
  commitReservations(
    reservationIds: readonly string[],
    records?: readonly Omit<PaymentRecord, 'id' | 'timestamp'>[]
  ): Promise<void>;
  /**
   * Durably stage policy accounting before an irreversible settlement starts.
   * Staged amounts remain counted without a reservation TTL.
   */
  stageSettlement(
    reservationIds: readonly string[],
    records?: readonly Omit<PaymentRecord, 'id' | 'timestamp'>[]
  ): Promise<string>;
  /** Commit a staged settlement batch to payment history. */
  commitSettlement(settlementId: string): Promise<void>;
  /** Release a staged settlement batch after settlement definitively fails. */
  releaseSettlement(settlementId: string): Promise<void>;
  releaseReservation(reservationId: string): Promise<void>;
  checkOutgoingLimit(
    groupName: string,
    scope: string,
    maxTotalUsd: number,
    windowMs: number | undefined,
    requestedAmount: bigint
  ): Promise<PaymentLimitCheckResult>;
  checkIncomingLimit(
    groupName: string,
    scope: string,
    maxTotalUsd: number,
    windowMs: number | undefined,
    requestedAmount: bigint
  ): Promise<PaymentLimitCheckResult>;
  recordOutgoing(
    groupName: string,
    scope: string,
    amount: bigint
  ): Promise<void>;
  recordIncoming(
    groupName: string,
    scope: string,
    amount: bigint
  ): Promise<void>;
  getOutgoingTotal(
    groupName: string,
    scope: string,
    windowMs?: number
  ): Promise<bigint>;
  getIncomingTotal(
    groupName: string,
    scope: string,
    windowMs?: number
  ): Promise<bigint>;
  getAllData(): Promise<PaymentRecord[]>;
  clear(): Promise<void>;
  close(): Promise<void>;
}

/** Public contract for the optional in-process payment rate limiter. */
export interface PaymentRateLimiter {
  checkLimit(
    groupName: string,
    maxPayments: number,
    windowMs: number
  ): { allowed: boolean; reason?: string };
  recordPayment(groupName: string): void;
  getCurrentCount(groupName: string, windowMs: number): number;
  clear(): void;
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
  /** Whitelist of cryptographically verified payer addresses. */
  allowedSenders?: string[];
  /** Blacklist of verified payer addresses; takes precedence over the whitelist. */
  blockedSenders?: string[];
  /** Rate limiting configuration (scoped per policy group) */
  rateLimits?: RateLimitConfig;
};

/**
 * Storage configuration for payment tracking.
 */
export type PaymentStorageConfig = {
  /** Storage type. The portable runtime defaults to 'in-memory'. */
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
 * Stripe destination configuration for dynamic payTo resolution.
 */
export type StripePaymentsConfig = {
  /** Stripe secret key used to create PaymentIntents */
  secretKey: string;
  /** Optional API base URL for Stripe (primarily for tests) */
  apiBaseUrl?: string;
  /** Optional Stripe API version */
  apiVersion?: string;
};

/**
 * Static destination configuration where payTo is known upfront.
 */
export type StaticPaymentsDestination = {
  payTo: `0x${string}` | SolanaAddress;
  stripe?: never;
};

/**
 * Stripe destination configuration where payTo is resolved per request.
 */
export type StripePaymentsDestination = {
  stripe: StripePaymentsConfig;
  payTo?: never;
};

/**
 * Payment configuration for x402 protocol.
 * Supports static wallet destination and Stripe-backed dynamic destination.
 */
export type PaymentsConfig = {
  facilitatorUrl: Resource;
  /** Optional bearer token used to authenticate facilitator requests. */
  facilitatorAuth?: string;
  network: Network;
  /** Optional policy groups for payment controls and limits */
  policyGroups?: PaymentPolicyGroup[];
  /** Optional storage configuration (defaults to portable in-memory storage) */
  storage?: PaymentStorageConfig;
  /** Optional SIWX (Sign-In With X) configuration */
  siwx?: SIWxConfig;
} & (StaticPaymentsDestination | StripePaymentsDestination);

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
      payTo?: string;
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

/** Result of reserving policy capacity for a verified incoming payment. */
export type IncomingPaymentAdmission =
  | { admitted: false; response: Response }
  | {
      admitted: true;
      /** Release provisional policy reservations without settling a payment. */
      abort: () => Promise<void>;
      /** Whether payment settlement has become irreversible. */
      isCommitted?: () => boolean;
      /**
       * Reapply immutable settlement metadata to a fallback response after an
       * unexpected error occurs after commitment.
       */
      recoverCommittedResponse?: (response: Response) => Response;
      /** Settle and account for the payment against the application response. */
      finalize: (response: Response) => Promise<Response>;
    };

/** Result of verifying an incoming payment or SIWX credential. */
export type IncomingPaymentAuthorization =
  | { authorized: false; response: Response }
  | {
      authorized: true;
      /** Stable, verified caller identity used to scope idempotent responses. */
      subject?: string;
      auth?: AgentAuthContext;
      /** Atomically reserve policy capacity before application execution. */
      admit: () => Promise<IncomingPaymentAdmission>;
    };

/** Fetch-native incoming payment verifier with reusable SIWX authorization. */
export type IncomingPaymentAuthorizer = {
  (
    request: Request,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream',
    verifiedPayment?: VerifiedIncomingPayment
  ): Promise<IncomingPaymentAuthorization>;
  authorizeSIWx: (
    request: Request,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ) => Promise<IncomingPaymentAuthorization | undefined>;
};

/** A payment verified by another installed rail, such as MPP. */
export type VerifiedIncomingPayment = {
  protocol: 'mpp';
  payer?: string;
  amount: string;
  currency: string;
  network?: string;
};

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
  ) => string | null;
  /** Verify an incoming credential, then admit and settle it in explicit phases. */
  authorize: (
    request: Request,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream',
    /** Optional verified context supplied by another payment rail. */
    verifiedPayment?: VerifiedIncomingPayment
  ) => Promise<IncomingPaymentAuthorization>;
  /** Verify SIWX independently so alternate payment rails can reuse entitlements. */
  authorizeSIWx: (
    request: Request,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ) => Promise<IncomingPaymentAuthorization | undefined>;
  /** Release payment and SIWX storage resources. */
  close: () => Promise<void>;
  /** Payment tracker for bi-directional payment tracking (outgoing and incoming) */
  readonly paymentTracker?: PaymentTracker;
  /** Policy groups configured for this runtime */
  readonly policyGroups?: PaymentPolicyGroup[];
  /** SIWX storage instance (if SIWX is enabled) */
  readonly siwxStorage?: SIWxStorage;
  /** SIWX configuration (if SIWX is enabled) */
  readonly siwxConfig?: SIWxConfig;
  /**
   * Get fetch function with payment support.
   * Returns a fetch function that automatically includes x402 payment headers.
   * Returns null if payment context cannot be created (e.g., no wallet configured).
   */
  getFetchWithPayment: (
    runtime: AgentRuntime<{
      wallets?: WalletsRuntime;
      payments?: PaymentsRuntime;
    }>,
    network?: string
  ) => Promise<
    ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null
  >;
};
