import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
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

export type SQLiteBatchChannelStorageOptions = {
  /** Isolates channels when several agents share one database. */
  namespace?: string;
};

/**
 * Restart-safe Bun SQLite x402 batch channel storage.
 *
 * `BEGIN IMMEDIATE` holds the backend write lock across the complete upstream
 * `updateChannel` callback, preventing interleaved voucher mutations.
 */
export class SQLiteBatchChannelStorage implements BatchChannelStorage {
  readonly durable = true;
  private readonly db: Database;
  private readonly namespace: string;
  private closed = false;

  constructor(
    dbPath = '.data/x402-batch-channels.db',
    options: SQLiteBatchChannelStorageOptions = {}
  ) {
    if (typeof Bun === 'undefined') {
      throw new Error('SQLiteBatchChannelStorage requires the Bun runtime');
    }
    const directory = dirname(dbPath);
    if (directory !== '.') mkdirSync(directory, { recursive: true });
    this.namespace = options.namespace?.trim() || 'default';
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS x402_batch_channels (
        namespace TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        channel_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, channel_id)
      );
      CREATE INDEX IF NOT EXISTS idx_x402_batch_channels_updated
        ON x402_batch_channels(namespace, updated_at);
    `);
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error('Batch channel storage is closed');
  }

  private transaction<T>(operation: () => T): T {
    this.ensureOpen();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // The transaction may already have ended.
      }
      throw error;
    }
  }

  private getRaw(channelId: string): string | undefined {
    const row = this.db
      .prepare(
        `SELECT channel_json FROM x402_batch_channels
         WHERE namespace = ? AND channel_id = ?`
      )
      .get(this.namespace, channelId) as { channel_json: string } | undefined;
    return row?.channel_json;
  }

  async get(channelId: string): Promise<Channel | undefined> {
    this.ensureOpen();
    const raw = this.getRaw(normalizeBatchChannelId(channelId));
    return raw ? parseBatchChannel(raw) : undefined;
  }

  async list(): Promise<Channel[]> {
    this.ensureOpen();
    const rows = this.db
      .prepare(
        `SELECT channel_json FROM x402_batch_channels
         WHERE namespace = ?
         ORDER BY channel_id ASC`
      )
      .all(this.namespace) as Array<{ channel_json: string }>;
    return rows.map(row => parseBatchChannel(row.channel_json));
  }

  async updateChannel(
    channelId: string,
    update: (current: Channel | undefined) => Channel | undefined
  ): Promise<ChannelUpdateResult> {
    const key = normalizeBatchChannelId(channelId);
    return this.transaction(() => {
      const currentRaw = this.getRaw(key);
      const current = currentRaw ? parseBatchChannel(currentRaw) : undefined;
      const next = update(current);
      if (next === current) {
        return {
          channel: current ? cloneBatchChannel(current) : undefined,
          status: 'unchanged',
        };
      }
      if (!next) {
        this.db
          .prepare(
            `DELETE FROM x402_batch_channels
             WHERE namespace = ? AND channel_id = ?`
          )
          .run(this.namespace, key);
        return {
          channel: undefined,
          status: current ? 'deleted' : 'unchanged',
        };
      }
      const nextRaw = serializeBatchChannel(key, next);
      this.db
        .prepare(
          `INSERT INTO x402_batch_channels
             (namespace, channel_id, channel_json, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(namespace, channel_id) DO UPDATE SET
             channel_json = excluded.channel_json,
             updated_at = excluded.updated_at`
        )
        .run(this.namespace, key, nextRaw, Date.now());
      return { channel: parseBatchChannel(nextRaw), status: 'updated' };
    });
  }

  async clear(): Promise<void> {
    this.ensureOpen();
    this.db
      .prepare('DELETE FROM x402_batch_channels WHERE namespace = ?')
      .run(this.namespace);
  }

  close(): void {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }
}

export function createSQLiteBatchChannelStorage(
  dbPath?: string,
  options?: SQLiteBatchChannelStorageOptions
): SQLiteBatchChannelStorage {
  return new SQLiteBatchChannelStorage(dbPath, options);
}
