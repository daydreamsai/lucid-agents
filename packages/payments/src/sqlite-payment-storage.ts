import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { Database } from 'bun:sqlite';
import type {
  PaymentRecord,
  PaymentDirection,
} from '@lucid-agents/types/payments';
import type { PaymentStorage } from './payment-storage';

/**
 * SQLite payment storage implementation using Bun's native SQLite.
 * Default storage - persistent, zero configuration, auto-creates database.
 * Requires Bun runtime.
 */
export class SQLitePaymentStorage implements PaymentStorage {
  private db: Database;

  constructor(dbPath?: string, agentId?: string) {
    if (typeof Bun === 'undefined') {
      throw new Error(
        'SQLitePaymentStorage requires Bun runtime. Use PostgresPaymentStorage or InMemoryPaymentStorage for Node.js.'
      );
    }

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
    // Note: agentId is stored but not used for SQLite (single-agent per DB)
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT,
        group_name TEXT NOT NULL,
        scope TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_group_scope ON payments(agent_id, group_name, scope) WHERE agent_id IS NOT NULL;
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

    let stmt: ReturnType<typeof this.db.prepare>;
    if (windowMs !== undefined) {
      query += ' AND timestamp > ?';
      stmt = this.db.prepare(query);
      const rows = stmt.all(
        groupName,
        scope,
        direction,
        Date.now() - windowMs
      ) as Array<{ amount: string }>;
      const total = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
      return Promise.resolve(total);
    } else {
      stmt = this.db.prepare(query);
      const rows = stmt.all(groupName, scope, direction) as Array<{
        amount: string;
      }>;
      const total = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
      return Promise.resolve(total);
    }
  }

  async getAllRecords(
    groupName?: string,
    scope?: string,
    direction?: PaymentDirection,
    windowMs?: number
  ): Promise<PaymentRecord[]> {
    let query = 'SELECT * FROM payments WHERE 1=1';
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (groupName) {
      conditions.push('group_name = ?');
      params.push(groupName);
    }
    if (scope) {
      conditions.push('scope = ?');
      params.push(scope);
    }
    if (direction) {
      conditions.push('direction = ?');
      params.push(direction);
    }
    if (windowMs !== undefined) {
      conditions.push('timestamp > ?');
      params.push(Date.now() - windowMs);
    }

    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC';

    const stmt = this.db.prepare(query);
    // Bun's SQLite all() returns unknown[], so we type the result based on our query schema
    // This is safe because we control the query and know the row structure
    type SQLiteRow = {
      id: number;
      agent_id?: string | null;
      group_name: string;
      scope: string;
      direction: string;
      amount: string;
      timestamp: number;
    };

    let result: unknown[];
    if (params.length === 0) {
      result = stmt.all();
    } else if (params.length === 1) {
      result = stmt.all(params[0]);
    } else if (params.length === 2) {
      result = stmt.all(params[0], params[1]);
    } else if (params.length === 3) {
      result = stmt.all(params[0], params[1], params[2]);
    } else {
      result = stmt.all(params[0], params[1], params[2], params[3]);
    }

    // Type assertion is necessary here because Bun's SQLite returns unknown[]
    // We know the structure from our query, so this is safe
    const rows = result as SQLiteRow[];

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
 * @param agentId - Optional agent ID (not used for SQLite, kept for API consistency)
 * @returns A new SQLitePaymentStorage instance
 * @throws Error if not running in Bun runtime
 */
export function createSQLitePaymentStorage(
  dbPath?: string,
  agentId?: string
): PaymentStorage {
  return new SQLitePaymentStorage(dbPath, agentId);
}
