import type {
  RegistrationEntry,
  TrustModel,
} from '@lucid-agents/agent-kit-identity';
import type { Network, Resource, SolanaAddress } from 'x402-hono';
import type { ZodObject } from 'zod';

import type { AP2ExtensionDescriptor, AP2Role } from './ap2';

export type {
  RegistrationEntry,
  TrustConfig,
  TrustModel,
} from '@lucid-agents/agent-kit-identity';

export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AgentMeta = { name: string; version: string; description: string };

export type AgentContext = {
  key: string;
  input: any;
  signal: AbortSignal;
  headers: Headers;
  runId: string;
};

export type StreamEnvelopeBase = {
  runId?: string;
  sequence?: number;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export type StreamRunStartEnvelope = StreamEnvelopeBase & {
  kind: 'run-start';
  runId: string;
};

export type StreamTextEnvelope = StreamEnvelopeBase & {
  kind: 'text';
  text: string;
  mime?: string;
  role?: string;
};

export type StreamDeltaEnvelope = StreamEnvelopeBase & {
  kind: 'delta';
  delta: string;
  mime?: string;
  final?: boolean;
  role?: string;
};

export type StreamAssetInlineTransfer = {
  transfer: 'inline';
  data: string;
};

export type StreamAssetExternalTransfer = {
  transfer: 'external';
  href: string;
  expiresAt?: string;
};

export type StreamAssetEnvelope = StreamEnvelopeBase & {
  kind: 'asset';
  assetId: string;
  mime: string;
  name?: string;
  sizeBytes?: number;
} & (StreamAssetInlineTransfer | StreamAssetExternalTransfer);

export type StreamControlEnvelope = StreamEnvelopeBase & {
  kind: 'control';
  control: string;
  payload?: unknown;
};

export type StreamErrorEnvelope = StreamEnvelopeBase & {
  kind: 'error';
  code: string;
  message: string;
  retryable?: boolean;
};

export type StreamRunEndEnvelope = StreamEnvelopeBase & {
  kind: 'run-end';
  runId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  output?: unknown;
  usage?: Usage;
  model?: string;
  error?: { code: string; message?: string };
};

export type StreamEnvelope =
  | StreamRunStartEnvelope
  | StreamTextEnvelope
  | StreamDeltaEnvelope
  | StreamAssetEnvelope
  | StreamControlEnvelope
  | StreamErrorEnvelope
  | StreamRunEndEnvelope;

export type StreamPushEnvelope = Exclude<
  StreamEnvelope,
  StreamRunStartEnvelope | StreamRunEndEnvelope
>;

export type StreamResult = {
  output?: unknown;
  usage?: Usage;
  model?: string;
  status?: 'succeeded' | 'failed' | 'cancelled';
  error?: { code: string; message?: string };
  metadata?: Record<string, unknown>;
};

export type EntrypointDef = {
  key: string;
  description?: string;
  input?: ZodObject;
  output?: ZodObject;
  streaming?: boolean;
  // Monetization: if set, this entrypoint is paywalled via x402
  price?: string | { invoke?: string; stream?: string };
  // Optional per-entrypoint network override (falls back to global)
  network?: Network;
  handler?: (
    ctx: AgentContext
  ) => Promise<{ output: any; usage?: Usage; model?: string }>;
  stream?: (
    ctx: AgentContext,
    emit: (chunk: StreamPushEnvelope) => Promise<void>
  ) => Promise<StreamResult>;
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

export type PaymentsConfig = {
  payTo: `0x${string}` | SolanaAddress;
  facilitatorUrl: Resource;
  network: Network;
  defaultPrice?: string; // used if entrypoint.price not specified
};

export type AP2Config = {
  roles: AP2Role[];
  description?: string;
  required?: boolean;
};
