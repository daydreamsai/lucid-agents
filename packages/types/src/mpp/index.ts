import type { EntrypointDef } from '../core';
import type { FetchFunction } from '../http';
import type { Account, Client } from 'viem';

export type MppPaymentIntent = 'charge' | 'session';
/** Canonical operation used when resolving transport-specific MPP support. */
export type MppPaymentOperation = 'invoke' | 'stream' | 'task';
export type MppPaymentMethod = string;

export type TempoServerConfig = {
  currency: string;
  recipient: string;
  /** Currency precision used to convert display prices to base units. */
  decimals?: number;
  chainId?: number;
  testnet?: boolean;
};

/** Viem account accepted by the native Tempo session verifier. */
export type TempoSessionAccount = Account;

/** Display-denominated minimum, suggested, and maximum session deposits. */
export type TempoSessionDepositBounds = {
  minimum: string;
  suggested: string;
  maximum: string;
};

/** Optional thresholds that trigger native Tempo session settlement. */
export type TempoSessionSettlementSchedule = {
  units?: number;
  amount?: string;
  intervalMs?: number;
};

/** Settlement notification emitted by the native Tempo session rail. */
export type TempoSessionSettlementEvent = Readonly<{
  txHash: `0x${string}`;
  channelId: `0x${string}`;
  trigger: 'settle' | 'close' | 'scheduled';
  amount: bigint;
  delta: bigint;
}>;

/** Inputs used to resolve an existing Tempo session channel. */
export type TempoSessionResolveChannelIdParameters = {
  source?: string;
  paymentRequest: {
    amount: string;
    currency: string;
    recipient?: string;
    chainId?: number;
  };
};

/** Native Tempo TIP-1034 invoke-session configuration. */
export type TempoSessionServerConfig = {
  mode: 'development' | 'production';
  account: TempoSessionAccount;
  chainId: number;
  currency: `0x${string}`;
  recipient: `0x${string}`;
  decimals: number;
  /** Display-denominated amount deducted for one billable unit. */
  amount: string;
  unitType: string;
  deposit: TempoSessionDepositBounds;
  /** Atomic session state. Production requires `durability: "durable"`. */
  store?: TempoSessionStore;
  bootstrap?: boolean;
  resolveChannelId?: (
    parameters: TempoSessionResolveChannelIdParameters
  ) => string | undefined | Promise<string | undefined>;
  settlementSchedule?: TempoSessionSettlementSchedule;
  onSettlement?: (event: TempoSessionSettlementEvent) => void | Promise<void>;
  getClient: (parameters: { chainId?: number }) => Client | Promise<Client>;
  channelStateTtlMs?: number;
  minVoucherDelta?: string;
  escrowContract?: `0x${string}`;
  operator?: `0x${string}`;
  feePayer?: Account | string | true;
  feeToken?: `0x${string}`;
  /** Bounded wait for a new voucher/top-up during stream metering. */
  topUpWait?: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  };
};

export type StripeServerConfig = {
  secretKey: string;
  networkId: string;
  currency?: string;
  decimals?: number;
  paymentMethodTypes?: string[];
  metadata?: Record<string, string>;
};

/** EIP-3009 token domain metadata used for EVM charge signatures. */
export type EvmAuthorizationConfig = {
  name: string;
  version: string;
};

/** Verified EIP-3009 authorization payload passed to custom settlement. */
export type EvmAuthorizationPayload = {
  from: `0x${string}`;
  nonce: `0x${string}`;
  signature: `0x${string}`;
  to: `0x${string}`;
  type: 'authorization';
  validAfter: string;
  validBefore: string;
  value: string;
};

/** Atomic EVM charge terms passed to custom settlement. */
export type EvmChargeRequest = {
  amount: string;
  currency: `0x${string}`;
  description?: string;
  externalId?: string;
  methodDetails: {
    chainId: number;
    credentialTypes?: Array<'authorization'>;
    decimals?: number;
  };
  recipient: `0x${string}`;
};

