import type {
  AgentConfig,
  AgentContext,
  Usage,
} from '@lucid-agents/types/core';
import { z } from 'zod';

import type { EntrypointDef, StreamResult } from '../http/types';

export type InvokeContext = {
  signal: AbortSignal;
  headers: Headers;
  runId?: string;
};

export type StreamContext = InvokeContext;

export type InvokeResult = {
  output: unknown;
  usage?: Usage;
  model?: string;
};

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

  resolveManifest(origin: string, basePath: string = '') {
    const originBase = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const normalizedBasePath = basePath
      ? basePath.startsWith('/')
        ? basePath
        : `/${basePath}`
      : '';
    const baseUrl = `${originBase}${normalizedBasePath}`;

    return {
      name: this.config.meta.name,
      version: this.config.meta.version,
      description: this.config.meta.description,
      icon: this.config.meta.icon,
      entrypoints: this.listEntrypoints().map(entrypoint => {
        const supportsStreaming = Boolean(
          entrypoint.stream ?? entrypoint.streaming
        );

        return {
          key: entrypoint.key,
          description: entrypoint.description,
          url: `${baseUrl}/entrypoints/${entrypoint.key}/invoke`,
          streamUrl: supportsStreaming
            ? `${baseUrl}/entrypoints/${entrypoint.key}/stream`
            : undefined,
          input: toJsonSchema(entrypoint.input),
          output: toJsonSchema(entrypoint.output),
          price: entrypoint.price,
          network: entrypoint.network,
        };
      }),
    };
  }

  async invoke(
    key: string,
    input: unknown,
    ctx: InvokeContext
  ): Promise<InvokeResult> {
    const entrypoint = this.getEntrypointOrThrow(key);
    const resolvedInput = this.parseInput(entrypoint, input);
    const handler = entrypoint.handler;
    if (!handler) {
      throw new Error(`Entrypoint "${key}" has no handler`);
    }
    const runContext: AgentContext = {
      key: entrypoint.key,
      input: resolvedInput,
      signal: ctx.signal,
      headers: ctx.headers,
      runId: ctx.runId,
    };
    const result = await handler(runContext);
    const output = this.parseOutput(entrypoint, result.output);
    return {
      output,
      usage: result.usage,
      model: result.model,
    };
  }

  async stream(
    key: string,
    input: unknown,
    emit: Parameters<NonNullable<EntrypointDef['stream']>>[1],
    ctx: StreamContext
  ): Promise<StreamResult> {
    const entrypoint = this.getEntrypointOrThrow(key);
    if (!entrypoint.stream) {
      throw new Error(`Entrypoint "${key}" does not support streaming`);
    }
    const resolvedInput = this.parseInput(entrypoint, input);
    const runContext: AgentContext = {
      key: entrypoint.key,
      input: resolvedInput,
      signal: ctx.signal,
      headers: ctx.headers,
      runId: ctx.runId,
    };
    return entrypoint.stream(runContext, emit);
  }

  private parseInput(entrypoint: EntrypointDef, value: unknown): unknown {
    const schema = entrypoint.input;
    if (!schema) return value;
    if (!isZodSchema(schema)) return value;
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new ZodValidationError('input', parsed.error.issues);
    }
    return parsed.data;
  }

  private parseOutput(entrypoint: EntrypointDef, value: unknown): unknown {
    const schema = entrypoint.output;
    if (!schema) return value;
    if (!isZodSchema(schema)) return value;
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new ZodValidationError('output', parsed.error.issues);
    }
    return parsed.data;
  }

  private getEntrypointOrThrow(key: string): EntrypointDef {
    const entrypoint = this.getEntrypoint(key);
    if (!entrypoint) {
      throw new Error(`Entrypoint "${key}" not found`);
    }
    return entrypoint;
  }
}

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

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return Boolean(value && typeof value === 'object' && 'safeParse' in value);
}

function toJsonSchema(schema: z.ZodTypeAny | undefined) {
  if (!schema) return undefined;
  try {
    return z.toJSONSchema(schema);
  } catch {
    return undefined;
  }
}

export function createAgentCore(config: AgentConfig): AgentCore {
  return new AgentCore(config);
}
