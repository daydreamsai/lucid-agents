import { Pool, type PoolClient, type QueryResultRow } from 'pg';
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

type BatchChannelRow = QueryResultRow & {
  channel_json: string;
};

export type PostgresBatchChannelStorageOptions = {
  /** Isolates channels when several agents share one database. */
  namespace?: string;
  maxConnections?: number;
};

/**
 * Multi-replica Postgres x402 batch channel storage.
 *
 * A namespace shared advisory lock coordinates cleanup while a channel-keyed
 * advisory lock serializes the complete callback even when no row exists yet.
 */
export class PostgresBatchChannelStorage implements BatchChannelStorage {
  readonly durable = true;
  private readonly pool: Pool;
  private readonly namespace: string;
  private schemaPromise?: Promise<void>;
  private closed = false;

  constructor(
    connectionString: string,
    options: PostgresBatchChannelStorageOptions = {}
  ) {
    if (!connectionString.trim()) {
      throw new Error(
        'Postgres batch channel storage requires connectionString'
      );
    }
    this.namespace = options.namespace?.trim() || 'default';
    this.pool = new Pool({
      connectionString,
      max: options.maxConnections ?? 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error('Batch channel storage is closed');
  }

  private async ensureSchema(): Promise<void> {
    this.ensureOpen();
    if (!this.schemaPromise) {
      this.schemaPromise = this.pool
        .query(
          `
          CREATE TABLE IF NOT EXISTS x402_batch_channels (
            namespace TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            channel_json TEXT NOT NULL,
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (namespace, channel_id)
          );
          CREATE INDEX IF NOT EXISTS idx_x402_batch_channels_updated
            ON x402_batch_channels(namespace, updated_at);
        `
        )
        .then(() => undefined)
        .catch(error => {
          this.schemaPromise = undefined;
          throw error;
        });
    }
    await this.schemaPromise;
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockNamespace(
    client: PoolClient,
    mode: 'shared' | 'exclusive'
  ): Promise<void> {
    const functionName =
      mode === 'shared'
        ? 'pg_advisory_xact_lock_shared'
        : 'pg_advisory_xact_lock';
    await client.query(`SELECT ${functionName}(hashtextextended($1, 0))`, [
      this.namespace,
    ]);
  }

  private async getRaw(
    queryable: Pick<Pool, 'query'> | Pick<PoolClient, 'query'>,
    channelId: string
  ): Promise<string | undefined> {
    const result = await queryable.query<BatchChannelRow>(
      `SELECT channel_json FROM x402_batch_channels
       WHERE namespace = $1 AND channel_id = $2`,
      [this.namespace, channelId]
    );
    return result.rows[0]?.channel_json;
  }

  async get(channelId: string): Promise<Channel | undefined> {
    await this.ensureSchema();
    const raw = await this.getRaw(
      this.pool,
      normalizeBatchChannelId(channelId)
    );
    return raw ? parseBatchChannel(raw) : undefined;
  }

  async list(): Promise<Channel[]> {
    await this.ensureSchema();
    const result = await this.pool.query<BatchChannelRow>(
      `SELECT channel_json FROM x402_batch_channels
       WHERE namespace = $1
       ORDER BY channel_id ASC`,
      [this.namespace]
    );
    return result.rows.map(row => parseBatchChannel(row.channel_json));
  }

  async updateChannel(
    channelId: string,
    update: (current: Channel | undefined) => Channel | undefined
  ): Promise<ChannelUpdateResult> {
    const key = normalizeBatchChannelId(channelId);
    return this.transaction(async client => {
      await this.lockNamespace(client, 'shared');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [JSON.stringify([this.namespace, key])]
      );
      const currentRaw = await this.getRaw(client, key);
      const current = currentRaw ? parseBatchChannel(currentRaw) : undefined;
      const next = update(current);
      if (next === current) {
        return {
          channel: current ? cloneBatchChannel(current) : undefined,
          status: 'unchanged',
        };
      }
      if (!next) {
        await client.query(
          `DELETE FROM x402_batch_channels
           WHERE namespace = $1 AND channel_id = $2`,
          [this.namespace, key]
        );
        return {
          channel: undefined,
          status: current ? 'deleted' : 'unchanged',
        };
      }
      const nextRaw = serializeBatchChannel(key, next);
      await client.query(
        `INSERT INTO x402_batch_channels
           (namespace, channel_id, channel_json, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(namespace, channel_id) DO UPDATE SET
           channel_json = excluded.channel_json,
           updated_at = excluded.updated_at`,
        [this.namespace, key, nextRaw, Date.now()]
      );
      return { channel: parseBatchChannel(nextRaw), status: 'updated' };
    });
  }

  async clear(): Promise<void> {
    await this.transaction(async client => {
      await this.lockNamespace(client, 'exclusive');
      await client.query(
        'DELETE FROM x402_batch_channels WHERE namespace = $1',
        [this.namespace]
      );
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.pool.end();
  }
}

export function createPostgresBatchChannelStorage(
  connectionString: string,
  options?: PostgresBatchChannelStorageOptions
): PostgresBatchChannelStorage {
  return new PostgresBatchChannelStorage(connectionString, options);
}