/** Verified EVM authorization and charge terms passed to settlement. */
export type EvmSettlementContext = {
  credential: {
    challenge: Record<string, unknown>;
    payload: EvmAuthorizationPayload;
    source?: string;
  };
  payload: EvmAuthorizationPayload;
  request: EvmChargeRequest;
  /** Verified CAIP-10 payer identifier. */
  source: `did:pkh:eip155:${number}:0x${string}`;
};

/** Durable reference returned after custom EVM settlement. */
export type EvmSettlementResult = {
  /** Chain transaction hash or other durable settlement reference. */
  reference: string;
  timestamp?: string;
};

/** Custom EVM settlement callback. */
export type EvmSettle = (
  context: EvmSettlementContext
) => Promise<EvmSettlementResult>;

/** Structural x402 facilitator client accepted by the native EVM rail. */
export type MppX402Facilitator = {
  verify: (
    paymentPayload: Record<string, unknown>,
    paymentRequirements: Record<string, unknown>
  ) => Promise<{
    isValid: boolean;
    invalidMessage?: string;
    invalidReason?: string;
    payer?: string;
    [key: string]: unknown;
  }>;
  settle: (
    paymentPayload: Record<string, unknown>,
    paymentRequirements: Record<string, unknown>
  ) => Promise<{
    network: string;
    success: boolean;
    transaction: string;
    errorMessage?: string;
    errorReason?: string;
    payer?: string;
    [key: string]: unknown;
  }>;
};

/** Selects custom or facilitator-backed settlement for an EVM charge. */
export type EvmSettlementStrategy =
  | {
      type: 'custom';
      settle: EvmSettle;
      /** Maximum lifetime advertised to x402 buyers. Defaults to 300 seconds. */
      maxTimeoutSeconds?: number;
    }
  | {
      type: 'facilitator';
      facilitator: string | MppX402Facilitator;
      fetch?: FetchFunction;
      /** Maximum facilitator settlement lifetime. Defaults to 300 seconds. */
      maxTimeoutSeconds?: number;
    };

/** Native Payment Authentication EVM charge and compatible x402 exact rail. */
export type EvmServerConfig = {
  chainId: number;
  currency: `0x${string}`;
  recipient: `0x${string}`;
  decimals: number;
  authorization: EvmAuthorizationConfig;
  /** Exactly one settlement strategy is required. */
  settlement: EvmSettlementStrategy;
};

export type LightningServerConfig = {
  nodeUrl: string;
  macaroon?: string;
};

export type MppServerMethod = {
  name: MppPaymentMethod;
  /** Selects a built-in mppx verifier or the application verifier. */
  implementation?: 'tempo' | 'tempo-session' | 'stripe' | 'evm' | 'custom';
  config:
    | TempoServerConfig
    | TempoSessionServerConfig
    | StripeServerConfig
    | EvmServerConfig
    | LightningServerConfig
    | Record<string, unknown>;
};

export type EntrypointMppConfig = {
  intent?: MppPaymentIntent;
  amount?: string;
  currency?: string;
  description?: string;
  methods?: MppPaymentMethod[];
};

export type MppSessionConfig = {
  amount: string;
  unitType?: string;
  suggestedDeposit?: string;
  minDeposit?: string;
};

/** Atomic mutation returned by a Tempo session store update callback. */
export type TempoSessionStoreChange<Result = unknown> =
  | { op: 'noop'; result: Result }
  | { op: 'set'; value: unknown; result: Result }
  | { op: 'delete'; result: Result };

/**
 * Atomic channel state store for native Tempo sessions.
 *
 * Values are owned by the pinned mppx session implementation. The callback is
 * synchronous and may be retried by a durable backend, so it must not perform
 * side effects.
 */
export interface TempoSessionStore {
  readonly durability: 'process' | 'durable';
  get(key: string): Promise<unknown | null>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  update<Result>(
    key: string,
    fn: (current: unknown | null) => TempoSessionStoreChange<Result>
  ): Promise<Result>;
  close?(): Promise<void> | void;
}

/**
 * Public, non-secret values that bind an issued challenge to one operation.
 *
 * Implementations persist digests instead of credentials or request bodies.
 */
export type MppChallengeBinding = {
  entrypointKey: string;
  operation: 'invoke' | 'stream';
  challengeDigest: string;
  requestMethod?: string;
  requestTarget?: string;
  requestBodyDigest?: string;
};

