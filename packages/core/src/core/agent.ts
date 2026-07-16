import type {
  AgentConfig,
  AgentCore,
  EntrypointDef,
} from '@lucid-agents/types/core';
import type { z } from 'zod';

type EntrypointLifecycle = {
  beforeAdd?: (entrypoint: EntrypointDef) => void;
  afterAdd?: (entrypoint: EntrypointDef) => void;
};

/** Internal mutation controller. Only its read-only `agent` view is public. */
export type AgentCoreController = {
  agent: AgentCore;
  registerEntrypoint: <
    TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
    TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
    TRuntime extends object = object,
  >(
    entrypoint: EntrypointDef<TInput, TOutput, TRuntime>
  ) => void;
  configureEntrypointLifecycle: (hooks: EntrypointLifecycle) => void;
};

export function createAgentCore(config: AgentConfig): AgentCoreController {
  const entrypoints = new Map<string, EntrypointDef>();
  let lifecycle: EntrypointLifecycle = {};

  const agent: AgentCore = {
    config,
    getEntrypoint: key => entrypoints.get(key),
    listEntrypoints: () => [...entrypoints.values()],
  };

  return {
    agent,
    registerEntrypoint(entrypoint) {
      if (!entrypoint.key || typeof entrypoint.key !== 'string') {
        throw new Error('Entrypoint must include a non-empty string key');
      }
      if (entrypoints.has(entrypoint.key)) {
        throw new Error(`Entrypoint "${entrypoint.key}" is already registered`);
      }
      const stored = entrypoint as unknown as EntrypointDef;
      lifecycle.beforeAdd?.(stored);
      entrypoints.set(entrypoint.key, stored);
      lifecycle.afterAdd?.(stored);
    },
    configureEntrypointLifecycle(hooks) {
      lifecycle = hooks;
    },
  };
}
