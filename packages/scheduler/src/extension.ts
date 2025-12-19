import type {
  AgentRuntime,
  BuildContext,
  Extension,
} from '@lucid-agents/types/core';
import type { SchedulerRuntime } from '@lucid-agents/types/scheduler';
import { createMemoryStore } from './store/memory';
import { createSchedulerRuntime } from './runtime';
import type { SchedulerStore } from '@lucid-agents/types/scheduler';

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
): Extension<{ scheduler: SchedulerRuntime }> {
  return {
    name: 'scheduler',
    build(_ctx: BuildContext): { scheduler: SchedulerRuntime } {
      // Return placeholder - will be replaced in onBuild
      return {
        scheduler: {} as SchedulerRuntime,
      };
    },
    async onBuild(runtime: AgentRuntime) {
      if (!runtime.a2a) {
        throw new Error('A2A runtime missing');
      }

      if (!runtime.payments) {
        throw new Error('Payments runtime missing');
      }

      const store = options?.store ?? createMemoryStore();

      const schedulerRuntime = createSchedulerRuntime({
        runtime,
        store,
        clock: options?.clock,
        defaultMaxRetries: options?.defaultMaxRetries,
        leaseMs: options?.leaseMs,
        maxDueBatch: options?.maxDueBatch,
        agentCardTtlMs: options?.agentCardTtlMs,
        defaultConcurrency: options?.defaultConcurrency,
      });

      runtime.scheduler = schedulerRuntime;
    },
  };
}