/** Issued MPP challenge metadata persisted by a replay fence. */
export type MppChallengeIssue = {
  challengeId: string;
  binding: MppChallengeBinding;
  issuedAt: number;
  expiresAt: number;
};

/** Result of attempting to persist a newly issued MPP challenge. */
export type MppChallengeIssueResult =
  | { status: 'issued' }
  | { status: 'exists' }
  | { status: 'capacity' };

/** Request to claim an MPP challenge for exclusive verification. */
export type MppChallengeClaim = {
  challengeId: string;
  binding: MppChallengeBinding;
  /** Validated idempotency key used only for verified receipt recovery. */
  idempotencyKey?: string;
  /** Duration of the exclusive verification lease. */
  leaseMs?: number;
};

/** Exact public offer terms selected by a verified MPP credential. */
export type MppPaymentSelection = {
  amount: string;
  currency: string;
  intent: MppPaymentIntent;
  method: MppPaymentMethod;
};

/**
 * MPP-owned disposition for policy accounting after successful verification.
 *
 * Charge dispositions are already settled. Session dispositions reserve a
 * verified atomic ceiling and finalize against the referenced channel.
 */
export type MppAccountingDisposition =
  | { intent: 'charge' }
  | {
      intent: 'session';
      reference: string;
      maximumAmount: string;
    };

/** Recoverable authorization persisted after successful verification. */
export type MppStoredAuthorization = {
  /** Non-empty serialized receipt proving successful verification. */
  receipt: string;
  payer?: string;
  network?: string;
  /** Public offer terms retained for correct multi-method replay accounting. */
  payment?: MppPaymentSelection;
};

/** Result of claiming or recovering a persisted MPP challenge. */
export type MppChallengeClaimResult =
  | {
      status: 'claimed';
      leaseId: string;
      leaseExpiresAt: number;
      renewAfterMs: number;
    }
  | {
      status: 'recovered';
      authorization: MppStoredAuthorization;
    }
  | {
      status: 'in_progress';
      leaseExpiresAt: number;
    }
  | {
      status: 'invalid';
      reason: 'missing' | 'expired' | 'binding_mismatch' | 'consumed';
    };

/** Identifies one exclusive challenge-verification lease. */
export type MppChallengeLease = {
  challengeId: string;
  leaseId: string;
};

/** Request to extend an active verification lease before it can be reclaimed. */
export type MppChallengeLeaseRenewal = MppChallengeLease & {
  /** Override the store's configured lease duration for this renewal. */
  leaseMs?: number;
};

/** Result of atomically renewing an active verification lease. */
export type MppChallengeLeaseRenewalResult =
  | {
      status: 'renewed';
      leaseExpiresAt: number;
      renewAfterMs: number;
    }
  | { status: 'lost' };

/** Request to consume a challenge after conclusive verification. */
export type MppChallengeConsume = MppChallengeLease & {
  /**
   * Persisted only when the claim carried an idempotency key. Protocol
   * management responses and raw credentials are intentionally excluded.
   */
  authorization?: MppStoredAuthorization;
};

/** Result of consuming a leased MPP challenge. */
export type MppChallengeConsumeResult =
  | { status: 'consumed' }
  | { status: 'missing' }
  | { status: 'invalid_lease' };

/**
 * Atomic replay fence for MPP challenges.
 *
 * A claim grants one verifier an exclusive lease. The verifier must release
 * the lease after a retryable failure or consume it after successful payment.
 */
export interface MppChallengeStore {
  /** Process-local stores cannot provide cross-replica or restart recovery. */
  readonly durability: 'process' | 'durable';
  issue(challenge: MppChallengeIssue): Promise<MppChallengeIssueResult>;
  claim(claim: MppChallengeClaim): Promise<MppChallengeClaimResult>;
  renew(
    renewal: MppChallengeLeaseRenewal
  ): Promise<MppChallengeLeaseRenewalResult>;
  release(lease: MppChallengeLease): Promise<boolean>;
  consume(consumption: MppChallengeConsume): Promise<MppChallengeConsumeResult>;
  recover(
    challengeId: string,
    idempotencyKey: string
  ): Promise<MppStoredAuthorization | undefined>;
  pruneExpired(now?: number): Promise<number>;
  close?(): Promise<void> | void;
}

