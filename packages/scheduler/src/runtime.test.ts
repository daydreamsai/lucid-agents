import { describe, it, expect } from 'bun:test';
import { createSchedulerRuntime } from './runtime';
import { createMemoryStore } from './store/memory';
import type {
  InvokeArgs,
  Job,
  OperationResult,
  SchedulerStore,
  WalletRef,
} from './types';
import type { AgentCardWithEntrypoints } from '@lucid-agents/types';

function expectError(result: OperationResult, substring: string): void {
  expect(result.success).toBe(false);
  expect((result as { success: false; error: string }).error).toContain(
    substring
  );
}

const mockAgentCard: AgentCardWithEntrypoints = {
  name: 'Test Agent',
  url: 'https://example.com/agent',
  version: '1.0.0',
  capabilities: {},
  entrypoints: {
    default: {
      description: 'Default entrypoint',
      streaming: false,
    },
    secondary: {
      description: 'Secondary entrypoint',
      streaming: false,
    },
  },
};

const mockWallet: WalletRef = {
  id: 'wallet-1',
  address: '0x1234567890abcdef1234567890abcdef12345678',
  chain: 'base',
  chainType: 'ethereum',
  provider: 'local',
};

function createTestRuntime(
  overrides: {
    store?: SchedulerStore;
    invoke?: (args: InvokeArgs) => Promise<void>;
    clock?: () => number;
    fetchAgentCard?: () => Promise<AgentCardWithEntrypoints>;
  } = {}
) {
  const store = overrides.store ?? createMemoryStore();
  const invoke = overrides.invoke ?? (async () => {});
  const clock = overrides.clock ?? (() => Date.now());
  const fetchAgentCard =
    overrides.fetchAgentCard ?? (async () => mockAgentCard);

  const runtime = createSchedulerRuntime({
    store,
    invoke,
    clock,
    fetchAgentCard,
    leaseMs: 30_000,
    defaultMaxRetries: 3,
  });

  return { runtime, store, invoke, clock };
}

