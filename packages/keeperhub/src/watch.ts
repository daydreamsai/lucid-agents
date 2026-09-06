import type { EntrypointDef } from '@lucid-agents/types/core';
import type { StreamPushEnvelope } from '@lucid-agents/types/http';
import { z } from 'zod';

import { referenceSchema } from './entrypoints';
import { LandedError } from './errors';
import type { KeeperHubRuntime } from './extension';
import type { LandedRecord, StageEntry } from './log';

const watchInputSchema = z.object({ reference: referenceSchema });

export interface WatchEntrypointOptions {
  /** Default "watch". */
  key?: string | undefined;
  /** Stop following after this long. Default 180 s. */
  timeoutMs?: number | undefined;
}

/**
 * Free streaming entrypoint: follow a reference stage by stage over SSE.
 * Existing stages are replayed first, then live ones until the execution finishes.
 * Streams are free on purpose: Lucid settles a priced stream on admission, not on outcome,
 * so the paid contract lives on the invoke entrypoint only.
 */
export function keeperhubWatchEntrypoint(
  options: WatchEntrypointOptions = {}
): EntrypointDef<typeof watchInputSchema, undefined> {
  const key = options.key ?? 'watch';
  const timeoutMs = options.timeoutMs ?? 180_000;
  return {
    key,
    description:
      'Follow a reference live: each stage (policy, dry run, broadcast, receipt) as it happens, then the final record. Free.',
    input: watchInputSchema,
    stream: async (ctx, emit) => {
      const keeperhub = runtimeOf(ctx.runtime);
      const reference = ctx.input.reference;
      const record = keeperhub.log.get(reference);
      if (!record) {
        await emit({
          kind: 'error',
          code: 'not_found',
          message: `no execution for reference ${reference}`,
          retryable: false,
        });
        return {
          status: 'failed',
          error: {
            code: 'not_found',
            message: `no execution for reference ${reference}`,
          },
        };
      }

      for (const entry of record.stages) {
        await emit(stageEnvelope(entry));
      }
      if (record.outcome) {
        await emit(finishedEnvelope(record));
        return { output: summary(record), status: 'succeeded' };
      }

      let chain: Promise<void> = Promise.resolve();
      const enqueue = (envelope: StreamPushEnvelope) => {
        chain = chain.then(() => emit(envelope)).catch(() => undefined);
      };
      await new Promise<void>(resolve => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          unsubscribe();
          ctx.signal.removeEventListener('abort', finish);
          resolve();
        };
        const timer = setTimeout(() => {
          enqueue({
            kind: 'control',
            control: 'timeout',
            payload: { reference, timeoutMs },
          });
          finish();
        }, timeoutMs);
        const unsubscribe = keeperhub.log.subscribe(reference, event => {
          if (event.type === 'stage') {
            enqueue(stageEnvelope(event.entry));
          } else {
            enqueue(finishedEnvelope(event.record));
            finish();
          }
        });
        ctx.signal.addEventListener('abort', finish);
      });
      await chain;

      const final = keeperhub.log.get(reference) ?? record;
      return {
        output: summary(final),
        status: final.outcome ? 'succeeded' : 'cancelled',
      };
    },
  };
}

function stageEnvelope(entry: StageEntry): StreamPushEnvelope {
  return {
    kind: 'control',
    control: 'stage',
    payload: entry.detail
      ? { stage: entry.stage, at: entry.at, detail: entry.detail }
      : { stage: entry.stage, at: entry.at },
  };
}

function finishedEnvelope(record: LandedRecord): StreamPushEnvelope {
  return { kind: 'control', control: 'finished', payload: summary(record) };
}

function summary(record: LandedRecord): Record<string, unknown> {
  return {
    reference: record.reference,
    outcome: record.outcome ?? null,
    executionId: record.executionId ?? null,
    transactionHash: record.transactionHash ?? null,
    transactionLink: record.transactionLink ?? null,
    sponsored: record.sponsored ?? null,
    replayed: record.replayed ?? null,
    error: record.error ?? null,
    stages: record.stages.length,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt ?? null,
  };
}

function runtimeOf(runtime: unknown): KeeperHubRuntime {
  const slice = (runtime as { keeperhub?: KeeperHubRuntime } | null)?.keeperhub;
  if (!slice) {
    throw new LandedError(
      'not_installed',
      'keeperhub() extension is not installed on this agent'
    );
  }
  return slice;
}
