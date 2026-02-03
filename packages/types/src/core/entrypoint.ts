import type { Network } from './network';
import { z } from 'zod';

import type { EntrypointPrice } from '../payments';
import type { StreamPushEnvelope, StreamResult } from '../http';
import type { AgentContext, Usage } from './context';

/**
 * Handler function for non-streaming entrypoints.
 * Uses Omit to override the base AgentContext's input property with the typed input.
 */
export type EntrypointHandler<
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
> = (
  ctx: Omit<AgentContext, 'input'> & {
    input: TInput extends z.ZodTypeAny ? z.infer<TInput> : unknown;
  }
) => Promise<{
  output: TOutput extends z.ZodTypeAny ? z.infer<TOutput> : unknown;
  usage?: Usage;
  model?: string;
}>;

/**
 * Handler function for streaming entrypoints.
 * Uses Omit to override the base AgentContext's input property with the typed input.
 *
 * Note: This type references HTTP-specific stream types (SSE envelopes). For protocol-agnostic entrypoints,
 * use EntrypointHandler instead.
 */
export type EntrypointStreamHandler<
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
> = (
  ctx: Omit<AgentContext, 'input'> & {
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
