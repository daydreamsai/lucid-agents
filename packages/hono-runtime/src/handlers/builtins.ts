import type { HandlerFn } from './types';

/**
 * Echo handler - returns the input as output
 */
export const echoHandler: HandlerFn = async (ctx) => {
  return {
    output: ctx.input,
    usage: { total_tokens: 0 },
  };
};

/**
 * Passthrough handler - same as echo, just a different name
 */
export const passthroughHandler: HandlerFn = async (ctx) => {
  return {
    output: ctx.input,
    usage: { total_tokens: 0 },
  };
};

/**
 * Default builtin handlers
 */
export const builtinHandlers: Record<string, HandlerFn> = {
  echo: echoHandler,
  passthrough: passthroughHandler,
};
