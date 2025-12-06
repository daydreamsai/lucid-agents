import { randomUUID } from 'crypto';
import { fetchAgentCardWithEntrypoints } from './agent-card';
import type {
  Hire,
  Job,
  OperationResult,
  Schedule,
  SchedulerRuntime,
  SchedulerRuntimeOptions,
} from './types';

export function createSchedulerRuntime(
  options: SchedulerRuntimeOptions
): SchedulerRuntime {
  const clock = options.clock ?? (() => Date.now());
  const fetchCard = options.fetchAgentCard ?? fetchAgentCardWithEntrypoints;
  const defaultMaxRetries = options.defaultMaxRetries ?? 3;
  const leaseMs = options.leaseMs ?? 30_000;
  const maxDueBatch = options.maxDueBatch ?? 25;
  const agentCardTtlMs = options.agentCardTtlMs ?? 5 * 60_000;
  const defaultConcurrency = options.defaultConcurrency ?? 5;

  async function createHire(input: {
    agentCardUrl: string;
    wallet: Hire['wallet'];
    entrypointKey: string;
    schedule: Schedule;
    jobInput: Job['input'];
    maxRetries?: number;
    idempotencyKey?: string;
    metadata?: Hire['metadata'];
  }): Promise<{ hire: Hire; job: Job }> {
    // Validate schedule early to fail fast
    validateSchedule(input.schedule);

    const now = clock();
    const card = await fetchCard(input.agentCardUrl);
    validateEntrypoint(card, input.entrypointKey);

    const hire: Hire = {
      id: randomUUID(),
      agent: {
        agentCardUrl: input.agentCardUrl,
        card,
        cachedAt: now,
      },
      wallet: input.wallet,
      status: 'active',
      metadata: input.metadata,
    };

    const job: Job = {
      id: randomUUID(),
      hireId: hire.id,
      entrypointKey: input.entrypointKey,
      input: input.jobInput,
      schedule: input.schedule,
      nextRunAt: computeInitialNextRun(input.schedule, now),
      attempts: 0,
      maxRetries: input.maxRetries ?? defaultMaxRetries,
      status: 'pending',
      idempotencyKey: input.idempotencyKey,
    };

    await options.store.putHire(hire);
    try {
      await options.store.putJob(job);
    } catch (error) {
      // Rollback: delete the hire if job creation fails
      await options.store.deleteHire?.(hire.id);
      throw error;
    }

    return { hire, job };
  }

  async function addJob(input: {
    hireId: string;
    entrypointKey: string;
    schedule: Schedule;
    jobInput: Job['input'];
    maxRetries?: number;
    idempotencyKey?: string;
  }): Promise<Job> {
    // Validate schedule early to fail fast
    validateSchedule(input.schedule);

    const existingHire = await options.store.getHire(input.hireId);
    if (!existingHire) {
      throw new Error(`Hire ${input.hireId} not found`);
    }
    if (existingHire.status === 'canceled') {
      throw new Error(`Hire ${input.hireId} is canceled`);
    }

    const now = clock();
    const { card, hire } = await ensureCard(existingHire, now);
    validateEntrypoint(card, input.entrypointKey);

    const job: Job = {
      id: randomUUID(),
      hireId: hire.id,
      entrypointKey: input.entrypointKey,
      input: input.jobInput,
      schedule: input.schedule,
      nextRunAt: computeInitialNextRun(input.schedule, now),
      attempts: 0,
      maxRetries: input.maxRetries ?? defaultMaxRetries,
      status: 'pending',
      idempotencyKey: input.idempotencyKey,
    };

    await options.store.putJob(job);
    return job;
  }

  async function pauseHire(hireId: string): Promise<OperationResult> {
    const hire = await options.store.getHire(hireId);
    if (!hire) {
      return { success: false, error: `Hire ${hireId} not found` };
    }
    if (hire.status === 'canceled') {
      return { success: false, error: `Hire ${hireId} is already canceled` };
    }
    if (hire.status === 'paused') {
      return { success: false, error: `Hire ${hireId} is already paused` };
    }
    await options.store.putHire({ ...hire, status: 'paused' });
    return { success: true, data: undefined };
  }

  async function resumeHire(hireId: string): Promise<OperationResult> {
    const hire = await options.store.getHire(hireId);
    if (!hire) {
      return { success: false, error: `Hire ${hireId} not found` };
    }
    if (hire.status === 'canceled') {
      return { success: false, error: `Hire ${hireId} is canceled and cannot be resumed` };
    }
    if (hire.status === 'active') {
      return { success: false, error: `Hire ${hireId} is already active` };
    }
    await options.store.putHire({ ...hire, status: 'active' });
    return { success: true, data: undefined };
  }

  async function cancelHire(hireId: string): Promise<OperationResult> {
    const hire = await options.store.getHire(hireId);
    if (!hire) {
      return { success: false, error: `Hire ${hireId} not found` };
    }
    if (hire.status === 'canceled') {
      return { success: false, error: `Hire ${hireId} is already canceled` };
    }
    await options.store.putHire({ ...hire, status: 'canceled' });
    return { success: true, data: undefined };
  }

  async function pauseJob(jobId: string): Promise<OperationResult> {
    const job = await options.store.getJob(jobId);
    if (!job) {
      return { success: false, error: `Job ${jobId} not found` };
    }
    if (job.status === 'completed' || job.status === 'failed') {
      return { success: false, error: `Job ${jobId} is ${job.status} and cannot be paused` };
    }
    if (job.status === 'paused') {
      return { success: false, error: `Job ${jobId} is already paused` };
    }
    await options.store.putJob({
      ...job,
      status: 'paused',
      lease: undefined,
    });
    return { success: true, data: undefined };
  }

  async function resumeJob(jobId: string, nextRunAt?: number): Promise<OperationResult> {
    const job = await options.store.getJob(jobId);
    if (!job) {
      return { success: false, error: `Job ${jobId} not found` };
    }
    if (job.status === 'completed') {
      return { success: false, error: `Job ${jobId} is completed and cannot be resumed` };
    }
    if (job.status === 'pending' || job.status === 'leased') {
      return { success: false, error: `Job ${jobId} is already ${job.status}` };
    }
    await options.store.putJob({
      ...job,
      status: 'pending',
      lease: undefined,
      nextRunAt: nextRunAt ?? clock(),
    });
    return { success: true, data: undefined };
  }

  async function tick(optionsOverride?: { workerId?: string; concurrency?: number }): Promise<void> {
    const workerId = optionsOverride?.workerId ?? 'scheduler-worker';
    const concurrency = optionsOverride?.concurrency ?? defaultConcurrency;
    const now = clock();
    const due = await options.store.getDueJobs(now, maxDueBatch);

    // Process jobs in parallel with concurrency limit
    const processJob = async (job: Job): Promise<void> => {
      const claimed = await options.store.claimJob(job.id, workerId, leaseMs);
      if (!claimed) {
        return;
      }

      const claimedJob = {
        ...job,
        status: 'leased' as const,
        lease: { workerId, expiresAt: now + leaseMs },
      };

      const hire = await options.store.getHire(claimedJob.hireId);
      if (!hire) {
        await options.store.putJob({
          ...claimedJob,
          status: 'failed',
          lease: undefined,
          lastError: 'hire missing',
        });
        return;
      }

      if (hire.status === 'canceled') {
        await options.store.putJob({
          ...claimedJob,
          status: 'failed',
          lease: undefined,
          lastError: 'hire canceled',
        });
        return;
      }

      if (hire.status === 'paused') {
        await options.store.putJob({
          ...claimedJob,
          status: 'pending',
          lease: undefined,
          nextRunAt: now + leaseMs,
        });
        return;
      }

      const { card } = await ensureCard(hire, now);
      const entry = card.entrypoints?.[claimedJob.entrypointKey];
      if (!entry) {
        await options.store.putJob({
          ...claimedJob,
          status: 'failed',
          lease: undefined,
          lastError: `Entrypoint ${claimedJob.entrypointKey} not found`,
        });
        return;
      }

      try {
        // Resolve wallet connector if resolver is provided
        const walletConnector = options.walletResolver
          ? await options.walletResolver(hire.wallet)
          : undefined;

        await options.invoke({
          manifest: card,
          entrypointKey: claimedJob.entrypointKey,
          input: claimedJob.input,
          walletRef: hire.wallet,
          walletConnector,
          jobId: claimedJob.id,
          idempotencyKey: claimedJob.idempotencyKey,
        });

        const nextRunAt = computeNextRun(claimedJob.schedule, now);
        if (nextRunAt === null) {
          await options.store.putJob({
            ...claimedJob,
            status: 'completed',
            lease: undefined,
            attempts: 0,
            lastError: undefined,
          });
        } else {
          await options.store.putJob({
            ...claimedJob,
            status: 'pending',
            lease: undefined,
            attempts: 0,
            lastError: undefined,
            nextRunAt,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error ?? 'error');
        const attempts = claimedJob.attempts + 1;
        if (attempts > claimedJob.maxRetries) {
          await options.store.putJob({
            ...claimedJob,
            status: 'failed',
            lease: undefined,
            attempts,
            lastError: message,
          });
          return;
        }

        const backoff = computeBackoffMs(attempts);
        await options.store.putJob({
          ...claimedJob,
          status: 'pending',
          lease: undefined,
          attempts,
          lastError: message,
          nextRunAt: now + backoff,
        });
      }
    };

    // Process jobs in batches with concurrency limit
    for (let i = 0; i < due.length; i += concurrency) {
      const batch = due.slice(i, i + concurrency);
      await Promise.all(batch.map(processJob));
    }
  }

  async function recoverExpiredLeases(): Promise<number> {
    const now = clock();
    const expiredJobs = await options.store.getExpiredLeases?.(now);
    if (!expiredJobs || expiredJobs.length === 0) {
      return 0;
    }

    let recovered = 0;
    for (const job of expiredJobs) {
      await options.store.putJob({
        ...job,
        status: 'pending',
        lease: undefined,
        nextRunAt: now,
      });
      recovered++;
    }

    return recovered;
  }

  async function ensureCard(
    hire: Hire,
    now: number
  ): Promise<{ card: NonNullable<Hire['agent']['card']>; hire: Hire }> {
    if (hire.agent.card && hire.agent.cachedAt) {
      const fresh = now - hire.agent.cachedAt < agentCardTtlMs;
      if (fresh) {
        return { card: hire.agent.card, hire };
      }
    }

    const card = await fetchCard(hire.agent.agentCardUrl);
    const updated: Hire = {
      ...hire,
      agent: {
        ...hire.agent,
        card,
        cachedAt: now,
      },
    };

    await options.store.putHire(updated);
    return { card, hire: updated };
  }

  return {
    createHire,
    addJob,
    pauseHire,
    resumeHire,
    cancelHire,
    pauseJob,
    resumeJob,
    tick,
    recoverExpiredLeases,
  };
}

function computeInitialNextRun(schedule: Schedule, now: number): number {
  switch (schedule.kind) {
    case 'once':
      return schedule.at;
    case 'interval':
      return now;
    case 'cron':
      throw new Error('cron schedules are not supported yet');
    default: {
      const exhaustive: never = schedule;
      return exhaustive;
    }
  }
}

function computeNextRun(schedule: Schedule, now: number): number | null {
  switch (schedule.kind) {
    case 'once':
      return null;
    case 'interval':
      return now + schedule.everyMs;
    case 'cron':
      throw new Error('cron schedules are not supported yet');
    default: {
      const exhaustive: never = schedule;
      return exhaustive;
    }
  }
}

function validateEntrypoint(
  card: NonNullable<Hire['agent']['card']>,
  entrypointKey: string
): void {
  if (!card.entrypoints || !card.entrypoints[entrypointKey]) {
    throw new Error(`Entrypoint ${entrypointKey} not found in agent card`);
  }
}

function validateSchedule(schedule: Schedule): void {
  switch (schedule.kind) {
    case 'once':
    case 'interval':
      return;
    case 'cron':
      throw new Error(
        'Cron schedules are not supported yet. Use "once" or "interval" schedule kinds.'
      );
    default: {
      const exhaustive: never = schedule;
      throw new Error(`Unknown schedule kind: ${(exhaustive as Schedule).kind}`);
    }
  }
}

function computeBackoffMs(attempts: number): number {
  const base = 1_000 * 2 ** Math.max(0, attempts - 1);
  // Add jitter (±20%) to prevent thundering herd
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.min(60_000, base + jitter);
}
