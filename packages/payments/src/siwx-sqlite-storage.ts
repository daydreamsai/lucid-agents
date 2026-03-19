import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { Database } from 'bun:sqlite';
import type { SIWxStorage } from './siwx-storage';

/**
 * SQLite SIWX storage implementation using Bun's native SQLite.
 * Persistent, zero configuration, auto-creates database.
 * Requires Bun runtime.
 */
export class SQLiteSIWxStorage implements SIWxStorage {
  private db: Database;

  constructor(dbPath?: string) {
    if (typeof Bun === 'undefined') {
      throw new Error(
        'SQLiteSIWxStorage requires Bun runtime. Use InMemorySIWxStorage for Node.js.'
      );
    }

    const path = dbPath ?? '.data/siwx.db';

    const dir = dirname(path);
    if (dir && dir !== '.') {
      try {
        mkdirSync(dir, { recursive: true });
      } catch (error) {
        // Ignore error
      }
    }

    this.db = new Database(path);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS siwx_entitlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource TEXT NOT NULL,
        address TEXT NOT NULL,
        chain_id TEXT,
        paid_at INTEGER NOT NULL,
        UNIQUE(resource, address)
      )
    `);
    this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_siwx_entitlements_resource_address ON siwx_entitlements(resource, address)'
    );
    this.db.run(`
      CREATE TABLE IF NOT EXISTS siwx_nonces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nonce TEXT NOT NULL UNIQUE,
        resource TEXT,
        address TEXT,
        used_at INTEGER NOT NULL,
        expires_at INTEGER
      )
    `);
    this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_siwx_nonces_nonce ON siwx_nonces(nonce)'
    );
  }

  async hasPaid(resource: string, address: string): Promise<boolean> {
    const stmt = this.db.prepare(
      'SELECT 1 FROM siwx_entitlements WHERE resource = ? AND address = ?'
    );
    const row = stmt.get(resource, address.toLowerCase());
    return Promise.resolve(row !== null);
  }

  async recordPayment(
    resource: string,
    address: string,
    chainId?: string
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO siwx_entitlements (resource, address, chain_id, paid_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(resource, address.toLowerCase(), chainId ?? null, Date.now());
    return Promise.resolve();
  }

  async hasUsedNonce(nonce: string): Promise<boolean> {
    const stmt = this.db.prepare(
      'SELECT 1 FROM siwx_nonces WHERE nonce = ?'
    );
    const row = stmt.get(nonce);
    return Promise.resolve(row !== null);
  }

  async recordNonce(
    nonce: string,
    metadata?: { resource?: string; address?: string; expiresAt?: number }
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO siwx_nonces (nonce, resource, address, used_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      nonce,
      metadata?.resource ?? null,
      metadata?.address ?? null,
      Date.now(),
      metadata?.expiresAt ?? null
    );
    return Promise.resolve();
  }

  async consumeNonce(
    nonce: string,
    metadata?: { resource?: string; address?: string; expiresAt?: number }
  ): Promise<'consumed' | 'already_used'> {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO siwx_nonces (nonce, resource, address, used_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      nonce,
      metadata?.resource ?? null,
      metadata?.address ?? null,
      Date.now(),
      metadata?.expiresAt ?? null
    );
    return result.changes > 0 ? 'consumed' : 'already_used';
  }

  async clear(): Promise<void> {
    this.db.run('DELETE FROM siwx_entitlements');
    this.db.run('DELETE FROM siwx_nonces');
    return Promise.resolve();
  }

  /**
   * Closes the database connection.
   * Should be called when the storage is no longer needed.
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Creates a new SQLite SIWX storage instance.
 * @param dbPath - Optional custom database path (defaults to `.data/siwx.db`)
 * @returns A new SQLiteSIWxStorage instance
 * @throws Error if not running in Bun runtime
 */
export function createSQLiteSIWxStorage(dbPath?: string): SIWxStorage {
  return new SQLiteSIWxStorage(dbPath);
}
