import { Pool, type PoolClient } from 'pg';
import type {
  TempoSessionStore,
  TempoSessionStoreChange,
} from '@lucid-agents/types/mpp';

import {
  deserializeTempoSessionValue,
  serializeTempoSessionValue,
} from './tempo-session-store';

/** Namespace and pool options for Postgres Tempo session storage. */
export type PostgresTempoSessionStoreOptions = {
  namespace?: string;
  maxConnections?: number;
};

/** Durable, multi-process Tempo session storage for PostgreSQL. */
export class PostgresTempoSessionStore implements TempoSessionStore {
  readonly durability = 'durable' as const;
  private readonly pool: Pool;
  private readonly namespace: string;
  private schemaPromise?: Promise<void>;
  private closed = false;

  constructor(
    connectionString: string,
    options: PostgresTempoSessionStoreOptions = {}
  ) {
    if (!connectionString.trim()) {
      throw new Error(
        'Postgres Tempo session storage requires connectionString'
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
    if (this.closed) throw new Error('Tempo session storage is closed');
  }

  private async ensureSchema(): Promise<void> {
    this.ensureOpen();
    if (!this.schemaPromise) {
      this.schemaPromise = this.pool
        .query(
          `
          CREATE TABLE IF NOT EXISTS mpp_tempo_sessions (
            namespace TEXT NOT NULL,
            storage_key TEXT NOT NULL,
            value_json TEXT NOT NULL,
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (namespace, storage_key)
          );
          CREATE INDEX IF NOT EXISTS idx_mpp_tempo_sessions_updated
            ON mpp_tempo_sessions(namespace, updated_at);
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

  private async withTransaction<Result>(
    operation: (client: PoolClient) => Promise<Result>
  ): Promise<Result> {
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
        // Preserve the original transaction failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockKey(client: PoolClient, key: string): Promise<void> {
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [this.namespace, key]
    );
  }

  async get(key: string): Promise<unknown | null> {
    await this.ensureSchema();
    const result = await this.pool.query<{ value_json: string }>(
      `SELECT value_json
       FROM mpp_tempo_sessions
       WHERE namespace = $1 AND storage_key = $2`,
      [this.namespace, key]
    );
    const serialized = result.rows[0]?.value_json;
    return serialized === undefined
      ? null
      : deserializeTempoSessionValue(serialized);
  }

  async put(key: string, value: unknown): Promise<void> {
    await this.withTransaction(async client => {
      await this.lockKey(client, key);
      await client.query(
        `INSERT INTO mpp_tempo_sessions
           (namespace, storage_key, value_json, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(namespace, storage_key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`,
        [this.namespace, key, serializeTempoSessionValue(value), Date.now()]
      );
    });
  }

  async delete(key: string): Promise<void> {
    await this.withTransaction(async client => {
      await this.lockKey(client, key);
      await client.query(
        `DELETE FROM mpp_tempo_sessions
         WHERE namespace = $1 AND storage_key = $2`,
        [this.namespace, key]
      );
    });
  }

  async update<Result>(
    key: string,
    fn: (current: unknown | null) => TempoSessionStoreChange<Result>
  ): Promise<Result> {
    return this.withTransaction(async client => {
      await this.lockKey(client, key);
      const currentResult = await client.query<{ value_json: string }>(
        `SELECT value_json
         FROM mpp_tempo_sessions
         WHERE namespace = $1 AND storage_key = $2
         FOR UPDATE`,
        [this.namespace, key]
      );
      const serialized = currentResult.rows[0]?.value_json;
      const current =
        serialized === undefined
          ? null
          : deserializeTempoSessionValue(serialized);
      const change = fn(current);
      if (change.op === 'set') {
        await client.query(
          `INSERT INTO mpp_tempo_sessions
             (namespace, storage_key, value_json, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT(namespace, storage_key) DO UPDATE SET
             value_json = excluded.value_json,
             updated_at = excluded.updated_at`,
          [
            this.namespace,
            key,
            serializeTempoSessionValue(change.value),
            Date.now(),
          ]
        );
      } else if (change.op === 'delete') {
        await client.query(
          `DELETE FROM mpp_tempo_sessions
           WHERE namespace = $1 AND storage_key = $2`,
          [this.namespace, key]
        );
      }
      return change.result;
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.pool.end();
  }
}

/** Create durable, multi-process Tempo session storage in Postgres. */
export function createPostgresTempoSessionStore(
  connectionString: string,
  options?: PostgresTempoSessionStoreOptions
): PostgresTempoSessionStore {
  return new PostgresTempoSessionStore(connectionString, options);
}