export type MppPaymentRequirement =
  | { required: false }
  | {
      required: true;
      amount: string;
      currency: string;
      intent: MppPaymentIntent;
      methods: MppPaymentMethod[];
      description?: string;
    };

export type MppCredentialVerification =
  | {
      valid: true;
      /** Non-empty serialized receipt proving successful settlement. */
      receipt: string;
      /** Verified payer identity used by incoming payment policy checks. */
      payer?: string;
      /** Optional payment network used for SIWX entitlement metadata. */
      network?: string;
    }
  | { valid: false; response?: Response; reason?: string };

export type MppCredentialVerificationContext = {
  request: Request;
  entrypoint: EntrypointDef;
  kind: 'invoke' | 'stream';
  requirement: Extract<MppPaymentRequirement, { required: true }>;
  credential: {
    challengeId: string;
    challenge: {
      id: string;
      realm: string;
      method: string;
      intent: string;
      request: Record<string, unknown>;
      description?: string;
      digest?: string;
      expires?: string;
    };
    payload: Record<string, unknown>;
    /** Cryptographically asserted payer DID supplied by the payment method. */
    source?: string;
  };
};

export type MppCredentialVerifier = (
  context: MppCredentialVerificationContext
) => MppCredentialVerification | Promise<MppCredentialVerification>;

export type MppConfig = {
  methods: MppServerMethod[];
  /** Payment-Auth realm. Defaults to the agent name. */
  realm?: string;
  /** HMAC key for built-in mppx challenges. Generated per process if omitted; challenge state remains process-local. */
  secretKey?: string;
  currency?: string;
  defaultIntent?: MppPaymentIntent;
  session?: MppSessionConfig;
  challengeExpirySeconds?: number;
  /**
   * Atomic challenge replay storage. The MPP package supplies a bounded,
   * process-local default; production deployments should inject a durable
   * store from a Node-only adapter.
   */
  challengeStore?: MppChallengeStore;
  /** Credential-bearing requests fail closed when this verifier is absent. */
  verifyCredential?: MppCredentialVerifier;
};

/** Native mppx client method intents passed through to `Mppx.create()`. */
export type MppClientConfig = {
  methods: readonly unknown[];
  /** Fetch implementation wrapped by mppx. Defaults to globalThis.fetch. */
  fetch?: FetchFunction;
};

/** Verified native Tempo session receipt fields. */
export type MppSessionReceiptData = {
  method: 'tempo';
  intent: 'session';
  status: 'success';
  timestamp: string;
  reference: string;
  challengeId: string;
  channelId: `0x${string}`;
  acceptedCumulative: string;
  spent: string;
  units?: number;
  txHash?: `0x${string}`;
};

/** SSE receipt event emitted after a session unit is charged. */
export type MppSessionReceiptEvent = {
  event: 'payment-receipt';
  data: MppSessionReceiptData;
  /** Payment-Receipt header encoding of `data`. */
  serialized: string;
};

/** SSE control event requesting a higher cumulative session voucher. */
export type MppSessionNeedVoucherEvent = {
  event: 'payment-need-voucher';
  data: {
    channelId: `0x${string}`;
    requiredCumulative: string;
    acceptedCumulative: string;
    deposit: string;
  };
};

/** Result of attempting to charge one session meter unit. */
export type MppSessionMeterChargeResult =
  | {
      status: 'charged';
      receipt: MppSessionReceiptEvent;
      /** Roll back this unit if transport delivery fails before emission. */
      rollback: () => Promise<void>;
    }
  | {
      status: 'unavailable';
      reason: 'closed' | 'timeout' | 'aborted';
      problem: Response;
    };

/**
 * High-level session meter exposed to transports after native verification.
 * The durable store and channel mutation details remain package-private.
 */
