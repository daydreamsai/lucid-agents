export type Stage =
  | 'received'
  | 'policy_ok'
  | 'policy_denied'
  | 'simulated'
  | 'preflight_failed'
  | 'broadcast'
  | 'accepted'
  | 'landed'
  | 'failed'
  | 'unconfirmed'
  | 'workflow_created'
  | 'workflow_reused'
  | 'workflow_run'
  | 'error';

export type Outcome =
  | 'landed'
  | 'scheduled'
  | 'policy_denied'
  | 'preflight_failed'
  | 'failed'
  | 'unconfirmed'
  | 'error';

export interface StageEntry {
  stage: Stage;
  at: string;
  detail?: Record<string, unknown>;
}

export interface LandedRecord {
  reference: string;
  entrypoint: string | undefined;
  attempt: number;
  chainId: string;
  recipientAddress: string;
  amount: string;
  tokenAddress: string | undefined;
  idempotencyKey: string | undefined;
  startedAt: string;
  finishedAt: string | undefined;
  outcome: Outcome | undefined;
  executionId: string | undefined;
  transactionHash: string | undefined;
  transactionLink: string | undefined;
  sponsored: boolean | undefined;
  replayed: boolean | undefined;
  error: { code: string; message: string } | undefined;
  stages: StageEntry[];
}

export type LogEvent =
  | { type: 'stage'; record: LandedRecord; entry: StageEntry }
  | { type: 'finished'; record: LandedRecord };

export type LogListener = (event: LogEvent) => void;

/**
 * Bounded in-memory record of every execution this agent attempted, keyed by the
 * caller's reference, with subscriptions so a stream can follow a reference live.
 * KeeperHub keeps the authoritative history; this is the agent-side view a buyer
 * can query without a KeeperHub credential.
 */
export class ExecutionLog {
  private readonly records = new Map<string, LandedRecord>();
  private readonly order: string[] = [];
  private readonly listeners = new Map<string, Set<LogListener>>();
  private readonly maxEntries: number;
  private readonly clock: () => Date;

  constructor(
    options: {
      maxEntries?: number | undefined;
      clock?: (() => Date) | undefined;
    } = {}
  ) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 500);
    this.clock = options.clock ?? (() => new Date());
  }

  start(input: {
    reference: string;
    entrypoint?: string | undefined;
    chainId: string;
    recipientAddress: string;
    amount: string;
    tokenAddress?: string | undefined;
  }): LandedRecord {
    const previous = this.records.get(input.reference);
    const record: LandedRecord = {
      reference: input.reference,
      entrypoint: input.entrypoint,
      attempt: (previous?.attempt ?? 0) + 1,
      chainId: input.chainId,
      recipientAddress: input.recipientAddress,
      amount: input.amount,
      tokenAddress: input.tokenAddress,
      idempotencyKey: undefined,
      startedAt: this.now(),
      finishedAt: undefined,
      outcome: undefined,
      executionId: undefined,
      transactionHash: undefined,
      transactionLink: undefined,
      sponsored: undefined,
      replayed: undefined,
      error: undefined,
      stages: [],
    };
    if (!previous) {
      this.order.push(input.reference);
      while (this.order.length > this.maxEntries) {
        const evicted = this.order.shift();
        if (evicted !== undefined) {
          this.records.delete(evicted);
          this.listeners.delete(evicted);
        }
      }
    }
    this.records.set(input.reference, record);
    this.push(record, 'received');
    return record;
  }

  push(
    record: LandedRecord,
    stage: Stage,
    detail?: Record<string, unknown>
  ): StageEntry {
    const entry: StageEntry = detail
      ? { stage, at: this.now(), detail }
      : { stage, at: this.now() };
    record.stages.push(entry);
    this.emit(record.reference, { type: 'stage', record, entry });
    return entry;
  }

  finish(
    record: LandedRecord,
    outcome: Outcome,
    error?: { code: string; message: string }
  ): LandedRecord {
    record.outcome = outcome;
    record.finishedAt = this.now();
    if (error) {
      record.error = error;
    }
    this.emit(record.reference, { type: 'finished', record });
    return record;
  }

  get(reference: string): LandedRecord | undefined {
    return this.records.get(reference);
  }

  list(options: { limit?: number | undefined } = {}): LandedRecord[] {
    const limit = Math.max(1, options.limit ?? 50);
    return this.order
      .slice(-limit)
      .reverse()
      .map(reference => this.records.get(reference))
      .filter((record): record is LandedRecord => record !== undefined);
  }

  /** Follow one reference. Returns an unsubscribe function. */
  subscribe(reference: string, listener: LogListener): () => void {
    let set = this.listeners.get(reference);
    if (!set) {
      set = new Set();
      this.listeners.set(reference, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) {
        this.listeners.delete(reference);
      }
    };
  }

  get size(): number {
    return this.records.size;
  }

  private emit(reference: string, event: LogEvent): void {
    const set = this.listeners.get(reference);
    if (!set) {
      return;
    }
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch {
        // a broken subscriber must not break the execution path
      }
    }
  }

  private now(): string {
    return this.clock().toISOString();
  }
}
