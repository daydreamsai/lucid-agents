/**
 * Standard fetch function type.
 * Used across packages to type fetch implementations (including payment-enabled fetch).
 */
export type FetchFunction = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/**
 * HTTP extension options.
 */
export type HttpExtensionOptions = {
  /**
   * Whether to enable the landing page route.
   * @default true
   */
  landingPage?: boolean;
  /**
   * Public path prefix where agent routes are mounted (for example `/api/agent`).
   * This is included in Agent Card URLs and generated links.
   * @default ""
   */
  basePath?: string;
  /**
   * Target-side invocation idempotency. Enabled with a bounded in-memory
   * store by default; inject a durable store for multi-instance deployments.
   */
  idempotency?: false | HttpIdempotencyOptions;
};

/** Serializable HTTP response retained for a completed idempotent invoke. */
export type StoredHttpResponse = {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
};

export type HttpIdempotencyClaim =
  | { state: 'claimed' }
  | { state: 'in_progress' }
  | { state: 'conflict' }
  | { state: 'completed'; response: StoredHttpResponse };

/** Atomic persistence port for target-side invoke deduplication. */
export type HttpIdempotencyStore = {
  claim: (
    scope: string,
    key: string,
    fingerprint: string,
    ownerId: string,
    expiresAt: number,
    now: number
  ) => Promise<HttpIdempotencyClaim>;
  complete: (
    scope: string,
    key: string,
    ownerId: string,
    response: StoredHttpResponse,
    expiresAt: number
  ) => Promise<boolean>;
  release: (scope: string, key: string, ownerId: string) => Promise<void>;
  close?: () => Promise<void> | void;
};

export type HttpIdempotencyOptions = {
  store?: HttpIdempotencyStore;
  /** Duration of an in-progress ownership claim. @default 900000 */
  inProgressTtlMs?: number;
  /** Duration to retain a successful response. @default 86400000 */
  retentionMs?: number;
  /** Maximum entries for the default in-memory store. @default 10000 */
  maxEntries?: number;
};

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
  usage?: StreamUsage;
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
 * Usage metrics for agent execution.
 * Inlined here to avoid circular dependency with core package.
 */
export type StreamUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

/**
 * Result object returned by streaming entrypoint handlers.
 */
export type StreamResult = {
  output?: unknown;
  usage?: StreamUsage;
  model?: string;
  status?: 'succeeded' | 'failed' | 'cancelled';
  error?: { code: string; message?: string };
  metadata?: Record<string, unknown>;
};

/**
 * HTTP handlers type for agent runtime.
 * Added to runtime by the http() extension.
 */
export type AgentHttpHandlers = {
  /**
   * Health check endpoint handler.
   */
  health: (req: Request) => Promise<Response>;

  /**
   * List all entrypoints handler.
   */
  entrypoints: (req: Request) => Promise<Response>;

  /**
   * Agent manifest/card endpoint handler.
   */
  manifest: (req: Request) => Promise<Response>;

  /**
   * OASF record endpoint handler.
   */
  oasf: (req: Request) => Promise<Response>;

  /**
   * Landing page handler (optional, depends on extension options).
   */
  landing?: (req: Request) => Promise<Response>;

  /**
   * Favicon handler.
   */
  favicon: (req: Request) => Promise<Response>;

  /**
   * Invoke an entrypoint handler.
   */
  invoke: (req: Request, params: { key: string }) => Promise<Response>;

  /**
   * Stream from an entrypoint handler.
   */
  stream: (req: Request, params: { key: string }) => Promise<Response>;

  /**
   * Create a new task (A2A Protocol).
   */
  tasks: (req: Request) => Promise<Response>;

  /**
   * Get a task by ID (A2A Protocol).
   */
  getTask: (req: Request, params: { taskId: string }) => Promise<Response>;

  /**
   * List tasks (A2A Protocol).
   */
  listTasks: (req: Request) => Promise<Response>;

  /**
   * Cancel a task (A2A Protocol).
   */
  cancelTask: (req: Request, params: { taskId: string }) => Promise<Response>;

  /**
   * Subscribe to task updates via SSE (A2A Protocol).
   */
  subscribeTask: (
    req: Request,
    params: { taskId: string }
  ) => Promise<Response>;
};

export type AgentHttpRouteId =
  | 'health'
  | 'entrypoints'
  | 'manifest'
  | 'legacyManifest'
  | 'oasf'
  | 'landing'
  | 'favicon'
  | 'invoke'
  | 'stream'
  | 'tasks'
  | 'getTask'
  | 'listTasks'
  | 'cancelTask'
  | 'subscribeTask';

/** Transport-neutral route emitted by the HTTP extension. */
export type AgentHttpRoute = {
  id: AgentHttpRouteId;
  method: 'GET' | 'POST';
  path: string;
  params: readonly string[];
  handle: (
    request: Request,
    params: Record<string, string>
  ) => Promise<Response>;
};

/** Complete route/capability plan consumed by framework adapters. */
export type AgentHttpRuntime = {
  basePath: string;
  handlers: AgentHttpHandlers;
  routes: readonly AgentHttpRoute[];
};
