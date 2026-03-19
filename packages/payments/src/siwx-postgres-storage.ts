import { Pool } from 'pg';
import type { SIWxStorage } from './siwx-storage';

/**
 * Postgres SIWX storage implementation.
 * For serverless with persistence needs, multi-agent deployments.
 */
export class PostgresSIWxStorage implements SIWxStorage {
  private pool: Pool;
  private schemaInitialized = false;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  private async initSchema(): Promise<void> {
    if (this.schemaInitialized) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS siwx_entitlements (
          id SERIAL PRIMARY KEY,
          resource VARCHAR NOT NULL,
          address VARCHAR NOT NULL,
          chain_id VARCHAR,
          paid_at BIGINT NOT NULL,
          UNIQUE(resource, address)
        );
        CREATE INDEX IF NOT EXISTS idx_siwx_entitlements_resource_address ON siwx_entitlements(resource, address);

        CREATE TABLE IF NOT EXISTS siwx_nonces (
          id SERIAL PRIMARY KEY,
          nonce VARCHAR NOT NULL UNIQUE,
          resource VARCHAR,
          address VARCHAR,
          used_at BIGINT NOT NULL,
          expires_at BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_siwx_nonces_nonce ON siwx_nonces(nonce);
      `);
      this.schemaInitialized = true;
    } finally {
      client.release();
    }
  }

  async hasPaid(resource: string, address: string): Promise<boolean> {
    if (!this.schemaInitialized) {
      await this.initSchema();
    }

    try {
      const result = await this.pool.query(
        'SELECT 1 FROM siwx_entitlements WHERE resource = $1 AND address = $2',
        [resource, address.toLowerCase()]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('[PostgresSIWxStorage] Error checking payment:', error);
      throw error;
    }
  }

  async recordPayment(
    resource: string,
    address: string,
    chainId?: string
  ): Promise<void> {
    if (!this.schemaInitialized) {
      await this.initSchema();
    }

    try {
      await this.pool.query(
        `
        INSERT INTO siwx_entitlements (resource, address, chain_id, paid_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (resource, address) DO UPDATE SET
          chain_id = EXCLUDED.chain_id,
          paid_at = EXCLUDED.paid_at
        `,
        [resource, address.toLowerCase(), chainId ?? null, Date.now()]
      );
    } catch (error) {
      console.error('[PostgresSIWxStorage] Error recording payment:', error);
      throw error;
    }
  }

  async hasUsedNonce(nonce: string): Promise<boolean> {
    if (!this.schemaInitialized) {
      await this.initSchema();
    }

    try {
      const result = await this.pool.query(
        'SELECT 1 FROM siwx_nonces WHERE nonce = $1',
        [nonce]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('[PostgresSIWxStorage] Error checking nonce:', error);
      throw error;
    }
  }

  async recordNonce(
    nonce: string,
    metadata?: { resource?: string; address?: string; expiresAt?: number }
  ): Promise<void> {
    if (!this.schemaInitialized) {
      await this.initSchema();
    }

    try {
      await this.pool.query(
        `
        INSERT INTO siwx_nonces (nonce, resource, address, used_at, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (nonce) DO UPDATE SET
          resource = EXCLUDED.resource,
          address = EXCLUDED.address,
          used_at = EXCLUDED.used_at,
          expires_at = EXCLUDED.expires_at
        `,
        [
          nonce,
          metadata?.resource ?? null,
          metadata?.address ?? null,
          Date.now(),
          metadata?.expiresAt ?? null,
        ]
      );
    } catch (error) {
      console.error('[PostgresSIWxStorage] Error recording nonce:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    if (!this.schemaInitialized) {
      await this.initSchema();
    }

    try {
      await this.pool.query('DELETE FROM siwx_entitlements');
      await this.pool.query('DELETE FROM siwx_nonces');
    } catch (error) {
      console.error('[PostgresSIWxStorage] Error clearing data:', error);
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
 * Creates a new Postgres SIWX storage instance.
 * @param connectionString - Postgres connection string
 * @returns A new PostgresSIWxStorage instance
 */
export function createPostgresSIWxStorage(
  connectionString: string
): SIWxStorage {
  return new PostgresSIWxStorage(connectionString);
}
