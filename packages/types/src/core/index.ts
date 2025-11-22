import type { Network, Resource } from 'x402/types';
import { z, type z as ZType } from 'zod';

import type { EntrypointPrice, SolanaAddress } from '../payments';
import type { WalletsConfig, AgentWalletHandle } from '../wallets';
import type { PaymentsConfig } from '../payments';
import type { RegistrationEntry, TrustModel } from '../identity';

/**
 * Standard fetch function type.
 * Used across packages to type fetch implementations (including payment-enabled fetch).
 */
export type FetchFunction = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/**
 * Usage metrics for agent execution.
 */
export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

/**
 * Metadata describing an agent.
 */
export type AgentMeta = {
  name: string;
  version: string;
  description?: string;
  icon?: string;
  /**
   * Open Graph image URL for social previews and x402scan discovery.
   * Should be an absolute URL (e.g., "https://agent.com/og-image.png").
   * Recommended size: 1200x630px.
   */
  image?: string;
  /**
   * Canonical URL of the agent. Used for Open Graph tags.
   * If not provided, defaults to the agent's origin URL.
   */
  url?: string;
  /**
   * Open Graph type. Defaults to "website".
   */
  type?: 'website' | 'article';
};

/**
 * Context provided to entrypoint handlers.
 */
export type AgentContext = {
  key: string;
  input: unknown;
  signal: AbortSignal;
  metadata?: Record<string, unknown>;
  runId?: string;
  runtime?: AgentRuntime;
};

/**
 * Error thrown when input or output validation fails.
 */
export class ZodValidationError extends Error {
  constructor(
    public readonly kind: 'input' | 'output',
    public readonly issues: z.ZodError['issues']
  ) {
    super(
      kind === 'input' ? 'Invalid input provided' : 'Invalid output produced'
    );
  }
}

/**
 * Stream envelope types for SSE responses.
 */
