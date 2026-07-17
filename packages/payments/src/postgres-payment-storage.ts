import { Pool, type PoolClient } from 'pg';
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
 * Postgres payment storage implementation.
 * For serverless with persistence needs, multi-agent deployments.
 */
export class PostgresPaymentStorage implements PaymentStorage {
  private pool: Pool;
  private schemaInitialized = false;
  private agentId?: string;

  constructor(connectionString: string, agentId?: string) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    this.agentId = agentId;
  }

  private async initSchema(): Promise<void> {
    if (this.schemaInitialized) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          agent_id TEXT,
          group_name VARCHAR NOT NULL,
          scope VARCHAR NOT NULL,
          direction VARCHAR NOT NULL,
          amount BIGINT NOT NULL,
          timestamp BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_agent_group_scope ON payments(agent_id, group_name, scope) WHERE agent_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_group_scope ON payments(group_name, scope);
        CREATE INDEX IF NOT EXISTS idx_timestamp ON payments(timestamp);
        CREATE INDEX IF NOT EXISTS idx_direction ON payments(direction);
        CREATE TABLE IF NOT EXISTS payment_reservations (
          reservation_id TEXT PRIMARY KEY,
          agent_id TEXT,
          group_name VARCHAR NOT NULL,
          scope VARCHAR NOT NULL,
          direction VARCHAR NOT NULL,
          amount BIGINT NOT NULL,
          timestamp BIGINT NOT NULL,
          expires_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_payment_reservation_scope
          ON payment_reservations(agent_id, group_name, scope, direction, timestamp);
        CREATE INDEX IF NOT EXISTS idx_payment_reservation_expiry
          ON payment_reservations(expires_at);
        CREATE TABLE IF NOT EXISTS payment_settlement_entries (
          entry_id TEXT PRIMARY KEY,
          settlement_id TEXT NOT NULL,
          agent_id TEXT,
          group_name VARCHAR NOT NULL,
          scope VARCHAR NOT NULL,
          direction VARCHAR NOT NULL,
          amount BIGINT NOT NULL,
          timestamp BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_payment_settlement_id
          ON payment_settlement_entries(agent_id, settlement_id);
        CREATE INDEX IF NOT EXISTS idx_payment_settlement_scope
          ON payment_settlement_entries(agent_id, group_name, scope, direction, timestamp);
      `);
      this.schemaInitialized = true;
    } finally {
      client.release();
    }
  }

  async recordPayment(
    record: Omit<PaymentRecord, 'id' | 'timestamp'>
  ): Promise<void> {
    if (!this.schemaInitialized) {
      await this.initSchema();
    }

    try {
      if (this.agentId) {
        await this.pool.query(
          `
          INSERT INTO payments (agent_id, group_name, scope, direction, amount, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
          [
            this.agentId,
            record.groupName,
            record.scope,
            record.direction,
            record.amount.toString(),
            Date.now(),
          ]
        );
      } else {
        await this.pool.query(
          `
          INSERT INTO payments (agent_id, group_name, scope, direction, amount, timestamp)
          VALUES (NULL, $1, $2, $3, $4, $5)
        `,
          [
            record.groupName,
            record.scope,
            record.direction,
            record.amount.toString(),
            Date.now(),
          ]
        );
      }
    } catch (error) {
      console.error('[PostgresPaymentStorage] Error recording payment:', error);
      throw error;
    }
  }

  async getTotal(
    groupName: string,
    scope: string,
    direction: PaymentDirection,
    windowMs?: number
  ): Promise<bigint> {
    try {
      if (!this.schemaInitialized) {
        await this.initSchema();
      }
      const cutoff = windowMs === undefined ? null : Date.now() - windowMs;
      const queryResult = this.agentId
        ? await this.pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM (
               SELECT amount, timestamp FROM payments
               WHERE agent_id = $1 AND group_name = $2 AND scope = $3 AND direction = $4
               UNION ALL
               SELECT amount, timestamp FROM payment_settlement_entries
               WHERE agent_id = $1 AND group_name = $2 AND scope = $3 AND direction = $4
             ) accounted
             WHERE ($5::bigint IS NULL OR timestamp > $5)`,
            [this.agentId, groupName, scope, direction, cutoff]
          )
        : await this.pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM (
               SELECT amount, timestamp FROM payments
               WHERE agent_id IS NULL AND group_name = $1 AND scope = $2 AND direction = $3
               UNION ALL
               SELECT amount, timestamp FROM payment_settlement_entries
               WHERE agent_id IS NULL AND group_name = $1 AND scope = $2 AND direction = $3
             ) accounted
             WHERE ($4::bigint IS NULL OR timestamp > $4)`,
            [groupName, scope, direction, cutoff]
          );
      const total = queryResult.rows[0]?.total;
      return total ? BigInt(total) : 0n;
    } catch (error) {
      console.error('[PostgresPaymentStorage] Error getting total:', error);
      throw error;
    }
  }

  async getAllRecords(
    groupName?: string,
    scope?: string,
    direction?: PaymentDirection,
    windowMs?: number
  ): Promise<PaymentRecord[]> {
    try {
      if (!this.schemaInitialized) {
        await this.initSchema();
      }

      let query = 'SELECT * FROM payments WHERE 1=1';
      const params: unknown[] = [];
      let paramIndex = 1;

      if (this.agentId) {
        query += ` AND agent_id = $${paramIndex}`;
        params.push(this.agentId);
        paramIndex++;
      } else {
        query += ` AND agent_id IS NULL`;
      }
      if (groupName) {
        query += ` AND group_name = $${paramIndex}`;
        params.push(groupName);
        paramIndex++;
      }
      if (scope) {
        query += ` AND scope = $${paramIndex}`;
        params.push(scope);
        paramIndex++;
      }
      if (direction) {
        query += ` AND direction = $${paramIndex}`;
        params.push(direction);
        paramIndex++;
      }
      if (windowMs !== undefined) {
        query += ` AND timestamp > $${paramIndex}`;
        params.push(Date.now() - windowMs);
        paramIndex++;
      }

      query += ' ORDER BY timestamp DESC';

      const queryResult = await this.pool.query(query, params);

      return queryResult.rows.map(row => ({
        id: row.id,
        groupName: row.group_name,
        scope: row.scope,
        direction: row.direction as PaymentDirection,
        amount: BigInt(row.amount),
        timestamp: Number(row.timestamp),
      }));
    } catch (error) {
      console.error('[PostgresPaymentStorage] Error getting records:', error);
      throw error;
    }
  }

  private async lockReservationScope(
    client: PoolClient,
    groupName: string,
    scope: string,
    direction: PaymentDirection
  ): Promise<void> {
    const key = JSON.stringify([
      this.agentId ?? null,
      groupName,
      scope,
      direction,
    ]);
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [key]
    );
  }

  async reservePaymentLimit(
    reservation: PaymentLimitReservation
  ): Promise<PaymentLimitReservationResult> {
    if (!this.schemaInitialized) await this.initSchema();
    const client = await this.pool.connect();
    const now = Date.now();
    const cutoff =
      reservation.windowMs === undefined ? null : now - reservation.windowMs;
    const reservationId = crypto.randomUUID();

    try {
      await client.query('BEGIN');
      await this.lockReservationScope(
        client,
        reservation.groupName,
        reservation.scope,
        reservation.direction
      );

      if (this.agentId) {
        await client.query(
          'DELETE FROM payment_reservations WHERE agent_id = $1 AND expires_at <= $2',
          [this.agentId, now]
        );
      } else {
        await client.query(
          'DELETE FROM payment_reservations WHERE agent_id IS NULL AND expires_at <= $1',
          [now]
        );
      }

      const paymentResult = this.agentId
        ? await client.query(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
             WHERE agent_id = $1 AND group_name = $2 AND scope = $3
               AND direction = $4
               AND ($5::bigint IS NULL OR timestamp > $5)`,
            [
              this.agentId,
              reservation.groupName,
              reservation.scope,
              reservation.direction,
              cutoff,
            ]
          )
        : await client.query(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
             WHERE agent_id IS NULL AND group_name = $1 AND scope = $2
               AND direction = $3
               AND ($4::bigint IS NULL OR timestamp > $4)`,
            [
              reservation.groupName,
              reservation.scope,
              reservation.direction,
              cutoff,
            ]
          );
      const pendingResult = this.agentId
        ? await client.query(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_reservations
             WHERE agent_id = $1 AND group_name = $2 AND scope = $3
               AND direction = $4 AND expires_at > $5
               AND ($6::bigint IS NULL OR timestamp > $6)`,
            [
              this.agentId,
              reservation.groupName,
              reservation.scope,
              reservation.direction,
              now,
              cutoff,
            ]
          )
        : await client.query(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_reservations
             WHERE agent_id IS NULL AND group_name = $1 AND scope = $2
               AND direction = $3 AND expires_at > $4
               AND ($5::bigint IS NULL OR timestamp > $5)`,
            [
              reservation.groupName,
              reservation.scope,
              reservation.direction,
              now,
              cutoff,
            ]
          );
      const settlementResult = this.agentId
        ? await client.query(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_settlement_entries
             WHERE agent_id = $1 AND group_name = $2 AND scope = $3
               AND direction = $4
               AND ($5::bigint IS NULL OR timestamp > $5)`,
            [
              this.agentId,
              reservation.groupName,
              reservation.scope,
              reservation.direction,
              cutoff,
            ]
          )
        : await client.query(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_settlement_entries
             WHERE agent_id IS NULL AND group_name = $1 AND scope = $2
               AND direction = $3
               AND ($4::bigint IS NULL OR timestamp > $4)`,
            [
              reservation.groupName,
              reservation.scope,
              reservation.direction,
              cutoff,
            ]
          );
      const total =
        BigInt(paymentResult.rows[0]?.total ?? 0) +
        BigInt(pendingResult.rows[0]?.total ?? 0) +
        BigInt(settlementResult.rows[0]?.total ?? 0);
      if (total + reservation.amount > reservation.maxTotal) {
        await client.query('COMMIT');
        return { allowed: false };
      }

      await client.query(
        `INSERT INTO payment_reservations
          (reservation_id, agent_id, group_name, scope, direction, amount, timestamp, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          reservationId,
          this.agentId ?? null,
          reservation.groupName,
          reservation.scope,
          reservation.direction,
          reservation.amount.toString(),
          now,
          now + reservation.ttlMs,
        ]
      );
      await client.query('COMMIT');
      return { allowed: true, reservationId };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
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
    if (!this.schemaInitialized) await this.initSchema();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      type ReservationRow = {
        group_name: string;
        scope: string;
        direction: PaymentDirection;
        amount: string;
        expires_at: string | number;
      };
      const reservations: ReservationRow[] = [];
      const sortedIds = [...reservationIds].sort();
      const now = Date.now();
      for (const reservationId of sortedIds) {
        const result = this.agentId
          ? await client.query(
              `SELECT group_name, scope, direction, amount, expires_at
               FROM payment_reservations
               WHERE reservation_id = $1 AND agent_id = $2 FOR UPDATE`,
              [reservationId, this.agentId]
            )
          : await client.query(
              `SELECT group_name, scope, direction, amount, expires_at
               FROM payment_reservations
               WHERE reservation_id = $1 AND agent_id IS NULL FOR UPDATE`,
              [reservationId]
            );
        const row = result.rows[0] as ReservationRow | undefined;
        if (!row || Number(row.expires_at) <= now) {
          if (row) {
            if (this.agentId) {
              await client.query(
                'DELETE FROM payment_reservations WHERE reservation_id = $1 AND agent_id = $2',
                [reservationId, this.agentId]
              );
            } else {
              await client.query(
                'DELETE FROM payment_reservations WHERE reservation_id = $1 AND agent_id IS NULL',
                [reservationId]
              );
            }
          }
          await client.query('COMMIT');
          return false;
        }
        reservations.push(row);
      }

      const scopes = new Map<string, ReservationRow>();
      for (const row of reservations) {
        scopes.set(
          JSON.stringify([row.group_name, row.scope, row.direction]),
          row
        );
      }
      for (const key of [...scopes.keys()].sort()) {
        const row = scopes.get(key)!;
        await this.lockReservationScope(
          client,
          row.group_name,
          row.scope,
          row.direction
        );
      }

      for (const record of [
        ...reservations.map(row => ({
          groupName: row.group_name,
          scope: row.scope,
          direction: row.direction,
          amount: row.amount,
        })),
        ...records.map(record => ({
          ...record,
          amount: record.amount.toString(),
        })),
      ]) {
        await client.query(
          `INSERT INTO payments
            (agent_id, group_name, scope, direction, amount, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            this.agentId ?? null,
            record.groupName,
            record.scope,
            record.direction,
            record.amount,
            now,
          ]
        );
      }
      for (const reservationId of sortedIds) {
        if (this.agentId) {
          await client.query(
            'DELETE FROM payment_reservations WHERE reservation_id = $1 AND agent_id = $2',
            [reservationId, this.agentId]
          );
        } else {
          await client.query(
            'DELETE FROM payment_reservations WHERE reservation_id = $1 AND agent_id IS NULL',
            [reservationId]
          );
        }
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
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
    if (!this.schemaInitialized) await this.initSchema();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      type ReservationRow = {
        group_name: string;
        scope: string;
        direction: PaymentDirection;
        amount: string;
        expires_at: string | number;
      };
      const reservations: ReservationRow[] = [];
      const sortedIds = [...reservationIds].sort();
      const now = Date.now();
      for (const reservationId of sortedIds) {
        const result = this.agentId
          ? await client.query(
              `SELECT group_name, scope, direction, amount, expires_at
               FROM payment_reservations
               WHERE reservation_id = $1 AND agent_id = $2 FOR UPDATE`,
              [reservationId, this.agentId]
            )
          : await client.query(
              `SELECT group_name, scope, direction, amount, expires_at
               FROM payment_reservations
               WHERE reservation_id = $1 AND agent_id IS NULL FOR UPDATE`,
              [reservationId]
            );
        const row = result.rows[0] as ReservationRow | undefined;
        if (!row || Number(row.expires_at) <= now) {
          if (row) {
            if (this.agentId) {
              await client.query(
                'DELETE FROM payment_reservations WHERE reservation_id = $1 AND agent_id = $2',
                [reservationId, this.agentId]
              );
            } else {
              await client.query(
                'DELETE FROM payment_reservations WHERE reservation_id = $1 AND agent_id IS NULL',
                [reservationId]
              );
            }
          }
          await client.query('COMMIT');
          return undefined;
        }
        reservations.push(row);
      }

      const entries = [
        ...reservations.map(row => ({
          groupName: row.group_name,
          scope: row.scope,
          direction: row.direction,
          amount: row.amount,
        })),
        ...records.map(record => ({
          ...record,
          amount: record.amount.toString(),
        })),
      ];
      const scopes = new Map<string, (typeof entries)[number]>();
      for (const entry of entries) {
        scopes.set(
          JSON.stringify([entry.groupName, entry.scope, entry.direction]),
          entry
        );
      }
      for (const key of [...scopes.keys()].sort()) {
        const entry = scopes.get(key)!;
        await this.lockReservationScope(
          client,
          entry.groupName,
          entry.scope,
          entry.direction
        );
      }

      const settlementId = crypto.randomUUID();
      for (const entry of entries) {
        await client.query(
          `INSERT INTO payment_settlement_entries
            (entry_id, settlement_id, agent_id, group_name, scope, direction, amount, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            crypto.randomUUID(),
            settlementId,
            this.agentId ?? null,
            entry.groupName,
            entry.scope,
            entry.direction,
            entry.amount,
            now,
          ]
        );
      }
      for (const reservationId of sortedIds) {
        if (this.agentId) {
          await client.query(
            'DELETE FROM payment_reservations WHERE reservation_id = $1 AND agent_id = $2',
            [reservationId, this.agentId]
          );
        } else {
          await client.query(
            'DELETE FROM payment_reservations WHERE reservation_id = $1 AND agent_id IS NULL',
            [reservationId]
          );
        }
      }
      await client.query('COMMIT');
      return settlementId;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async commitPaymentSettlement(settlementId: string): Promise<boolean> {
    if (!this.schemaInitialized) await this.initSchema();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      type SettlementRow = {
        group_name: string;
        scope: string;
        direction: PaymentDirection;
        amount: string;
        timestamp: string | number;
      };
      const result = this.agentId
        ? await client.query(
            `SELECT group_name, scope, direction, amount, timestamp
             FROM payment_settlement_entries
             WHERE settlement_id = $1 AND agent_id = $2 FOR UPDATE`,
            [settlementId, this.agentId]
          )
        : await client.query(
            `SELECT group_name, scope, direction, amount, timestamp
             FROM payment_settlement_entries
             WHERE settlement_id = $1 AND agent_id IS NULL FOR UPDATE`,
            [settlementId]
          );
      const entries = result.rows as SettlementRow[];
      if (entries.length === 0) {
        await client.query('COMMIT');
        return false;
      }

      const scopes = new Map<string, SettlementRow>();
      for (const entry of entries) {
        scopes.set(
          JSON.stringify([entry.group_name, entry.scope, entry.direction]),
          entry
        );
      }
      for (const key of [...scopes.keys()].sort()) {
        const entry = scopes.get(key)!;
        await this.lockReservationScope(
          client,
          entry.group_name,
          entry.scope,
          entry.direction
        );
      }

      for (const entry of entries) {
        await client.query(
          `INSERT INTO payments
            (agent_id, group_name, scope, direction, amount, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            this.agentId ?? null,
            entry.group_name,
            entry.scope,
            entry.direction,
            entry.amount,
            entry.timestamp,
          ]
        );
      }
      if (this.agentId) {
        await client.query(
          'DELETE FROM payment_settlement_entries WHERE settlement_id = $1 AND agent_id = $2',
          [settlementId, this.agentId]
        );
      } else {
        await client.query(
          'DELETE FROM payment_settlement_entries WHERE settlement_id = $1 AND agent_id IS NULL',
          [settlementId]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async releasePaymentSettlement(settlementId: string): Promise<void> {
    if (!this.schemaInitialized) await this.initSchema();
    if (this.agentId) {
      await this.pool.query(
        'DELETE FROM payment_settlement_entries WHERE settlement_id = $1 AND agent_id = $2',
        [settlementId, this.agentId]
      );
      return;
    }
    await this.pool.query(
      'DELETE FROM payment_settlement_entries WHERE settlement_id = $1 AND agent_id IS NULL',
      [settlementId]
    );
  }

  async releasePaymentReservation(reservationId: string): Promise<void> {
    if (!this.schemaInitialized) await this.initSchema();
    if (this.agentId) {
      await this.pool.query(
        'DELETE FROM payment_reservations WHERE reservation_id = $1 AND agent_id = $2',
        [reservationId, this.agentId]
      );
      return;
    }
    await this.pool.query(
      'DELETE FROM payment_reservations WHERE reservation_id = $1 AND agent_id IS NULL',
      [reservationId]
    );
  }

  async clear(): Promise<void> {
    try {
      if (!this.schemaInitialized) {
        await this.initSchema();
      }
      if (this.agentId) {
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM payments WHERE agent_id = $1', [
            this.agentId,
          ]);
          await client.query(
            'DELETE FROM payment_reservations WHERE agent_id = $1',
            [this.agentId]
          );
          await client.query(
            'DELETE FROM payment_settlement_entries WHERE agent_id = $1',
            [this.agentId]
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
      } else {
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM payments WHERE agent_id IS NULL');
          await client.query(
            'DELETE FROM payment_reservations WHERE agent_id IS NULL'
          );
          await client.query(
            'DELETE FROM payment_settlement_entries WHERE agent_id IS NULL'
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
      }
    } catch (error) {
      console.error('[PostgresPaymentStorage] Error clearing payments:', error);
      throw error;
    }
  }

  /**
   * Closes the connection pool.
   * Should be called when the storage is no longer needed.
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Creates a new Postgres payment storage instance.
 * @param connectionString - Postgres connection string
 * @param agentId - Optional agent ID for multi-agent platforms (filters transactions by agent)
 * @returns A new PostgresPaymentStorage instance
 */
export function createPostgresPaymentStorage(
  connectionString: string,
  agentId?: string
): PaymentStorage {
  return new PostgresPaymentStorage(connectionString, agentId);
}
