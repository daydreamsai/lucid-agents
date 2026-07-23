import type { EntrypointDef } from '../core';
import type { FetchFunction } from '../http';

export type MppPaymentIntent = 'charge' | 'session';
export type MppPaymentMethod = string;

export type TempoServerConfig = {
  currency: string;
  recipient: string;
  /** Currency precision used to convert display prices to base units. */
  decimals?: number;
  chainId?: number;
  testnet?: boolean;
};

export type StripeServerConfig = {
  secretKey: string;
  networkId: string;
  currency?: string;
  decimals?: number;
  paymentMethodTypes?: string[];
  metadata?: Record<string, string>;
};

export type LightningServerConfig = {
  nodeUrl: string;
  macaroon?: string;
};

export type MppServerMethod = {
  name: MppPaymentMethod;
  /** Selects a built-in mppx verifier or the application verifier. */
  implementation?: 'tempo' | 'stripe' | 'custom';
  config:
    | TempoServerConfig
    | StripeServerConfig
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
  /** Credential-bearing requests fail closed when this verifier is absent. */
  verifyCredential?: MppCredentialVerifier;
};

/** Native mppx client method intents passed through to `Mppx.create()`. */
export type MppClientConfig = {
  methods: readonly unknown[];
  /** Fetch implementation wrapped by mppx. Defaults to globalThis.fetch. */
  fetch?: FetchFunction;
};

export type MppAuthorizationResult =
  | { authorized: false; response: Response }
  | {
      authorized: true;
      receipt?: string;
      payer?: string;
      network?: string;
      /** Protocol management response that must bypass the entrypoint handler. */
      handled?: Response;
    };

export type MppAuthorizationOptions = {
  /**
   * Retain verified challenge state only while an HTTP invocation is protected
   * by a configured idempotency store using the same validated key.
   */
  allowIdempotencyRecovery?: boolean;
};

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
    kind: 'invoke' | 'stream'
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
  getMppFetch: (clientConfig: MppClientConfig) => Promise<FetchFunction | null>;
};
