import type {
  PaymentDirection,
  PaymentRecord,
} from '@lucid-agents/types/payments';
import { Pool } from 'pg';

import type { PaymentStorage } from './payment-storage';

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

      let query: string;
      const params: unknown[] = [];
      let paramIndex = 1;

      if (this.agentId) {
        query = `
          SELECT SUM(amount) as total
          FROM payments
          WHERE agent_id = $${paramIndex} AND group_name = $${paramIndex + 1} AND scope = $${paramIndex + 2} AND direction = $${paramIndex + 3}
        `;
        params.push(this.agentId, groupName, scope, direction);
        paramIndex += 4;
      } else {
        query = `
          SELECT SUM(amount) as total
          FROM payments
          WHERE agent_id IS NULL AND group_name = $${paramIndex} AND scope = $${paramIndex + 1} AND direction = $${paramIndex + 2}
        `;
        params.push(groupName, scope, direction);
        paramIndex += 3;
      }

      if (windowMs !== undefined) {
        query += ` AND timestamp > $${paramIndex}`;
        params.push(Date.now() - windowMs);
      }

      const queryResult = await this.pool.query(query, params);
      const total = queryResult.rows[0]?.total;
      return total ? BigInt(total) : 0n;
    } catch (error) {
      console.error('[PostgresPaymentStorage] Error getting total:', error);
      return 0n;
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
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      if (!this.schemaInitialized) {
        await this.initSchema();
      }
      if (this.agentId) {
        await this.pool.query('DELETE FROM payments WHERE agent_id = $1', [
          this.agentId,
        ]);
      } else {
        await this.pool.query('DELETE FROM payments');
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
