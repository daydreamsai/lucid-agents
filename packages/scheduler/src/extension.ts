import type { BuildContext, Extension } from '@lucid-agents/types/core';
import type { SchedulerRuntime } from '@lucid-agents/types/scheduler';
import { createMemoryStore } from './store/memory';
import { createSchedulerRuntime } from './runtime';
import type { SchedulerStore } from '@lucid-agents/types/scheduler';
import type { A2ARuntime } from '@lucid-agents/types/a2a';
import type { PaymentsRuntime } from '@lucid-agents/types/payments';

type SchedulerDependencies = {
  a2a: A2ARuntime;
  payments?: PaymentsRuntime;
};

export type SchedulerExtensionOptions = {
  store?: SchedulerStore;
  clock?: () => number;
  defaultMaxRetries?: number;
  leaseMs?: number;
  maxDueBatch?: number;
  agentCardTtlMs?: number;
  defaultConcurrency?: number;
};

export function scheduler(
  options?: SchedulerExtensionOptions
): Extension<{ scheduler: SchedulerRuntime }, SchedulerDependencies> {
  let store: SchedulerStore | undefined;
  return {
    name: 'scheduler',
    requires: ['a2a'],
    after: ['payments'],
    build(ctx: BuildContext<SchedulerDependencies>): {
      scheduler: SchedulerRuntime;
    } {
      store = options?.store ?? createMemoryStore();
      const schedulerRuntime = createSchedulerRuntime({
        runtime: ctx.runtime,
        store,
        clock: options?.clock,
        defaultMaxRetries: options?.defaultMaxRetries,
        leaseMs: options?.leaseMs,
        maxDueBatch: options?.maxDueBatch,
        agentCardTtlMs: options?.agentCardTtlMs,
        defaultConcurrency: options?.defaultConcurrency,
      });
      return { scheduler: schedulerRuntime };
    },
    async dispose() {
      await store?.close?.();
    },
  };
}
