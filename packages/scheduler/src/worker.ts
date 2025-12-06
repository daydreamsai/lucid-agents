import type { SchedulerRuntime } from './types';

export function createSchedulerWorker(
  runtime: SchedulerRuntime,
  intervalMs = 5_000
) {
  let timer: ReturnType<typeof setInterval> | undefined;

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        runtime.tick().catch(error => {
          // Intentionally log and continue; worker should not crash on a single failure.
          console.error('[scheduler] tick failed', error);
        });
      }, intervalMs);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
    async once() {
      await runtime.tick();
    },
    isRunning() {
      return Boolean(timer);
    },
  };
}