export type MppSessionMeter = {
  readonly channelId: `0x${string}`;
  readonly unitType: string;
  /** Raw token amount charged for one delivered unit. */
  readonly unitAmount: string;
  /** Raw token ceiling reserved for this session stream. */
  readonly maximumAmount: string;
  charge(options?: {
    signal?: AbortSignal;
    onNeedVoucher?: (event: MppSessionNeedVoucherEvent) => void | Promise<void>;
  }): Promise<MppSessionMeterChargeResult>;
  receipt(): Promise<MppSessionReceiptEvent>;
  cancel(): Promise<void>;
};

export type MppAuthorizationResult =
  | { authorized: false; response: Response }
  | {
      authorized: true;
      receipt?: string;
      payer?: string;
      network?: string;
      /** Exact server offer selected by the verified credential. */
      payment?: MppPaymentSelection;
      /** Payment lifecycle already classified by the owning MPP runtime. */
      accounting?: MppAccountingDisposition;
      /** Verified protocol response headers to add to the handler response. */
      responseHeaders?: Record<string, string>;
      /** Protocol management response that must bypass the entrypoint handler. */
      handled?: Response;
      /** Verified, transport-neutral Tempo session meter. */
      sessionMeter?: MppSessionMeter;
    };

/** Options controlling verified challenge recovery during authorization. */
export type MppAuthorizationOptions = {
  /**
   * Retain verified challenge state only while an HTTP invocation is protected
   * by a configured idempotency store using the same validated key.
   */
  allowIdempotencyRecovery?: boolean;
  /**
   * Run transport policy checks after the credential selects exact payment
   * terms but before the selected verifier can settle them.
   */
  preflightPayment?: (
    payment: MppPaymentSelection
  ) => Promise<Response | undefined>;
};

/** One MPP payment offer projected into OpenAPI discovery. */
export type MppOpenApiOffer = {
  amount: string | null;
  currency: string;
  description?: string;
  intent: string;
  method: string;
};

/** MPP payment metadata attached to one OpenAPI operation. */
export type MppOpenApiOperation = Record<string, unknown> & {
  'x-payment-info'?: { offers: MppOpenApiOffer[] };
};

/** Framework-neutral OpenAPI 3.1 document with MPP components. */
export type MppOpenApiDocument = {
  openapi: '3.1.0';
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, { post?: MppOpenApiOperation }>;
  components: {
    securitySchemes: Record<string, unknown>;
    parameters: Record<string, unknown>;
    headers: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
};

/** Inputs used to project configured MPP entrypoints into OpenAPI. */
export type MppOpenApiProjectionOptions = {
  title: string;
  version: string;
  basePath?: string;
  entrypoints: Iterable<EntrypointDef>;
};

/** Reusable OpenAPI components contributed by the MPP runtime. */
export type MppOpenApiComponents = MppOpenApiDocument['components'];

/** Complete MPP runtime capability owned by the MPP package. */
export type MppRuntime = {
  readonly config: MppConfig;
  readonly isActive: boolean;
  /**
   * Decode-only credential presence check owned by the MPP implementation.
   * This does not verify or authorize payment.
   */
  hasCredential: (request: Request) => boolean;
  requirements: (
    entrypoint: EntrypointDef,
    operation: MppPaymentOperation
  ) => MppPaymentRequirement;
  activate: (entrypoint: EntrypointDef) => void;
  resolvePrice: (
    entrypoint: EntrypointDef,
    which: 'invoke' | 'stream'
  ) => string | null;
  authorize: (
    request: Request,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream',
    /** Reuse a requirement already resolved by the shared authorization gate. */
    requirement?: MppPaymentRequirement,
    options?: MppAuthorizationOptions
  ) => Promise<MppAuthorizationResult>;
  /**
   * Project the configured entrypoints and the same ordered offers used by
   * authorization into an OpenAPI 3.1 discovery document.
   */
  projectOpenApi: (options: MppOpenApiProjectionOptions) => MppOpenApiDocument;
  /** Project the MPP fields for one canonical HTTP OpenAPI operation. */
  projectPayment: (
    entrypoint: EntrypointDef,
    operation: 'invoke' | 'stream'
  ) => MppOpenApiOperation | undefined;
  /** Components referenced by `projectPayment`. */
  openApiComponents: () => MppOpenApiComponents;
  getMppFetch: (clientConfig: MppClientConfig) => Promise<FetchFunction | null>;
};
