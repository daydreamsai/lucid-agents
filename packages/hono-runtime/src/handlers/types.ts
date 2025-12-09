/**
 * Context passed to handler functions
 */
export interface HandlerContext {
  /** Agent ID */
  agentId: string;

  /** Entrypoint key being invoked */
  entrypointKey: string;

  /** Input payload from the request */
  input: unknown;

  /** Session ID (for conversation continuity) */
  sessionId: string;

  /** Unique request identifier */
  requestId: string;

  /** Additional metadata from the request */
  metadata: Record<string, unknown>;
}

/**
 * Usage information returned by handlers
 */
export interface HandlerUsage {
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

/**
 * Result returned by handler functions
 */
export interface HandlerResult {
  /** Output payload */
  output: unknown;

  /** Optional usage information */
  usage?: HandlerUsage;
}

/**
 * Handler function type
 */
export type HandlerFn = (ctx: HandlerContext) => Promise<HandlerResult>;

/**
 * Configuration for builtin handlers
 */
export interface BuiltinHandlerConfig {
  name: string;
}
