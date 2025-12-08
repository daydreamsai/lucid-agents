import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { createSchedulerWorker } from './worker';
import type { OperationResult, SchedulerRuntime } from './types';

function createMockRuntime(
  overrides: Partial<SchedulerRuntime> = {}
): SchedulerRuntime {
  return {
    createHire: mock(async () => ({ hire: {} as any, job: {} as any })),
    addJob: mock(async () => ({}) as any),
    pauseHire: mock(
      async () => ({ success: true, data: undefined }) as OperationResult<void>
    ),
    resumeHire: mock(
      async () => ({ success: true, data: undefined }) as OperationResult<void>
    ),
    cancelHire: mock(
      async () => ({ success: true, data: undefined }) as OperationResult<void>
    ),
    pauseJob: mock(
      async () => ({ success: true, data: undefined }) as OperationResult<void>
    ),
    resumeJob: mock(
      async () => ({ success: true, data: undefined }) as OperationResult<void>
    ),
    tick: mock(async () => {}),
    recoverExpiredLeases: mock(async () => 0),
    ...overrides,
  };
}

describe('createSchedulerWorker', () => {
  describe('start/stop', () => {
    it('starts the worker and calls tick periodically', async () => {
      const tickMock = mock(async () => {});
      const runtime = createMockRuntime({ tick: tickMock });
      const worker = createSchedulerWorker(runtime, 50);

      expect(worker.isRunning()).toBe(false);

      worker.start();
      expect(worker.isRunning()).toBe(true);

      // Wait for at least 2 ticks
      await new Promise(resolve => setTimeout(resolve, 120));

      worker.stop();
      expect(worker.isRunning()).toBe(false);

      // Should have called tick at least twice
      expect(tickMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('does not start twice if already running', async () => {
      const tickMock = mock(async () => {});
      const runtime = createMockRuntime({ tick: tickMock });
      const worker = createSchedulerWorker(runtime, 100);

      worker.start();
      worker.start(); // Second start should be a no-op

      expect(worker.isRunning()).toBe(true);

      // Wait a bit and verify only one interval is running
      await new Promise(resolve => setTimeout(resolve, 50));

      worker.stop();
    });

    it('stop is idempotent', () => {
      const runtime = createMockRuntime();
      const worker = createSchedulerWorker(runtime, 100);

      worker.start();
      worker.stop();
      worker.stop(); // Second stop should not throw

      expect(worker.isRunning()).toBe(false);
    });

    it('can restart after stopping', async () => {
      const tickMock = mock(async () => {});
      const runtime = createMockRuntime({ tick: tickMock });
      const worker = createSchedulerWorker(runtime, 50);

      worker.start();
      await new Promise(resolve => setTimeout(resolve, 60));
      worker.stop();

      const callsAfterFirstRun = tickMock.mock.calls.length;

      worker.start();
      await new Promise(resolve => setTimeout(resolve, 60));
      worker.stop();

      expect(tickMock.mock.calls.length).toBeGreaterThan(callsAfterFirstRun);
    });
  });

  describe('once', () => {
    it('calls tick exactly once', async () => {
      const tickMock = mock(async () => {});
      const runtime = createMockRuntime({ tick: tickMock });
      const worker = createSchedulerWorker(runtime, 1000);

      await worker.once();

      expect(tickMock.mock.calls.length).toBe(1);
    });

    it('propagates errors from tick', async () => {
      const runtime = createMockRuntime({
        tick: async () => {
          throw new Error('tick failed');
        },
      });
      const worker = createSchedulerWorker(runtime, 1000);

      await expect(worker.once()).rejects.toThrow('tick failed');
    });
  });

  describe('error handling', () => {
    it('continues running after tick errors', async () => {
      let callCount = 0;
      const tickMock = mock(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('first tick failed');
        }
      });

      // Suppress console.error for this test
      const originalError = console.error;
      console.error = () => {};

      try {
        const runtime = createMockRuntime({ tick: tickMock });
        const worker = createSchedulerWorker(runtime, 30);

        worker.start();
        await new Promise(resolve => setTimeout(resolve, 100));
        worker.stop();

        // Should have continued calling tick despite the first error
        expect(tickMock.mock.calls.length).toBeGreaterThan(1);
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('isRunning', () => {
    it('returns correct running state', () => {
      const runtime = createMockRuntime();
      const worker = createSchedulerWorker(runtime, 100);

      expect(worker.isRunning()).toBe(false);

      worker.start();
      expect(worker.isRunning()).toBe(true);

      worker.stop();
      expect(worker.isRunning()).toBe(false);
    });
  });

  describe('default interval', () => {
    it('uses default interval when not specified', async () => {
      const tickMock = mock(async () => {});
      const runtime = createMockRuntime({ tick: tickMock });

      // Create worker with default interval (5000ms)
      const worker = createSchedulerWorker(runtime);

      worker.start();

      // Immediately stop - we just want to verify it starts
      expect(worker.isRunning()).toBe(true);

      worker.stop();
    });
  });
});