export type StreamEnvelopeBase = {
  runId?: string;
  sequence?: number;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Envelope sent at the start of a streaming run.
 */
export type StreamRunStartEnvelope = StreamEnvelopeBase & {
  kind: 'run-start';
  runId: string;
};

/**
 * Envelope containing text content in a stream.
 */
export type StreamTextEnvelope = StreamEnvelopeBase & {
  kind: 'text';
  text: string;
  mime?: string;
  role?: string;
};

/**
 * Envelope containing incremental text deltas in a stream.
 */
export type StreamDeltaEnvelope = StreamEnvelopeBase & {
  kind: 'delta';
  delta: string;
  mime?: string;
  final?: boolean;
  role?: string;
};

/**
 * Inline asset transfer where data is embedded directly in the envelope.
 */
export type StreamAssetInlineTransfer = {
  transfer: 'inline';
  data: string;
};

/**
 * External asset transfer where data is referenced by URL.
 */
export type StreamAssetExternalTransfer = {
  transfer: 'external';
  href: string;
  expiresAt?: string;
};

/**
 * Envelope containing asset data (images, files, etc.) in a stream.
 */
export type StreamAssetEnvelope = StreamEnvelopeBase & {
  kind: 'asset';
  assetId: string;
  mime: string;
  name?: string;
  sizeBytes?: number;
} & (StreamAssetInlineTransfer | StreamAssetExternalTransfer);

/**
 * Envelope containing control messages for stream management.
 */
export type StreamControlEnvelope = StreamEnvelopeBase & {
  kind: 'control';
  control: string;
  payload?: unknown;
};

/**
 * Envelope containing error information in a stream.
 */
export type StreamErrorEnvelope = StreamEnvelopeBase & {
  kind: 'error';
  code: string;
  message: string;
  retryable?: boolean;
};

/**
 * Envelope sent at the end of a streaming run with final status and results.
 */
export type StreamRunEndEnvelope = StreamEnvelopeBase & {
  kind: 'run-end';
  runId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  output?: unknown;
  usage?: Usage;
  model?: string;
  error?: { code: string; message?: string };
};

/**
 * Union type of all possible stream envelope types.
 */
export type StreamEnvelope =
  | StreamRunStartEnvelope
  | StreamTextEnvelope
  | StreamDeltaEnvelope
  | StreamAssetEnvelope
  | StreamControlEnvelope
  | StreamErrorEnvelope
  | StreamRunEndEnvelope;

/**
 * Stream envelope types that can be pushed during streaming (excludes run-start and run-end).
 */
export type StreamPushEnvelope = Exclude<
  StreamEnvelope,
  StreamRunStartEnvelope | StreamRunEndEnvelope
>;

/**
 * Result object returned by streaming entrypoint handlers.
 */
export type StreamResult = {
  output?: unknown;
  usage?: Usage;
  model?: string;
  status?: 'succeeded' | 'failed' | 'cancelled';
  error?: { code: string; message?: string };
  metadata?: Record<string, unknown>;
};

/**
 * Handler function for non-streaming entrypoints.
 */
export type EntrypointHandler<
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
> = (
  ctx: AgentContext & {
    input: TInput extends z.ZodTypeAny ? z.infer<TInput> : unknown;
  }
) => Promise<{
  output: TOutput extends z.ZodTypeAny ? z.infer<TOutput> : unknown;
  usage?: Usage;
  model?: string;
}>;

/**
 * Handler function for streaming entrypoints.
 */
export type EntrypointStreamHandler<
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
> = (
  ctx: AgentContext & {
    input: TInput extends z.ZodTypeAny ? z.infer<TInput> : unknown;
  },
  emit: (chunk: StreamPushEnvelope) => Promise<void> | void
) => Promise<StreamResult>;

/**
 * Definition of an agent entrypoint.
 */
export type EntrypointDef<
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
> = {
  key: string;
  description?: string;
  input?: TInput;
  output?: TOutput;
  streaming?: boolean;
  price?: EntrypointPrice;
  network?: Network;
  handler?: EntrypointHandler<TInput, TOutput>;
  stream?: EntrypointStreamHandler<TInput>;
  metadata?: Record<string, unknown>;
};

/**
 * Configuration for the agent kit runtime.
 * Combines configuration blocks from various extensions (payments, wallets, etc.).
 */
export type AgentKitConfig = {
  payments?: PaymentsConfig;
  wallets?: WalletsConfig;
};

/**
 * Configuration for an agent instance, including metadata, payments, and wallets.
 */
export type AgentConfig = {
  meta: AgentMeta;
  payments?: PaymentsConfig | false;
  wallets?: {
    agent?: AgentWalletHandle;
    developer?: AgentWalletHandle;
  };
};

/**
 * Core agent interface providing entrypoint management.
 */
export type AgentCore = {
  readonly config: AgentConfig;
  addEntrypoint: (entrypoint: EntrypointDef) => void;
  listEntrypoints: () => EntrypointDef[];
};

// Manifest and Agent Card types
/**
 * Agent manifest structure describing entrypoints and capabilities.
 */
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

/**
 * Payment method configuration for x402 protocol.
 */
export type PaymentMethod = {
  method: 'x402';
  payee: `0x${string}` | SolanaAddress;
  network: Network;
  endpoint?: Resource;
  priceModel?: { default?: string };
  extensions?: { [vendor: string]: unknown };
};

/**
 * Agent capabilities and feature flags.
 */
export type AgentCapabilities = {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
  extensions?: Array<
    import('../ap2').AP2ExtensionDescriptor | Record<string, unknown>
  >;
};

/**
 * Agent Card structure following the Agent Card specification.
 * Describes agent metadata, capabilities, skills, payments, and trust information.
 */
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
    [key: string]: unknown;
  }>;
  supportsAuthenticatedExtendedCard?: boolean;
  payments?: PaymentMethod[];
  registrations?: RegistrationEntry[];
  trustModels?: TrustModel[];
  ValidationRequestsURI?: string;
  ValidationResponsesURI?: string;
  FeedbackDataURI?: string;
  [key: string]: unknown;
};

/**
 * Agent Card extended with entrypoint definitions from the manifest.
 */
export type AgentCardWithEntrypoints = AgentCard & {
  entrypoints: Manifest['entrypoints'];
};

/**
 * Entrypoints runtime type.
 * Returned by AgentRuntime.entrypoints.
 */
export type EntrypointsRuntime = {
  add: (def: EntrypointDef) => void;
  list: () => Array<{
    key: string;
    description?: string;
    streaming: boolean;
  }>;
  snapshot: () => EntrypointDef[];
};

