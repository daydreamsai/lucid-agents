import type {
  Channel,
  ChannelUpdateResult,
} from '@x402/evm/batch-settlement/server';

import {
  cloneBatchChannel,
  normalizeBatchChannelId,
  parseBatchChannel,
  serializeBatchChannel,
  type BatchChannelStorage,
} from './batch-channel-storage';

export type InMemoryBatchChannelStorageOptions = {
  /** Maximum channel records retained by this development adapter. */
  maxChannels?: number;
};

/**
 * Process-local x402 batch channel storage for development and tests.
 *
 * This adapter is ephemeral and does not coordinate across JS runtimes.
 */
export class InMemoryBatchChannelStorage implements BatchChannelStorage {
  readonly durable = false;
  private readonly channels = new Map<string, string>();
  private readonly maxChannels: number;
  private operationQueue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(options: InMemoryBatchChannelStorageOptions = {}) {
    this.maxChannels = options.maxChannels ?? 10_000;
    if (!Number.isSafeInteger(this.maxChannels) || this.maxChannels <= 0) {
      throw new Error('Batch channel maxChannels must be a positive integer');
    }
  }

  private async withLock<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.closed) throw new Error('Batch channel storage is closed');
    const previous = this.operationQueue;
    let release: () => void = () => {};
    this.operationQueue = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    try {
      if (this.closed) throw new Error('Batch channel storage is closed');
      return await operation();
    } finally {
      release();
    }
  }

  async get(channelId: string): Promise<Channel | undefined> {
    const key = normalizeBatchChannelId(channelId);
    return this.withLock(() => {
      const raw = this.channels.get(key);
      return raw ? parseBatchChannel(raw) : undefined;
    });
  }

  async list(): Promise<Channel[]> {
    return this.withLock(() =>
      [...this.channels.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, raw]) => parseBatchChannel(raw))
    );
  }

  async updateChannel(
    channelId: string,
    update: (current: Channel | undefined) => Channel | undefined
  ): Promise<ChannelUpdateResult> {
    const key = normalizeBatchChannelId(channelId);
    return this.withLock(() => {
      const currentRaw = this.channels.get(key);
      const current = currentRaw ? parseBatchChannel(currentRaw) : undefined;
      const next = update(current);
      if (next === current) {
        return {
          channel: current ? cloneBatchChannel(current) : undefined,
          status: 'unchanged',
        };
      }
      if (!next) {
        this.channels.delete(key);
        return {
          channel: undefined,
          status: current ? 'deleted' : 'unchanged',
        };
      }
      if (!current && this.channels.size >= this.maxChannels) {
        throw new Error('Batch channel storage capacity exceeded');
      }
      const nextRaw = serializeBatchChannel(key, next);
      this.channels.set(key, nextRaw);
      return { channel: parseBatchChannel(nextRaw), status: 'updated' };
    });
  }

  async clear(): Promise<void> {
    await this.withLock(() => {
      this.channels.clear();
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.withLock(() => {
      this.channels.clear();
      this.closed = true;
    });
  }
}

export function createInMemoryBatchChannelStorage(
  options?: InMemoryBatchChannelStorageOptions
): InMemoryBatchChannelStorage {
  return new InMemoryBatchChannelStorage(options);
}
