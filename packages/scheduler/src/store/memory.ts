import type { Hire, Job, SchedulerStore } from '../types';

export function createMemoryStore(): SchedulerStore {
  return new MemoryStore();
}

class MemoryStore implements SchedulerStore {
  private hires = new Map<string, Hire>();
  private jobs = new Map<string, Job>();

  async putHire(hire: Hire): Promise<void> {
    this.hires.set(hire.id, this.clone(hire));
  }

  async getHire(id: string): Promise<Hire | undefined> {
    const hire = this.hires.get(id);
    return hire ? this.clone(hire) : undefined;
  }

  async putJob(job: Job): Promise<void> {
    this.jobs.set(job.id, this.clone(job));
  }

  async getJob(id: string): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    return job ? this.clone(job) : undefined;
  }

  async getDueJobs(now: number, limit: number): Promise<Job[]> {
    const due: Job[] = [];
    for (const job of this.jobs.values()) {
      if (job.status !== 'pending') continue;
      if (job.nextRunAt > now) continue;
      if (job.lease && job.lease.expiresAt > now) continue;
      due.push(this.clone(job));
    }

    due.sort((a, b) => a.nextRunAt - b.nextRunAt);
    return due.slice(0, limit);
  }

  async claimJob(jobId: string, workerId: string, leaseMs: number): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    const now = Date.now();
    if (job.status === 'leased' && job.lease && job.lease.expiresAt > now) {
      return false;
    }

    if (job.status !== 'pending') {
      return false;
    }

    const updated: Job = {
      ...job,
      status: 'leased',
      lease: {
        workerId,
        expiresAt: now + leaseMs,
      },
    };

    this.jobs.set(jobId, this.clone(updated));
    return true;
  }

  private clone<T>(value: T): T {
    return globalThis.structuredClone
      ? globalThis.structuredClone(value)
      : JSON.parse(JSON.stringify(value)) as T;
  }
}
