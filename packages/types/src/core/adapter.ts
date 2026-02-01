import { z } from 'zod';

import type { EntrypointDef } from './entrypoint';

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
> = {
  app: TApp;
  runtime: TRuntime;
  agent: TAgent;
  addEntrypoint: <
    TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
    TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  >(
    def: EntrypointDef<TInput, TOutput>
  ) => void;
};
