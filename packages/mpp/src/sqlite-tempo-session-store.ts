import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
import type {
  TempoSessionStore,
  TempoSessionStoreChange,
} from '@lucid-agents/types/mpp';

import {
  deserializeTempoSessionValue,
  serializeTempoSessionValue,
} from './tempo-session-store';

/** Namespace options for SQLite Tempo session storage. */
export type SQLiteTempoSessionStoreOptions = {
  namespace?: string;
};

/** Durable, replica-coordinating Tempo session storage for Bun SQLite. */
export class SQLiteTempoSessionStore implements TempoSessionStore {
  readonly durability = 'durable' as const;
  private readonly db: Database;
  private readonly namespace: string;
  private closed = false;

  constructor(
    dbPath = '.data/mpp-tempo-sessions.db',
    options: SQLiteTempoSessionStoreOptions = {}
  ) {
    if (typeof Bun === 'undefined') {
      throw new Error('SQLiteTempoSessionStore requires the Bun runtime');
    }
    const directory = dirname(dbPath);
    if (directory !== '.') mkdirSync(directory, { recursive: true });
    this.namespace = options.namespace?.trim() || 'default';
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mpp_tempo_sessions (
        namespace TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, storage_key)
      );
      CREATE INDEX IF NOT EXISTS idx_mpp_tempo_sessions_updated
        ON mpp_tempo_sessions(namespace, updated_at);
    `);
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error('Tempo session storage is closed');
  }

  private getSerialized(key: string): string | undefined {
    const row = this.db
      .prepare(
        `SELECT value_json
         FROM mpp_tempo_sessions
         WHERE namespace = ? AND storage_key = ?`
      )
      .get(this.namespace, key) as { value_json: string } | undefined;
    return row?.value_json;
  }

  async get(key: string): Promise<unknown | null> {
    this.ensureOpen();
    const value = this.getSerialized(key);
    return value === undefined ? null : deserializeTempoSessionValue(value);
  }

  async put(key: string, value: unknown): Promise<void> {
    this.ensureOpen();
    this.db
      .prepare(
        `INSERT INTO mpp_tempo_sessions
           (namespace, storage_key, value_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(namespace, storage_key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .run(this.namespace, key, serializeTempoSessionValue(value), Date.now());
  }

  async delete(key: string): Promise<void> {
    this.ensureOpen();
    this.db
      .prepare(
        `DELETE FROM mpp_tempo_sessions
         WHERE namespace = ? AND storage_key = ?`
      )
      .run(this.namespace, key);
  }

  async update<Result>(
    key: string,
    fn: (current: unknown | null) => TempoSessionStoreChange<Result>
  ): Promise<Result> {
    this.ensureOpen();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const serialized = this.getSerialized(key);
      const current =
        serialized === undefined
          ? null
          : deserializeTempoSessionValue(serialized);
      const change = fn(current);
      if (change.op === 'set') {
        this.db
          .prepare(
            `INSERT INTO mpp_tempo_sessions
               (namespace, storage_key, value_json, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(namespace, storage_key) DO UPDATE SET
               value_json = excluded.value_json,
               updated_at = excluded.updated_at`
          )
          .run(
            this.namespace,
            key,
            serializeTempoSessionValue(change.value),
            Date.now()
          );
      } else if (change.op === 'delete') {
        this.db
          .prepare(
            `DELETE FROM mpp_tempo_sessions
             WHERE namespace = ? AND storage_key = ?`
          )
          .run(this.namespace, key);
      }
      this.db.exec('COMMIT');
      return change.result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // The transaction may already have ended.
      }
      throw error;
    }
  }

  close(): void {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }
}

/** Create durable Tempo session storage backed by Bun SQLite. */
export function createSQLiteTempoSessionStore(
  dbPath?: string,
  options?: SQLiteTempoSessionStoreOptions
): SQLiteTempoSessionStore {
  return new SQLiteTempoSessionStore(dbPath, options);
}
