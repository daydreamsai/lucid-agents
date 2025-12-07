import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import type {
  PaymentRecord,
  PaymentDirection,
} from '@lucid-agents/types/payments';
import type { PaymentStorage } from './payment-storage';

/**
 * SQLite payment storage implementation.
 * Default storage - persistent, zero configuration, auto-creates database.
 */
export class SQLitePaymentStorage implements PaymentStorage {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath ?? '.data/payments.db';

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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_name TEXT NOT NULL,
        scope TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_group_scope ON payments(group_name, scope);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON payments(timestamp);
      CREATE INDEX IF NOT EXISTS idx_direction ON payments(direction);
    `);
  }

  async recordPayment(
    record: Omit<PaymentRecord, 'id' | 'timestamp'>
  ): Promise<void> {
    if (record.amount <= 0n) {
      return;
    }

    const stmt = this.db.prepare(`
      INSERT INTO payments (group_name, scope, direction, amount, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.groupName,
      record.scope,
      record.direction,
      record.amount.toString(),
      Date.now()
    );
    return Promise.resolve();
  }

  async getTotal(
    groupName: string,
    scope: string,
    direction: PaymentDirection,
    windowMs?: number
  ): Promise<bigint> {
    let query = `
      SELECT amount
      FROM payments
      WHERE group_name = ? AND scope = ? AND direction = ?
    `;

    const params: unknown[] = [groupName, scope, direction];

    if (windowMs !== undefined) {
      query += ' AND timestamp > ?';
      params.push(Date.now() - windowMs);
    }

    const rows = this.db.prepare(query).all(...params) as Array<{
      amount: string;
    }>;

    const total = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
    return Promise.resolve(total);
  }

  async getAllRecords(
    groupName?: string,
    scope?: string,
    direction?: PaymentDirection,
    windowMs?: number
  ): Promise<PaymentRecord[]> {
    let query = 'SELECT * FROM payments WHERE 1=1';
    const params: unknown[] = [];

    if (groupName) {
      query += ' AND group_name = ?';
      params.push(groupName);
    }
    if (scope) {
      query += ' AND scope = ?';
      params.push(scope);
    }
    if (direction) {
      query += ' AND direction = ?';
      params.push(direction);
    }
    if (windowMs !== undefined) {
      query += ' AND timestamp > ?';
      params.push(Date.now() - windowMs);
    }

    query += ' ORDER BY timestamp DESC';

    const rows = this.db.prepare(query).all(...params) as Array<{
      id: number;
      group_name: string;
      scope: string;
      direction: string;
      amount: string;
      timestamp: number;
    }>;

    return Promise.resolve(
      rows.map(row => ({
        id: row.id,
        groupName: row.group_name,
        scope: row.scope,
        direction: row.direction as PaymentDirection,
        amount: BigInt(row.amount),
        timestamp: row.timestamp,
      }))
    );
  }

  async clear(): Promise<void> {
    this.db.exec('DELETE FROM payments');
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
 * Creates a new SQLite payment storage instance.
 * @param dbPath - Optional custom database path (defaults to `.data/payments.db`)
 * @returns A new SQLitePaymentStorage instance
 */
export function createSQLitePaymentStorage(dbPath?: string): PaymentStorage {
  return new SQLitePaymentStorage(dbPath);
}
