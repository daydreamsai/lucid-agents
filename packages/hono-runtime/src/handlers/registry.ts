import type { HandlerFn, BuiltinHandlerConfig } from './types';
import { builtinHandlers } from './builtins';

/**
 * Error thrown when a handler cannot be found
 */
export class HandlerNotFoundError extends Error {
  constructor(type: string, name?: string) {
    const msg = name
      ? `Handler not found: ${type}/${name}`
      : `Unknown handler type: ${type}`;
    super(msg);
    this.name = 'HandlerNotFoundError';
  }
}

/**
 * Registry for handler functions.
 *
 * In MVP, only builtin handlers are supported.
 * Future versions will add LLM, graph, webhook handlers.
 */
export class HandlerRegistry {
  private builtins: Map<string, HandlerFn>;

  constructor() {
    this.builtins = new Map(Object.entries(builtinHandlers));
  }

  /**
   * Register a custom builtin handler
   */
  registerBuiltin(name: string, handler: HandlerFn): void {
    this.builtins.set(name, handler);
  }

  /**
   * Get a builtin handler by name
   */
  getBuiltin(name: string): HandlerFn | undefined {
    return this.builtins.get(name);
  }

  /**
   * List all registered builtin handler names
   */
  listBuiltins(): string[] {
    return Array.from(this.builtins.keys());
  }

  /**
   * Resolve a handler based on type and config.
   *
   * @throws {HandlerNotFoundError} if handler cannot be resolved
   */
  resolveHandler(handlerType: string, handlerConfig: unknown): HandlerFn {
    if (handlerType === 'builtin') {
      const config = handlerConfig as BuiltinHandlerConfig;
      const handler = this.getBuiltin(config.name);

      if (!handler) {
        throw new HandlerNotFoundError('builtin', config.name);
      }

      return handler;
    }

    // Future: add 'llm', 'graph', 'webhook', 'tool-call' handlers
    throw new HandlerNotFoundError(handlerType);
  }
}
