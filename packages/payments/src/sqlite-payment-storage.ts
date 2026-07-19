import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { Database } from 'bun:sqlite';
import type {
  PaymentRecord,
  PaymentDirection,
} from '@lucid-agents/types/payments';
import type { PaymentStorage } from './payment-storage';
import type {
  PaymentAccountingRecord,
  PaymentLimitReservation,
  PaymentLimitReservationResult,
} from './payment-storage';

/**
 * SQLite payment storage implementation using Bun's native SQLite.
 * Default storage - persistent, zero configuration, auto-creates database.
 * Requires Bun runtime.
 */
export class SQLitePaymentStorage implements PaymentStorage {
  private db: Database;

  constructor(dbPath?: string, _agentId?: string) {
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
    this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    this.initSchema();
    // SQLite uses one database per agent, so the compatibility argument is unused.
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
      CREATE TABLE IF NOT EXISTS payment_reservations (
        reservation_id TEXT PRIMARY KEY,
        group_name TEXT NOT NULL,
        scope TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_payment_reservation_scope
        ON payment_reservations(group_name, scope, direction, timestamp);
      CREATE INDEX IF NOT EXISTS idx_payment_reservation_expiry
        ON payment_reservations(expires_at);
      CREATE TABLE IF NOT EXISTS payment_settlement_entries (
        entry_id TEXT PRIMARY KEY,
        settlement_id TEXT NOT NULL,
        group_name TEXT NOT NULL,
        scope TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_payment_settlement_id
        ON payment_settlement_entries(settlement_id);
      CREATE INDEX IF NOT EXISTS idx_payment_settlement_scope
        ON payment_settlement_entries(group_name, scope, direction, timestamp);
    `);
  }

  private beginImmediate(): void {
    this.db.exec('BEGIN IMMEDIATE');
  }

  private rollback(): void {
    try {
      this.db.exec('ROLLBACK');
    } catch {
      // The transaction may already have ended.
    }
  }

  async recordPayment(
    record: Omit<PaymentRecord, 'id' | 'timestamp'>
  ): Promise<void> {
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
    const cutoff = windowMs === undefined ? undefined : Date.now() - windowMs;
    const query = `
      SELECT amount FROM payments
      WHERE group_name = ? AND scope = ? AND direction = ?
        ${cutoff === undefined ? '' : 'AND timestamp > ?'}
      UNION ALL
      SELECT amount FROM payment_settlement_entries
      WHERE group_name = ? AND scope = ? AND direction = ?
        ${cutoff === undefined ? '' : 'AND timestamp > ?'}
    `;
    const stmt = this.db.prepare(query);
    if (windowMs !== undefined) {
      const rows = stmt.all(
        groupName,
        scope,
        direction,
        cutoff!,
        groupName,
        scope,
        direction,
        cutoff!
      ) as Array<{ amount: string }>;
      const total = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
      return Promise.resolve(total);
    } else {
      const rows = stmt.all(
        groupName,
        scope,
        direction,
        groupName,
        scope,
        direction
      ) as Array<{ amount: string }>;
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

  async reservePaymentLimit(
    reservation: PaymentLimitReservation
  ): Promise<PaymentLimitReservationResult> {
    const now = Date.now();
    const cutoff =
      reservation.windowMs === undefined
        ? undefined
        : now - reservation.windowMs;
    const reservationId = crypto.randomUUID();

    this.beginImmediate();
    try {
      this.db
        .prepare('DELETE FROM payment_reservations WHERE expires_at <= ?')
        .run(now);

      const paymentQuery = `
        SELECT amount FROM payments
        WHERE group_name = ? AND scope = ? AND direction = ?
        ${cutoff === undefined ? '' : 'AND timestamp > ?'}
      `;
      const paymentStatement = this.db.prepare(paymentQuery);
      const paymentRows = (
        cutoff === undefined
          ? paymentStatement.all(
              reservation.groupName,
              reservation.scope,
              reservation.direction
            )
          : paymentStatement.all(
              reservation.groupName,
              reservation.scope,
              reservation.direction,
              cutoff
            )
      ) as Array<{ amount: string }>;

      const reservationQuery = `
        SELECT amount FROM payment_reservations
        WHERE group_name = ? AND scope = ? AND direction = ?
          AND expires_at > ?
        ${cutoff === undefined ? '' : 'AND timestamp > ?'}
      `;
      const reservationStatement = this.db.prepare(reservationQuery);
      const reservationRows = (
        cutoff === undefined
          ? reservationStatement.all(
              reservation.groupName,
              reservation.scope,
              reservation.direction,
              now
            )
          : reservationStatement.all(
              reservation.groupName,
              reservation.scope,
              reservation.direction,
              now,
              cutoff
            )
      ) as Array<{ amount: string }>;
      const settlementQuery = `
        SELECT amount FROM payment_settlement_entries
        WHERE group_name = ? AND scope = ? AND direction = ?
        ${cutoff === undefined ? '' : 'AND timestamp > ?'}
      `;
      const settlementStatement = this.db.prepare(settlementQuery);
      const settlementRows = (
        cutoff === undefined
          ? settlementStatement.all(
              reservation.groupName,
              reservation.scope,
              reservation.direction
            )
          : settlementStatement.all(
              reservation.groupName,
              reservation.scope,
              reservation.direction,
              cutoff
            )
      ) as Array<{ amount: string }>;
      const total = [
        ...paymentRows,
        ...reservationRows,
        ...settlementRows,
      ].reduce((sum, row) => sum + BigInt(row.amount), 0n);

      if (total + reservation.amount > reservation.maxTotal) {
        this.db.exec('COMMIT');
        return { allowed: false };
      }

      this.db
        .prepare(
          `
          INSERT INTO payment_reservations
            (reservation_id, group_name, scope, direction, amount, timestamp, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          reservationId,
          reservation.groupName,
          reservation.scope,
          reservation.direction,
          reservation.amount.toString(),
          now,
          now + reservation.ttlMs
        );
      this.db.exec('COMMIT');
      return { allowed: true, reservationId };
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  async commitPaymentReservation(reservationId: string): Promise<boolean> {
    return this.commitPaymentReservations([reservationId]);
  }

  async commitPaymentReservations(
    reservationIds: readonly string[],
    records: readonly PaymentAccountingRecord[] = []
  ): Promise<boolean> {
    if (new Set(reservationIds).size !== reservationIds.length) return false;
    this.beginImmediate();
    try {
      const now = Date.now();
      const select = this.db.prepare(`
          SELECT group_name, scope, direction, amount, expires_at
          FROM payment_reservations WHERE reservation_id = ?
        `);
      type ReservationRow = {
        group_name: string;
        scope: string;
        direction: PaymentDirection;
        amount: string;
        expires_at: number;
      };
      const reservations = reservationIds.map(
        id => select.get(id) as ReservationRow | null
      );
      if (reservations.some(row => !row || row.expires_at <= now)) {
        this.db
          .prepare('DELETE FROM payment_reservations WHERE expires_at <= ?')
          .run(now);
        this.db.exec('COMMIT');
        return false;
      }
      const liveReservations = reservations.filter(
        (row): row is ReservationRow => row !== null
      );

      const insert = this.db.prepare(`
          INSERT INTO payments (group_name, scope, direction, amount, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `);
      for (const row of liveReservations) {
        insert.run(row.group_name, row.scope, row.direction, row.amount, now);
      }
      for (const record of records) {
        insert.run(
          record.groupName,
          record.scope,
          record.direction,
          record.amount.toString(),
          now
        );
      }
      const remove = this.db.prepare(
        'DELETE FROM payment_reservations WHERE reservation_id = ?'
      );
      for (const id of reservationIds) remove.run(id);
      this.db.exec('COMMIT');
      return true;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  async stagePaymentSettlement(
    reservationIds: readonly string[],
    records: readonly PaymentAccountingRecord[] = []
  ): Promise<string | undefined> {
    if (
      new Set(reservationIds).size !== reservationIds.length ||
      (reservationIds.length === 0 && records.length === 0)
    ) {
      return undefined;
    }
    this.beginImmediate();
    try {
      const now = Date.now();
      const select = this.db.prepare(`
        SELECT group_name, scope, direction, amount, expires_at
        FROM payment_reservations WHERE reservation_id = ?
      `);
      type ReservationRow = {
        group_name: string;
        scope: string;
        direction: PaymentDirection;
        amount: string;
        expires_at: number;
      };
      const reservations = reservationIds.map(
        id => select.get(id) as ReservationRow | null
      );
      if (reservations.some(row => !row || row.expires_at <= now)) {
        this.db
          .prepare('DELETE FROM payment_reservations WHERE expires_at <= ?')
          .run(now);
        this.db.exec('COMMIT');
        return undefined;
      }

      const settlementId = crypto.randomUUID();
      const insert = this.db.prepare(`
        INSERT INTO payment_settlement_entries
          (entry_id, settlement_id, group_name, scope, direction, amount, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const row of reservations) {
        insert.run(
          crypto.randomUUID(),
          settlementId,
          row!.group_name,
          row!.scope,
          row!.direction,
          row!.amount,
          now
        );
      }
      for (const record of records) {
        insert.run(
          crypto.randomUUID(),
          settlementId,
          record.groupName,
          record.scope,
          record.direction,
          record.amount.toString(),
          now
        );
      }
      const remove = this.db.prepare(
        'DELETE FROM payment_reservations WHERE reservation_id = ?'
      );
      for (const id of reservationIds) remove.run(id);
      this.db.exec('COMMIT');
      return settlementId;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  async commitPaymentSettlement(settlementId: string): Promise<boolean> {
    this.beginImmediate();
    try {
      type SettlementRow = {
        group_name: string;
        scope: string;
        direction: PaymentDirection;
        amount: string;
        timestamp: number;
      };
      const entries = this.db
        .prepare(
          `SELECT group_name, scope, direction, amount, timestamp
           FROM payment_settlement_entries WHERE settlement_id = ?`
        )
        .all(settlementId) as SettlementRow[];
      if (entries.length === 0) {
        this.db.exec('COMMIT');
        return false;
      }
      const insert = this.db.prepare(`
        INSERT INTO payments (group_name, scope, direction, amount, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const entry of entries) {
        insert.run(
          entry.group_name,
          entry.scope,
          entry.direction,
          entry.amount,
          entry.timestamp
        );
      }
      this.db
        .prepare(
          'DELETE FROM payment_settlement_entries WHERE settlement_id = ?'
        )
        .run(settlementId);
      this.db.exec('COMMIT');
      return true;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  async releasePaymentSettlement(settlementId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM payment_settlement_entries WHERE settlement_id = ?')
      .run(settlementId);
  }

  async releasePaymentReservation(reservationId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM payment_reservations WHERE reservation_id = ?')
      .run(reservationId);
  }

  async clear(): Promise<void> {
    this.db.exec(
      'DELETE FROM payments; DELETE FROM payment_reservations; DELETE FROM payment_settlement_entries;'
    );
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