describe('createSchedulerRuntime', () => {
  describe('createHire', () => {
    it('creates a hire and job successfully', async () => {
      const { runtime, store } = createTestRuntime();

      const result = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() + 10000 },
        jobInput: { foo: 'bar' },
      });

      expect(result.hire.id).toBeDefined();
      expect(result.hire.status).toBe('active');
      expect(result.hire.wallet).toEqual(mockWallet);
      expect(result.job.id).toBeDefined();
      expect(result.job.hireId).toBe(result.hire.id);
      expect(result.job.status).toBe('pending');
      expect(result.job.input).toEqual({ foo: 'bar' });

      const storedHire = await store.getHire(result.hire.id);
      const storedJob = await store.getJob(result.job.id);
      expect(storedHire).toBeDefined();
      expect(storedJob).toBeDefined();
    });

    it('throws when entrypoint does not exist', async () => {
      const { runtime } = createTestRuntime();

      await expect(
        runtime.createHire({
          agentCardUrl: 'https://example.com/agent',
          wallet: mockWallet,
          entrypointKey: 'nonexistent',
          schedule: { kind: 'once', at: Date.now() },
          jobInput: {},
        })
      ).rejects.toThrow('Entrypoint nonexistent not found');
    });

    it('throws when cron schedule is used', async () => {
      const { runtime } = createTestRuntime();

      await expect(
        runtime.createHire({
          agentCardUrl: 'https://example.com/agent',
          wallet: mockWallet,
          entrypointKey: 'default',
          schedule: { kind: 'cron', expr: '0 * * * *' },
          jobInput: {},
        })
      ).rejects.toThrow('Cron schedules are not supported yet');
    });

    it('sets nextRunAt correctly for once schedule', async () => {
      const now = 1000000;
      const { runtime } = createTestRuntime({ clock: () => now });

      const scheduledTime = now + 50000;
      const result = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: scheduledTime },
        jobInput: {},
      });

      expect(result.job.nextRunAt).toBe(scheduledTime);
    });

    it('sets nextRunAt to now for interval schedule', async () => {
      const now = 1000000;
      const { runtime } = createTestRuntime({ clock: () => now });

      const result = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'interval', everyMs: 60000 },
        jobInput: {},
      });

      expect(result.job.nextRunAt).toBe(now);
    });

    it('respects custom maxRetries', async () => {
      const { runtime } = createTestRuntime();

      const result = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
        maxRetries: 10,
      });

      expect(result.job.maxRetries).toBe(10);
    });

    it('stores metadata on hire', async () => {
      const { runtime } = createTestRuntime();

      const result = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
        metadata: { userId: 'user-123', source: 'api' },
      });

      expect(result.hire.metadata).toEqual({
        userId: 'user-123',
        source: 'api',
      });
    });
  });

  describe('addJob', () => {
    it('adds a job to an existing hire', async () => {
      const { runtime, store } = createTestRuntime();

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
      });

      const newJob = await runtime.addJob({
        hireId: hire.id,
        entrypointKey: 'secondary',
        schedule: { kind: 'interval', everyMs: 30000 },
        jobInput: { action: 'ping' },
      });

      expect(newJob.hireId).toBe(hire.id);
      expect(newJob.entrypointKey).toBe('secondary');
      expect(newJob.input).toEqual({ action: 'ping' });

      const storedJob = await store.getJob(newJob.id);
      expect(storedJob).toBeDefined();
    });

    it('throws when hire does not exist', async () => {
      const { runtime } = createTestRuntime();

      await expect(
        runtime.addJob({
          hireId: 'nonexistent-hire',
          entrypointKey: 'default',
          schedule: { kind: 'once', at: Date.now() },
          jobInput: {},
        })
      ).rejects.toThrow('Hire nonexistent-hire not found');
    });

    it('throws when hire is canceled', async () => {
      const { runtime } = createTestRuntime();

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
      });

      await runtime.cancelHire(hire.id);

      await expect(
        runtime.addJob({
          hireId: hire.id,
          entrypointKey: 'default',
          schedule: { kind: 'once', at: Date.now() },
          jobInput: {},
        })
      ).rejects.toThrow(`Hire ${hire.id} is canceled`);
    });

    it('throws when cron schedule is used', async () => {
      const { runtime } = createTestRuntime();

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
      });

      await expect(
        runtime.addJob({
          hireId: hire.id,
          entrypointKey: 'default',
          schedule: { kind: 'cron', expr: '0 * * * *' },
          jobInput: {},
        })
      ).rejects.toThrow('Cron schedules are not supported yet');
    });
  });

  describe('pauseHire', () => {
    it('pauses an active hire', async () => {
      const { runtime, store } = createTestRuntime();

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
      });

      const result = await runtime.pauseHire(hire.id);

      expect(result.success).toBe(true);
      const updatedHire = await store.getHire(hire.id);
      expect(updatedHire?.status).toBe('paused');
    });

    it('returns error when hire not found', async () => {
      const { runtime } = createTestRuntime();

      const result = await runtime.pauseHire('nonexistent');

      expectError(result, 'not found');
    });

    it('returns error when hire is already paused', async () => {
      const { runtime } = createTestRuntime();

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
      });

      await runtime.pauseHire(hire.id);
      const result = await runtime.pauseHire(hire.id);

      expectError(result, 'already paused');
    });

    it('returns error when hire is canceled', async () => {
      const { runtime } = createTestRuntime();

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
      });

      await runtime.cancelHire(hire.id);
      const result = await runtime.pauseHire(hire.id);

      expectError(result, 'canceled');
    });
  });

  describe('resumeHire', () => {
    it('resumes a paused hire', async () => {
      const { runtime, store } = createTestRuntime();

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
      });

      await runtime.pauseHire(hire.id);
      const result = await runtime.resumeHire(hire.id);

      expect(result.success).toBe(true);
      const updatedHire = await store.getHire(hire.id);
      expect(updatedHire?.status).toBe('active');
    });

    it('returns error when hire not found', async () => {
      const { runtime } = createTestRuntime();

      const result = await runtime.resumeHire('nonexistent');

      expect(result.success).toBe(false);
    });

    it('returns error when hire is already active', async () => {
      const { runtime } = createTestRuntime();

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
      });

      const result = await runtime.resumeHire(hire.id);

      expectError(result, 'already active');
    });

    it('returns error when hire is canceled', async () => {
      const { runtime } = createTestRuntime();

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
      });

      await runtime.cancelHire(hire.id);
      const result = await runtime.resumeHire(hire.id);

      expectError(result, 'cannot be resumed');
    });
  });

  describe('cancelHire', () => {
    it('cancels an active hire', async () => {
      const { runtime, store } = createTestRuntime();

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
      });

      const result = await runtime.cancelHire(hire.id);

      expect(result.success).toBe(true);
      const updatedHire = await store.getHire(hire.id);
      expect(updatedHire?.status).toBe('canceled');
    });

    it('returns error when hire not found', async () => {
      const { runtime } = createTestRuntime();

      const result = await runtime.cancelHire('nonexistent');

      expect(result.success).toBe(false);
    });

    it('returns error when hire is already canceled', async () => {
      const { runtime } = createTestRuntime();

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: {},
      });

      await runtime.cancelHire(hire.id);
      const result = await runtime.cancelHire(hire.id);

      expectError(result, 'already canceled');
    });
  });

  describe('pauseJob', () => {
    it('pauses a pending job', async () => {
      const { runtime, store } = createTestRuntime();

      const { job } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() + 10000 },
        jobInput: {},
      });

      const result = await runtime.pauseJob(job.id);

      expect(result.success).toBe(true);
      const updatedJob = await store.getJob(job.id);
      expect(updatedJob?.status).toBe('paused');
    });

    it('returns error when job not found', async () => {
      const { runtime } = createTestRuntime();

      const result = await runtime.pauseJob('nonexistent');

      expect(result.success).toBe(false);
    });

    it('returns error when job is already paused', async () => {
      const { runtime } = createTestRuntime();

      const { job } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: Date.now() + 10000 },
        jobInput: {},
      });

      await runtime.pauseJob(job.id);
      const result = await runtime.pauseJob(job.id);

      expectError(result, 'already paused');
    });
  });

  describe('resumeJob', () => {
    it('resumes a paused job', async () => {
      const now = 1000000;
      const { runtime, store } = createTestRuntime({ clock: () => now });

      const { job } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: now + 10000 },
        jobInput: {},
      });

      await runtime.pauseJob(job.id);
      const result = await runtime.resumeJob(job.id);

      expect(result.success).toBe(true);
      const updatedJob = await store.getJob(job.id);
      expect(updatedJob?.status).toBe('pending');
      expect(updatedJob?.nextRunAt).toBe(now);
    });

    it('resumes job with custom nextRunAt', async () => {
      const now = 1000000;
      const { runtime, store } = createTestRuntime({ clock: () => now });

      const { job } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: now + 10000 },
        jobInput: {},
      });

      await runtime.pauseJob(job.id);
      const customNextRunAt = now + 5000;
      const result = await runtime.resumeJob(job.id, customNextRunAt);

      expect(result.success).toBe(true);
      const updatedJob = await store.getJob(job.id);
      expect(updatedJob?.nextRunAt).toBe(customNextRunAt);
    });

    it('returns error when job not found', async () => {
      const { runtime } = createTestRuntime();

      const result = await runtime.resumeJob('nonexistent');

      expect(result.success).toBe(false);
    });

    it('returns error when job is completed', async () => {
      const now = 1000000;
      const { runtime, store } = createTestRuntime({ clock: () => now });

      const { job } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: now },
        jobInput: {},
      });

      // Run tick to complete the job
      await runtime.tick();

      const result = await runtime.resumeJob(job.id);

      expectError(result, 'completed');
    });
  });

  describe('tick', () => {
    it('processes due jobs', async () => {
      const now = 1000000;
      const invocations: InvokeArgs[] = [];
      const { runtime, store } = createTestRuntime({
        clock: () => now,
        invoke: async args => {
          invocations.push(args);
        },
      });

      await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: now - 1000 },
        jobInput: { task: 'test' },
      });

      await runtime.tick();

      expect(invocations).toHaveLength(1);
      expect(invocations[0].input).toEqual({ task: 'test' });
      expect(invocations[0].entrypointKey).toBe('default');
    });

    it('marks once jobs as completed after execution', async () => {
      const now = 1000000;
      const { runtime, store } = createTestRuntime({ clock: () => now });

      const { job } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: now },
        jobInput: {},
      });

      await runtime.tick();

      const updatedJob = await store.getJob(job.id);
      expect(updatedJob?.status).toBe('completed');
    });

    it('reschedules interval jobs after execution', async () => {
      const now = 1000000;
      const { runtime, store } = createTestRuntime({ clock: () => now });

      const { job } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'interval', everyMs: 60000 },
        jobInput: {},
      });

      await runtime.tick();

      const updatedJob = await store.getJob(job.id);
      expect(updatedJob?.status).toBe('pending');
      expect(updatedJob?.nextRunAt).toBe(now + 60000);
    });

    it('skips jobs for paused hires', async () => {
      const now = 1000000;
      const invocations: InvokeArgs[] = [];
      const { runtime } = createTestRuntime({
        clock: () => now,
        invoke: async args => {
          invocations.push(args);
        },
      });

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: now },
        jobInput: {},
      });

      await runtime.pauseHire(hire.id);
      await runtime.tick();

      expect(invocations).toHaveLength(0);
    });

    it('fails jobs for canceled hires', async () => {
      const now = 1000000;
      const { runtime, store } = createTestRuntime({ clock: () => now });

      const { hire, job } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: now },
        jobInput: {},
      });

      await runtime.cancelHire(hire.id);
      await runtime.tick();

      const updatedJob = await store.getJob(job.id);
      expect(updatedJob?.status).toBe('failed');
      expect(updatedJob?.lastError).toBe('hire canceled');
    });

    it('retries failed jobs with exponential backoff', async () => {
      const now = 1000000;
      let callCount = 0;
      const { runtime, store } = createTestRuntime({
        clock: () => now,
        invoke: async () => {
          callCount++;
          throw new Error('invoke failed');
        },
      });

      const { job } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: now },
        jobInput: {},
        maxRetries: 3,
      });

      await runtime.tick();

      const updatedJob = await store.getJob(job.id);
      expect(updatedJob?.status).toBe('pending');
      expect(updatedJob?.attempts).toBe(1);
      expect(updatedJob?.lastError).toBe('invoke failed');
      // nextRunAt should be now + backoff (with jitter)
      expect(updatedJob?.nextRunAt).toBeGreaterThan(now);
    });

    it('marks job as failed after max retries exceeded', async () => {
      const now = 1000000;
      const { runtime, store } = createTestRuntime({
        clock: () => now,
        invoke: async () => {
          throw new Error('always fails');
        },
      });

      const { job } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: now },
        jobInput: {},
        maxRetries: 0,
      });

      await runtime.tick();

      const updatedJob = await store.getJob(job.id);
      expect(updatedJob?.status).toBe('failed');
      expect(updatedJob?.attempts).toBe(1);
    });

    it('does not process future jobs', async () => {
      const now = 1000000;
      const invocations: InvokeArgs[] = [];
      const { runtime } = createTestRuntime({
        clock: () => now,
        invoke: async args => {
          invocations.push(args);
        },
      });

      await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: now + 10000 },
        jobInput: {},
      });

      await runtime.tick();

      expect(invocations).toHaveLength(0);
    });

    it('processes multiple jobs in parallel with concurrency limit', async () => {
      const now = 1000000;
      const executionOrder: string[] = [];
      const { runtime } = createTestRuntime({
        clock: () => now,
        invoke: async args => {
          executionOrder.push(args.jobId);
          await new Promise(resolve => setTimeout(resolve, 10));
        },
      });

      // Create multiple hires with jobs
      for (let i = 0; i < 10; i++) {
        await runtime.createHire({
          agentCardUrl: 'https://example.com/agent',
          wallet: mockWallet,
          entrypointKey: 'default',
          schedule: { kind: 'once', at: now },
          jobInput: { index: i },
        });
      }

      await runtime.tick({ concurrency: 5 });

      expect(executionOrder).toHaveLength(10);
    });
  });

  describe('recoverExpiredLeases', () => {
    it('recovers expired leased jobs', async () => {
      const now = 1000000;
      const baseStore = createMemoryStore();
      const expiredJobs: Job[] = [];

      // Create a proper store wrapper that preserves methods
      const storeWithExpiredLeases: SchedulerStore = {
        putHire: hire => baseStore.putHire(hire),
        getHire: id => baseStore.getHire(id),
        putJob: job => baseStore.putJob(job),
        getJob: id => baseStore.getJob(id),
        getDueJobs: (now, limit) => baseStore.getDueJobs(now, limit),
        claimJob: (jobId, workerId, leaseMs) =>
          baseStore.claimJob(jobId, workerId, leaseMs),
        getExpiredLeases: async () => expiredJobs,
      };

      const { runtime } = createTestRuntime({
        store: storeWithExpiredLeases,
        clock: () => now,
      });

      const { job } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'once', at: now },
        jobInput: {},
      });

      // Simulate an expired lease
      const expiredJob: Job = {
        ...job,
        status: 'leased',
        lease: { workerId: 'dead-worker', expiresAt: now - 1000 },
      };
      expiredJobs.push(expiredJob);

      const recovered = await runtime.recoverExpiredLeases();

      expect(recovered).toBe(1);
    });

    it('returns 0 when no expired leases', async () => {
      const baseStore = createMemoryStore();
      const storeWithExpiredLeases: SchedulerStore = {
        putHire: hire => baseStore.putHire(hire),
        getHire: id => baseStore.getHire(id),
        putJob: job => baseStore.putJob(job),
        getJob: id => baseStore.getJob(id),
        getDueJobs: (now, limit) => baseStore.getDueJobs(now, limit),
        claimJob: (jobId, workerId, leaseMs) =>
          baseStore.claimJob(jobId, workerId, leaseMs),
        getExpiredLeases: async () => [],
      };

      const { runtime } = createTestRuntime({ store: storeWithExpiredLeases });

      const recovered = await runtime.recoverExpiredLeases();

      expect(recovered).toBe(0);
    });

    it('returns 0 when store does not support getExpiredLeases', async () => {
      const { runtime } = createTestRuntime();

      const recovered = await runtime.recoverExpiredLeases();

      expect(recovered).toBe(0);
    });
  });

  describe('agent card caching', () => {
    it('caches agent card and reuses within TTL', async () => {
      let fetchCount = 0;
      const now = 1000000;
      const { runtime } = createTestRuntime({
        clock: () => now,
        fetchAgentCard: async () => {
          fetchCount++;
          return mockAgentCard;
        },
      });

      const { hire } = await runtime.createHire({
        agentCardUrl: 'https://example.com/agent',
        wallet: mockWallet,
        entrypointKey: 'default',
        schedule: { kind: 'interval', everyMs: 1000 },
        jobInput: {},
      });

      // Initial fetch during createHire
      expect(fetchCount).toBe(1);

      // Add another job - should not refetch because card is cached
      await runtime.addJob({
        hireId: hire.id,
        entrypointKey: 'secondary',
        schedule: { kind: 'once', at: now },
        jobInput: {},
      });

      expect(fetchCount).toBe(1);
    });
  });
});
