import type {
  TempoSessionStore,
  TempoSessionStoreChange,
} from '@lucid-agents/types/mpp';

const BIGINT_TAG = '$lucid.mpp.bigint';

function encode(value: unknown): string {
  return JSON.stringify(value, (_key, candidate) =>
    typeof candidate === 'bigint'
      ? { [BIGINT_TAG]: candidate.toString() }
      : candidate
  );
}

function decode(serialized: string): unknown {
  return JSON.parse(serialized, (_key, candidate: unknown) => {
    if (
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate) &&
      Object.keys(candidate).length === 1 &&
      typeof (candidate as Record<string, unknown>)[BIGINT_TAG] === 'string'
    ) {
      return BigInt(
        (candidate as Record<string, string>)[BIGINT_TAG] as string
      );
    }
    return candidate;
  });
}

/** Serialize opaque Tempo session state while preserving bigint values. */
export function serializeTempoSessionValue(value: unknown): string {
  return encode(value);
}

/** Deserialize opaque Tempo session state and restore bigint values. */
export function deserializeTempoSessionValue(serialized: string): unknown {
  return decode(serialized);
}

/** Capacity options for the process-local Tempo session store. */
export type InMemoryTempoSessionStoreOptions = {
  maxEntries?: number;
};

/** Bounded process-local atomic store for development and tests. */
export class InMemoryTempoSessionStore implements TempoSessionStore {
  readonly durability = 'process' as const;
  private readonly values = new Map<string, string>();
  private readonly maxEntries: number;
  private operationQueue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(options: InMemoryTempoSessionStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 10_000;
    if (!Number.isSafeInteger(this.maxEntries) || this.maxEntries <= 0) {
      throw new Error(
        'Tempo session maxEntries must be a positive safe integer'
      );
    }
  }

  private async withLock<Result>(
    operation: () => Result | Promise<Result>
  ): Promise<Result> {
    if (this.closed) throw new Error('Tempo session storage is closed');
    const previous = this.operationQueue;
    let release: () => void = () => {};
    this.operationQueue = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    try {
      if (this.closed) throw new Error('Tempo session storage is closed');
      return await operation();
    } finally {
      release();
    }
  }

  async get(key: string): Promise<unknown | null> {
    return this.withLock(() => {
      const value = this.values.get(key);
      return value === undefined ? null : decode(value);
    });
  }

  async put(key: string, value: unknown): Promise<void> {
    await this.withLock(() => {
      if (!this.values.has(key) && this.values.size >= this.maxEntries) {
        throw new Error('Tempo session storage capacity exceeded');
      }
      this.values.set(key, encode(value));
    });
  }

  async delete(key: string): Promise<void> {
    await this.withLock(() => {
      this.values.delete(key);
    });
  }

  async update<Result>(
    key: string,
    fn: (current: unknown | null) => TempoSessionStoreChange<Result>
  ): Promise<Result> {
    return this.withLock(() => {
      const serialized = this.values.get(key);
      const current = serialized === undefined ? null : decode(serialized);
      const change = fn(current);
      if (change.op === 'set') {
        if (serialized === undefined && this.values.size >= this.maxEntries) {
          throw new Error('Tempo session storage capacity exceeded');
        }
        this.values.set(key, encode(change.value));
      } else if (change.op === 'delete') {
        this.values.delete(key);
      }
      return change.result;
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.withLock(() => {
      this.values.clear();
      this.closed = true;
    });
  }
}

/** Create a bounded process-local Tempo session store. */
export function createInMemoryTempoSessionStore(
  options?: InMemoryTempoSessionStoreOptions
): InMemoryTempoSessionStore {
  return new InMemoryTempoSessionStore(options);
}
