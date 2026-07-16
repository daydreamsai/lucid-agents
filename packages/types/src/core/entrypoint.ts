import type { Network } from './network';
import { z } from 'zod';

import type { EntrypointPrice } from '../payments';
import type { StreamPushEnvelope, StreamResult } from '../http';
import type { SIWxEntrypointConfig } from '../siwx';
import type { AgentContext, Usage } from './context';
import type { AgentRuntime } from './runtime';

/** Payment protocol used to protect a priced entrypoint. */
export type PaymentProtocol = 'x402' | 'mpp';

/**
 * Handler function for non-streaming entrypoints.
 * Uses Omit to override the base AgentContext's input property with the typed input.
 */
export type EntrypointHandler<
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TRuntime extends object = AgentRuntime,
> = (
  ctx: Omit<AgentContext<TRuntime>, 'input'> & {
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
  TRuntime extends object = AgentRuntime,
> = (
  ctx: Omit<AgentContext<TRuntime>, 'input'> & {
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
  TRuntime extends object = AgentRuntime,
> = {
  key: string;
  description?: string;
  input?: TInput;
  output?: TOutput;
  price?: EntrypointPrice;
  /** Required when both x402 and MPP extensions are installed. */
  paymentProtocol?: PaymentProtocol;
  network?: Network;
  handler?: EntrypointHandler<TInput, TOutput, TRuntime>;
  stream?: EntrypointStreamHandler<TInput, TRuntime>;
  metadata?: Record<string, unknown>;
  siwx?: SIWxEntrypointConfig;
};

/**
 * Entrypoints runtime type.
 * Returned by AgentRuntime.entrypoints.
 */
export type EntrypointsRuntime<Capabilities extends object = {}> = {
  add: <
    TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
    TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  >(
    def: EntrypointDef<TInput, TOutput, AgentRuntime<Capabilities>>
  ) => void;
  list: () => Array<{
    key: string;
    description?: string;
    streaming: boolean;
  }>;
  snapshot: () => EntrypointDef[];
};
