import type { Hire, Job } from '@lucid-agents/types/scheduler';
import { describe, expect, it } from 'bun:test';

import { createMemoryStore } from '../../store/memory';

const createMockHire = (overrides: Partial<Hire> = {}): Hire => ({
  id: `hire-${Math.random().toString(36).slice(2)}`,
  agent: {
    agentCardUrl: 'https://example.com/agent',
    card: {
      name: 'Test Agent',
      url: 'https://example.com/agent',
      version: '1.0.0',
      capabilities: {},
      entrypoints: {
        default: {
          description: 'Default entrypoint',
          streaming: false,
        },
      },
    },
    cachedAt: Date.now(),
  },
  wallet: {
    id: 'wallet-1',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    chain: 'base',
    chainType: 'ethereum',
    provider: 'local',
  },
  status: 'active',
  ...overrides,
});

const createMockJob = (overrides: Partial<Job> = {}): Job => ({
  id: `job-${Math.random().toString(36).slice(2)}`,
  hireId: 'hire-1',
  entrypointKey: 'default',
  input: { foo: 'bar' },
  schedule: { kind: 'once', at: Date.now() },
  nextRunAt: Date.now(),
  attempts: 0,
  maxRetries: 3,
  status: 'pending',
  ...overrides,
});

describe('createMemoryStore', () => {
  describe('putHire / getHire', () => {
    it('stores and retrieves a hire', async () => {
      const store = createMemoryStore();
      const hire = createMockHire({ id: 'test-hire-1' });

      await store.putHire(hire);
      const retrieved = await store.getHire('test-hire-1');

      expect(retrieved).toEqual(hire);
    });

    it('returns undefined for non-existent hire', async () => {
      const store = createMemoryStore();

      const retrieved = await store.getHire('nonexistent');

      expect(retrieved).toBeUndefined();
    });

    it('updates existing hire', async () => {
      const store = createMemoryStore();
      const hire = createMockHire({ id: 'test-hire-1', status: 'active' });

      await store.putHire(hire);
      await store.putHire({ ...hire, status: 'paused' });

      const retrieved = await store.getHire('test-hire-1');
      expect(retrieved?.status).toBe('paused');
    });

    it('returns a clone, not the original reference', async () => {
      const store = createMemoryStore();
      const hire = createMockHire({ id: 'test-hire-1' });

      await store.putHire(hire);
      const retrieved = await store.getHire('test-hire-1');

      expect(retrieved).not.toBe(hire);
      expect(retrieved).toEqual(hire);

      // Modifying retrieved should not affect stored
      if (retrieved) {
        retrieved.status = 'canceled';
      }
      const retrievedAgain = await store.getHire('test-hire-1');
      expect(retrievedAgain?.status).toBe('active');
    });
  });

  describe('putJob / getJob', () => {
    it('stores and retrieves a job', async () => {
      const store = createMemoryStore();
      const job = createMockJob({ id: 'test-job-1' });

      await store.putJob(job);
      const retrieved = await store.getJob('test-job-1');

      expect(retrieved).toEqual(job);
    });

    it('returns undefined for non-existent job', async () => {
      const store = createMemoryStore();

      const retrieved = await store.getJob('nonexistent');

      expect(retrieved).toBeUndefined();
    });

    it('updates existing job', async () => {
      const store = createMemoryStore();
      const job = createMockJob({ id: 'test-job-1', status: 'pending' });

      await store.putJob(job);
      await store.putJob({ ...job, status: 'completed' });

      const retrieved = await store.getJob('test-job-1');
      expect(retrieved?.status).toBe('completed');
    });

    it('returns a clone, not the original reference', async () => {
      const store = createMemoryStore();
      const job = createMockJob({ id: 'test-job-1' });

      await store.putJob(job);
      const retrieved = await store.getJob('test-job-1');

      expect(retrieved).not.toBe(job);
      expect(retrieved).toEqual(job);

      // Modifying retrieved should not affect stored
      if (retrieved) {
        retrieved.status = 'failed';
      }
      const retrievedAgain = await store.getJob('test-job-1');
      expect(retrievedAgain?.status).toBe('pending');
    });
  });

  describe('getDueJobs', () => {
    it('returns jobs that are due', async () => {
      const store = createMemoryStore();
      const now = Date.now();

      const dueJob = createMockJob({
        id: 'due-job',
        status: 'pending',
        nextRunAt: now - 1000,
      });
      const futureJob = createMockJob({
        id: 'future-job',
        status: 'pending',
        nextRunAt: now + 10000,
      });

      await store.putJob(dueJob);
      await store.putJob(futureJob);

      const due = await store.getDueJobs(now, 10);

      expect(due).toHaveLength(1);
      expect(due[0].id).toBe('due-job');
    });

    it('excludes non-pending jobs', async () => {
      const store = createMemoryStore();
      const now = Date.now();

      const pendingJob = createMockJob({
        id: 'pending-job',
        status: 'pending',
        nextRunAt: now - 1000,
      });
      const completedJob = createMockJob({
        id: 'completed-job',
        status: 'completed',
        nextRunAt: now - 1000,
      });
      const failedJob = createMockJob({
        id: 'failed-job',
        status: 'failed',
        nextRunAt: now - 1000,
      });
      const pausedJob = createMockJob({
        id: 'paused-job',
        status: 'paused',
        nextRunAt: now - 1000,
      });

      await store.putJob(pendingJob);
      await store.putJob(completedJob);
      await store.putJob(failedJob);
      await store.putJob(pausedJob);

      const due = await store.getDueJobs(now, 10);

      expect(due).toHaveLength(1);
      expect(due[0].id).toBe('pending-job');
    });

    it('excludes jobs with active leases', async () => {
      const store = createMemoryStore();
      const now = Date.now();

      const unleased = createMockJob({
        id: 'unleased-job',
        status: 'pending',
        nextRunAt: now - 1000,
      });
      const leasedActive = createMockJob({
        id: 'leased-active-job',
        status: 'pending',
        nextRunAt: now - 1000,
        lease: { workerId: 'worker-1', expiresAt: now + 10000 },
      });
      const leasedExpired = createMockJob({
        id: 'leased-expired-job',
        status: 'pending',
        nextRunAt: now - 1000,
        lease: { workerId: 'worker-1', expiresAt: now - 1000 },
      });

      await store.putJob(unleased);
      await store.putJob(leasedActive);
      await store.putJob(leasedExpired);

      const due = await store.getDueJobs(now, 10);

      expect(due).toHaveLength(2);
      const dueIds = due.map(j => j.id);
      expect(dueIds).toContain('unleased-job');
      expect(dueIds).toContain('leased-expired-job');
      expect(dueIds).not.toContain('leased-active-job');
    });

    it('respects the limit parameter', async () => {
      const store = createMemoryStore();
      const now = Date.now();

      for (let i = 0; i < 10; i++) {
        await store.putJob(
          createMockJob({
            id: `job-${i}`,
            status: 'pending',
            nextRunAt: now - (10 - i) * 1000, // Earlier jobs first
          })
        );
      }

      const due = await store.getDueJobs(now, 3);

      expect(due).toHaveLength(3);
    });

    it('sorts jobs by nextRunAt ascending', async () => {
      const store = createMemoryStore();
      const now = Date.now();

      await store.putJob(
        createMockJob({ id: 'job-c', status: 'pending', nextRunAt: now - 1000 })
      );
      await store.putJob(
        createMockJob({ id: 'job-a', status: 'pending', nextRunAt: now - 3000 })
      );
      await store.putJob(
        createMockJob({ id: 'job-b', status: 'pending', nextRunAt: now - 2000 })
      );

      const due = await store.getDueJobs(now, 10);

      expect(due.map(j => j.id)).toEqual(['job-a', 'job-b', 'job-c']);
    });

    it('returns clones of jobs', async () => {
      const store = createMemoryStore();
      const now = Date.now();
      const job = createMockJob({
        id: 'test-job',
        status: 'pending',
        nextRunAt: now - 1000,
      });

      await store.putJob(job);
      const due = await store.getDueJobs(now, 10);

      expect(due[0]).not.toBe(job);
      expect(due[0]).toEqual(job);
    });
  });

  describe('claimJob', () => {
    it('claims a pending job successfully', async () => {
      const store = createMemoryStore();
      const job = createMockJob({ id: 'test-job', status: 'pending' });

      await store.putJob(job);
      const claimed = await store.claimJob(
        'test-job',
        'worker-1',
        30000,
        Date.now()
      );

      expect(claimed).toBe(true);

      const updatedJob = await store.getJob('test-job');
      expect(updatedJob?.status).toBe('leased');
      expect(updatedJob?.lease?.workerId).toBe('worker-1');
      expect(updatedJob?.lease?.expiresAt).toBeGreaterThan(Date.now());
    });

    it('returns false for non-existent job', async () => {
      const store = createMemoryStore();

      const claimed = await store.claimJob(
        'nonexistent',
        'worker-1',
        30000,
        Date.now()
      );

      expect(claimed).toBe(false);
    });

    it('returns false for already leased job with active lease', async () => {
      const store = createMemoryStore();
      const job = createMockJob({
        id: 'test-job',
        status: 'leased',
        lease: { workerId: 'worker-1', expiresAt: Date.now() + 60000 },
      });

      await store.putJob(job);
      const claimed = await store.claimJob(
        'test-job',
        'worker-2',
        30000,
        Date.now()
      );

      expect(claimed).toBe(false);
    });

    it('returns false for non-pending jobs', async () => {
      const store = createMemoryStore();

      const statuses: Array<Job['status']> = ['completed', 'failed', 'paused'];

      for (const status of statuses) {
        const job = createMockJob({ id: `job-${status}`, status });
        await store.putJob(job);

        const claimed = await store.claimJob(
          `job-${status}`,
          'worker-1',
          30000,
          Date.now()
        );
        expect(claimed).toBe(false);
      }
    });

    it('allows claiming job with expired lease', async () => {
      const store = createMemoryStore();
      const job = createMockJob({
        id: 'test-job',
        status: 'pending',
        lease: { workerId: 'dead-worker', expiresAt: Date.now() - 10000 },
      });

      await store.putJob(job);
      const claimed = await store.claimJob(
        'test-job',
        'worker-2',
        30000,
        Date.now()
      );

      expect(claimed).toBe(true);

      const updatedJob = await store.getJob('test-job');
      expect(updatedJob?.lease?.workerId).toBe('worker-2');
    });
  });

  describe('isolation', () => {
    it('different store instances are isolated', async () => {
      const store1 = createMemoryStore();
      const store2 = createMemoryStore();

      const hire = createMockHire({ id: 'hire-1' });
      await store1.putHire(hire);

      const fromStore1 = await store1.getHire('hire-1');
      const fromStore2 = await store2.getHire('hire-1');

      expect(fromStore1).toBeDefined();
      expect(fromStore2).toBeUndefined();
    });
  });
});
