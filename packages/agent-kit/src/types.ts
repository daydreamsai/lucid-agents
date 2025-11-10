import type {
  AgentContext as CoreAgentContext,
  AgentMeta as CoreAgentMeta,
  EntrypointDef as CoreEntrypointDef,
  PaymentsConfig as CorePaymentsConfig,
  StreamEnvelope as CoreStreamEnvelope,
  StreamPushEnvelope as CoreStreamPushEnvelope,
  StreamResult as CoreStreamResult,
  Usage as CoreUsage,
} from "@lucid-agents/agent-core";
import type {
  RegistrationEntry,
  TrustModel,
} from "@lucid-agents/agent-kit-identity";
import type { Network as X402Network, Resource } from "x402/types";
import type { ZodTypeAny } from "zod";

import type { AP2ExtensionDescriptor, AP2Role } from "./ap2";
export type {
  RegistrationEntry,
  TrustConfig,
  TrustModel,
} from "@lucid-agents/agent-kit-identity";

export type SolanaAddress = string;

export type Usage = CoreUsage;

export type AgentMeta = CoreAgentMeta;

export type AgentContext = CoreAgentContext & { runId: string };

export type StreamEnvelope = CoreStreamEnvelope;

export type StreamPushEnvelope = CoreStreamPushEnvelope;

export type StreamResult = CoreStreamResult;

export type EntrypointDef = Omit<
  CoreEntrypointDef<ZodTypeAny | undefined, ZodTypeAny | undefined>,
  "network"
> & {
  network?: X402Network;
};

export type Manifest = {
  name: string;
  version: string;
  description?: string;
  entrypoints: Record<
    string,
    {
      description?: string;
      streaming: boolean;
      input_schema?: any;
      output_schema?: any;
      pricing?: { invoke?: string; stream?: string };
    }
  >;
};

// A2A Agent Card (subset sufficient for interop)
export type PaymentMethod = {
  method: 'x402';
  // The payee address (e.g., EVM 0x..., Solana base58)
  payee: `0x${string}` | SolanaAddress;
  // The network where payment should be settled
  network: Network;
  // Optional facilitator or payment endpoint URL for this method
  endpoint?: Resource;
  // Optional pricing model descriptor; default is a flat string price per call
  priceModel?: { default?: string };
  // Vendor-specific fields, namespaced by vendor/method
  extensions?: { [vendor: string]: unknown };
};

export type AgentCapabilities = {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
  extensions?: Array<AP2ExtensionDescriptor | Record<string, unknown>>;
};

export type AgentCard = {
  name: string;
  description?: string;
  url?: string;
  provider?: { organization?: string; url?: string };
  version?: string;
  capabilities?: AgentCapabilities;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills?: Array<{
    id: string;
    name?: string;
    description?: string;
    tags?: string[];
    examples?: string[];
    inputModes?: string[];
    outputModes?: string[];
    // Vendor extensions are allowed by consumers; we may attach x- fields
    [key: string]: unknown;
  }>;
  supportsAuthenticatedExtendedCard?: boolean;
  // Vendor-neutral payments declaration
  payments?: PaymentMethod[];
  registrations?: RegistrationEntry[];
  trustModels?: TrustModel[];
  ValidationRequestsURI?: string;
  ValidationResponsesURI?: string;
  FeedbackDataURI?: string;
  // Allow extra fields per spec flexibility
  [key: string]: unknown;
};

export type AgentCardWithEntrypoints = AgentCard & {
  // Back-compat for our server: embed our previous manifest block
  entrypoints: Manifest['entrypoints'];
};

export type Network = X402Network;

export type PaymentsConfig = Omit<CorePaymentsConfig, "network" | "payTo" | "facilitatorUrl"> & {
  payTo: `0x${string}` | SolanaAddress;
  facilitatorUrl: Resource;
  network: Network;
};

export type AP2Config = {
  roles: AP2Role[];
  description?: string;
  required?: boolean;
};
