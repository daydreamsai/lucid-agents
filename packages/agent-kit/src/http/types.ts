import type { Network } from 'x402/types';
import type { z } from 'zod';

import type { AgentContext, Usage } from '../core/types';

export type StreamEnvelopeBase = {
  runId?: string;
  sequence?: number;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export type StreamRunStartEnvelope = StreamEnvelopeBase & {
  kind: 'run-start';
  runId: string;
};

export type StreamTextEnvelope = StreamEnvelopeBase & {
  kind: 'text';
  text: string;
  mime?: string;
  role?: string;
};

export type StreamDeltaEnvelope = StreamEnvelopeBase & {
  kind: 'delta';
  delta: string;
  mime?: string;
  final?: boolean;
  role?: string;
};

export type StreamAssetInlineTransfer = {
  transfer: 'inline';
  data: string;
};

export type StreamAssetExternalTransfer = {
  transfer: 'external';
  href: string;
  expiresAt?: string;
};

export type StreamAssetEnvelope = StreamEnvelopeBase & {
  kind: 'asset';
  assetId: string;
  mime: string;
  name?: string;
  sizeBytes?: number;
} & (StreamAssetInlineTransfer | StreamAssetExternalTransfer);

export type StreamControlEnvelope = StreamEnvelopeBase & {
  kind: 'control';
  control: string;
  payload?: unknown;
};

export type StreamErrorEnvelope = StreamEnvelopeBase & {
  kind: 'error';
  code: string;
  message: string;
  retryable?: boolean;
};

export type StreamRunEndEnvelope = StreamEnvelopeBase & {
  kind: 'run-end';
  runId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  output?: unknown;
  usage?: Usage;
  model?: string;
  error?: { code: string; message?: string };
};

export type StreamEnvelope =
  | StreamRunStartEnvelope
  | StreamTextEnvelope
  | StreamDeltaEnvelope
  | StreamAssetEnvelope
  | StreamControlEnvelope
  | StreamErrorEnvelope
  | StreamRunEndEnvelope;

export type StreamPushEnvelope = Exclude<
  StreamEnvelope,
  StreamRunStartEnvelope | StreamRunEndEnvelope
>;

export type StreamResult = {
  output?: unknown;
  usage?: Usage;
  model?: string;
  status?: 'succeeded' | 'failed' | 'cancelled';
  error?: { code: string; message?: string };
  metadata?: Record<string, unknown>;
};

export type EntrypointHandler<
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
> = (
  ctx: AgentContext & {
    input: TInput extends z.ZodTypeAny ? z.infer<TInput> : unknown;
  }
) => Promise<{
  output: TOutput extends z.ZodTypeAny ? z.infer<TOutput> : unknown;
  usage?: Usage;
  model?: string;
}>;

export type EntrypointStreamHandler<
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
> = (
  ctx: AgentContext & {
    input: TInput extends z.ZodTypeAny ? z.infer<TInput> : unknown;
  },
  emit: (chunk: StreamPushEnvelope) => Promise<void> | void
) => Promise<StreamResult>;

export type EntrypointDef<
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
> = {
  key: string;
  description?: string;
  input?: TInput;
  output?: TOutput;
  streaming?: boolean;
  price?: string | { invoke?: string; stream?: string };
  network?: Network;
  handler?: EntrypointHandler<TInput, TOutput>;
  stream?: EntrypointStreamHandler<TInput>;
  metadata?: Record<string, unknown>;
};
