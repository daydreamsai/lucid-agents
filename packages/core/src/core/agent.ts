import type { AgentConfig, EntrypointDef } from '@lucid-agents/types/core';
import { z } from 'zod';

export class AgentCore {
  private entrypoints = new Map<string, EntrypointDef>();

  constructor(public readonly config: AgentConfig) {}

  addEntrypoint<
    TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
    TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  >(entrypoint: EntrypointDef<TInput, TOutput>): void {
    if (!entrypoint.key || typeof entrypoint.key !== 'string') {
      throw new Error('Entrypoint must include a non-empty string key');
    }
    this.entrypoints.set(entrypoint.key, entrypoint);
  }

  getEntrypoint(key: string): EntrypointDef | undefined {
    return this.entrypoints.get(key);
  }

  listEntrypoints(): EntrypointDef[] {
    return Array.from(this.entrypoints.values());
  }
}

export function createAgentCore(config: AgentConfig): AgentCore {
  return new AgentCore(config);
}
