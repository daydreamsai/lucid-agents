import type { EntrypointDef, AgentRuntime } from '@lucid-agents/types/core';

/**
 * Supported MPP payment methods.
 */
export type MppPaymentMethod = 'tempo' | 'stripe' | 'lightning' | 'card' | string;

/**
 * Supported MPP payment intents.
 */
export type MppPaymentIntent = 'charge' | 'session';

/**
 * Tempo method configuration (server-side).
 * Tempo is the native stablecoin rail on Tempo Network.
 */
export type TempoServerConfig = {
  /** Token address or identifier (e.g., pathUSD address) */
  currency: string;
  /** Wallet address receiving payments */
  recipient: string;
  /** Optional blockchain network ID */
  chainId?: number;
  /** Optional fee payment address */
  feePayer?: string;
  /** Enable Server-Sent Events for streaming payments */
  sse?: boolean;
};

/**
 * Tempo method configuration (client-side).
 */
export type TempoClientConfig = {
  /** viem account object for signing transactions */
  account: any; // viem Account type - kept as any to avoid hard viem dependency
  /** Maximum tokens to lock in a payment channel (for sessions) */
  maxDeposit?: string;
  /** Network identifier */
  chainId?: number;
  /** RPC provider endpoint */
  rpcUrl?: string;
};

/**
 * Stripe method configuration (server-side).
 */
export type StripeServerConfig = {
  /** Stripe SDK client instance */
  client: any;
  /** Internal network identifier */
  networkId?: string;
  /** Supported card payment method types */
  paymentMethodTypes?: string[];
  /** Stripe API version */
  apiVersion?: string;
};

/**
 * Stripe method configuration (client-side).
 */
export type StripeClientConfig = {
  /** Stripe publishable key */
  publishableKey: string;
};

/**
 * Lightning method configuration (server-side).
 */
export type LightningServerConfig = {
  /** Lightning node connection string or endpoint */
  nodeUrl: string;
  /** Optional macaroon for authentication */
  macaroon?: string;
};

/**
 * Lightning method configuration (client-side).
 */
export type LightningClientConfig = {
  /** Lightning wallet connection */
  wallet: any;
};

/**
 * A configured server-side payment method.
 */
export type MppServerMethod = {
  name: MppPaymentMethod;
  config: TempoServerConfig | StripeServerConfig | LightningServerConfig | Record<string, unknown>;
};

/**
 * A configured client-side payment method.
 */
export type MppClientMethod = {
  name: MppPaymentMethod;
  config: TempoClientConfig | StripeClientConfig | LightningClientConfig | Record<string, unknown>;
};

/**
 * Entrypoint-level MPP configuration.
 * Can be set on individual entrypoints to override agent-level defaults.
 */
export type EntrypointMppConfig = {
  /** Payment intent type (default: 'charge') */
  intent?: MppPaymentIntent;
  /** Override amount for this entrypoint */
  amount?: string;
  /** Currency for this entrypoint */
  currency?: string;
  /** Human-readable description for the payment challenge */
  description?: string;
  /** Accepted payment methods (defaults to all configured methods) */
  methods?: MppPaymentMethod[];
};

/**
 * Session parameters for streaming pay-as-you-go payments.
 */
export type MppSessionConfig = {
  /** Per-unit cost (string) */
  amount: string;
  /** Unit description (e.g., 'photo', 'word', 'token') */
  unitType?: string;
  /** Recommended channel deposit */
  suggestedDeposit?: string;
  /** Minimum channel deposit */
  minDeposit?: string;
};

/**
 * Top-level MPP configuration for the agent.
 */
export type MppConfig = {
  /** Server-side payment methods to accept */
  methods: MppServerMethod[];
  /** Default currency for all entrypoints (e.g., 'usd') */
  currency?: string;
  /** Default payment intent (default: 'charge') */
  defaultIntent?: MppPaymentIntent;
  /** Session configuration for streaming payments */
  session?: MppSessionConfig;
  /** Challenge expiration in seconds (default: 300) */
  challengeExpirySeconds?: number;
};

/**
 * Client-side MPP configuration for making paid requests.
 */
export type MppClientConfig = {
  /** Client-side payment methods for paying */
  methods: MppClientMethod[];
};

/**
 * MPP payment requirement for an entrypoint.
 */
export type MppPaymentRequirement =
  | { required: false }
  | {
      required: true;
      amount: string;
      currency: string;
      intent: MppPaymentIntent;
      methods: MppPaymentMethod[];
      description?: string;
      response: Response;
    };

/**
 * MPP runtime exposed on AgentRuntime.mpp
 */
export type MppRuntime = {
  readonly config: MppConfig;
  readonly isActive: boolean;
  /** Evaluate payment requirements for an entrypoint */
  requirements: (
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ) => MppPaymentRequirement;
  /** Activate MPP for an entrypoint */
  activate: (entrypoint: EntrypointDef) => void;
  /** Resolve price for an entrypoint */
  resolvePrice: (
    entrypoint: EntrypointDef,
    which: 'invoke' | 'stream'
  ) => string | null;
  /** Get a fetch function that auto-pays MPP 402 challenges */
  getMppFetch: (
    clientConfig: MppClientConfig
  ) => Promise<((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null>;
};