/**
 * Manifest runtime type.
 * Returned by AgentRuntime.manifest.
 */
export type ManifestRuntime = {
  build: (origin: string) => AgentCardWithEntrypoints;
  invalidate: () => void;
};

/**
 * Agent runtime interface.
 * This type is defined in the types package to avoid circular dependencies
 * between @lucid-agents/core and @lucid-agents/payments.
 *
 * The actual implementation is in @lucid-agents/core.
 */
export type AgentRuntime = {
  /**
   * Agent core instance. The actual type is AgentCore from @lucid-agents/core.
   * Using `any` here to avoid circular dependency - the type will be properly
   * inferred when used with the actual runtime implementation.
   */
  agent: any;
  config: AgentKitConfig;
  wallets?: import('../wallets').WalletsRuntime;
  payments?: import('../payments').PaymentsRuntime;
  a2a?: import('../a2a').A2ARuntime;
  ap2?: import('../ap2').AP2Runtime;
  handlers?: {
    health: (req: Request) => Promise<Response>;
    entrypoints: (req: Request) => Promise<Response>;
    manifest: (req: Request) => Promise<Response>;
    landing?: (req: Request) => Promise<Response>;
    favicon: (req: Request) => Promise<Response>;
    invoke: (req: Request, params: { key: string }) => Promise<Response>;
    stream: (req: Request, params: { key: string }) => Promise<Response>;
    tasks: (req: Request) => Promise<Response>;
    getTask: (req: Request, params: { taskId: string }) => Promise<Response>;
    listTasks: (req: Request) => Promise<Response>;
    cancelTask: (req: Request, params: { taskId: string }) => Promise<Response>;
    subscribeTask: (
      req: Request,
      params: { taskId: string }
    ) => Promise<Response>;
  };
  entrypoints: EntrypointsRuntime;
  manifest: ManifestRuntime;
};

/**
 * Return type for adapter-specific `createAgentApp` functions.
 * Generic over the app type to support different frameworks (Hono, Express, etc.).
 *
 * The runtime, agent, and config types are inferred from the actual return value
 * of `createAgentHttpRuntime` to avoid circular dependencies.
 */
export type CreateAgentAppReturn<
  TApp = unknown,
  TRuntime = any,
  TAgent = any,
  TConfig = any,
> = {
  app: TApp;
  runtime: TRuntime;
  agent: TAgent;
  addEntrypoint: (def: EntrypointDef) => void;
  config: TConfig;
};

/**
 * Build context provided to extensions during build.
 */
export type BuildContext = {
  meta: AgentMeta;
  config: AgentKitConfig;
  runtime: Partial<AgentRuntime>;
};

/**
 * Extension interface. Each extension contributes a runtime slice.
 */
export interface Extension<R extends Record<string, unknown> = {}> {
  /**
   * Unique name of the extension (for debugging and conflict detection).
   */
  name: string;

  /**
   * Builds the extension's runtime slice.
   * Called during AgentBuilder.build() to construct the runtime.
   */
  build: (ctx: BuildContext) => R;

  /**
   * Optional hook called when an entrypoint is added to the runtime.
   * Useful for extensions that need to activate/enable themselves per entrypoint.
   */
  onEntrypointAdded?: (
    entrypoint: EntrypointDef,
    runtime: AgentRuntime
  ) => void;

  /**
   * Optional hook called after all extensions are built.
   * Useful for final setup that requires the complete runtime.
   * Can be async for initialization that requires async operations.
   */
  onBuild?: (runtime: AgentRuntime) => void | Promise<void>;

  /**
   * Optional hook called when building the manifest/agent card.
   * Can modify the card before it's returned.
   */
  onManifestBuild?: (
    card: AgentCardWithEntrypoints,
    runtime: AgentRuntime
  ) => AgentCardWithEntrypoints;
}

/**
 * Type utility to convert a union of types to an intersection.
 * Used for merging extension runtime types.
 */
export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/**
 * Type utility to extract the runtime type from an array of extensions.
 * Merges all extension runtime slices into a single type.
 */
export type AppRuntime<Es extends Extension[]> = UnionToIntersection<
  Es[number] extends Extension<infer R> ? R : never
>;
