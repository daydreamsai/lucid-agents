import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type {
  MppChallengeClaim,
  MppChallengeClaimResult,
  MppChallengeConsume,
  MppChallengeConsumeResult,
  MppChallengeIssue,
  MppChallengeIssueResult,
  MppChallengeLease,
  MppChallengeLeaseRenewal,
  MppChallengeLeaseRenewalResult,
  MppChallengeStore,
  MppStoredAuthorization,
} from '@lucid-agents/types/mpp';

import {
  bindingMatches,
  challengeLeaseRenewAfterMs,
  deserializeStoredPayment,
  deserializeChallengeBinding,
  normalizeMppChallengeStoreOptions,
  serializeChallengeBinding,
  serializeStoredPayment,
  validateChallengeClaim,
  validateChallengeIssue,
  validateChallengeLeaseRenewal,
  validateStoredAuthorization,
  type MppChallengeStoreOptions,
  type NormalizedMppChallengeStoreOptions,
} from './challenge-store';

type PostgresChallengeRow = QueryResultRow & {
  challenge_id: string;
  binding: string;
  issued_at: string | number;
  expires_at: string | number;
  state: 'issued' | 'leased' | 'consumed';
  lease_id: string | null;
  lease_expires_at: string | number | null;
  idempotency_key: string | null;
  receipt: string | null;
  payer: string | null;
  network: string | null;
  payment_json: string | null;
};

/** Shared challenge-store, namespace, and pool options for Postgres. */
export type PostgresMppChallengeStoreOptions = MppChallengeStoreOptions & {
  /** Isolates records when several agents share one database. */
  namespace?: string;
  maxConnections?: number;
};

/**
 * Postgres-backed MPP replay fence for multi-process production deployments.
 *
 * Row locks serialize claims for one challenge; an advisory transaction lock
 * serializes bounded issue/eviction within one namespace.
 */
export class PostgresMppChallengeStore implements MppChallengeStore {
  readonly durability = 'durable' as const;
  private readonly pool: Pool;
  private readonly namespace: string;
  private readonly options: NormalizedMppChallengeStoreOptions;
  private schemaPromise?: Promise<void>;
  private closed = false;

  constructor(
    connectionString: string,
    options: PostgresMppChallengeStoreOptions = {}
  ) {
    if (!connectionString.trim()) {
      throw new Error(
        'Postgres MPP challenge storage requires connectionString'
      );
    }
    this.namespace = options.namespace?.trim() || 'default';
    this.options = normalizeMppChallengeStoreOptions(options);
    this.pool = new Pool({
      connectionString,
      max: options.maxConnections ?? 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error('MPP challenge store is closed');
  }

  private async ensureSchema(): Promise<void> {
    this.ensureOpen();
    if (!this.schemaPromise) {
      this.schemaPromise = this.pool
        .query(
          `
          CREATE TABLE IF NOT EXISTS mpp_challenges (
            namespace TEXT NOT NULL,
            challenge_id TEXT NOT NULL,
            binding TEXT NOT NULL,
            issued_at BIGINT NOT NULL,
            expires_at BIGINT NOT NULL,
            state TEXT NOT NULL CHECK (state IN ('issued', 'leased', 'consumed')),
            lease_id TEXT,
            lease_expires_at BIGINT,
            idempotency_key TEXT,
            receipt TEXT,
            payer TEXT,
            network TEXT,
            payment_json TEXT,
            PRIMARY KEY (namespace, challenge_id)
          );
          ALTER TABLE mpp_challenges
            ADD COLUMN IF NOT EXISTS payment_json TEXT;
          CREATE INDEX IF NOT EXISTS idx_mpp_challenges_expiry
            ON mpp_challenges(namespace, expires_at);
          CREATE INDEX IF NOT EXISTS idx_mpp_challenges_issued
            ON mpp_challenges(namespace, issued_at);
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

  private async getForUpdate(
    client: PoolClient,
    challengeId: string
  ): Promise<PostgresChallengeRow | undefined> {
    const result = await client.query<PostgresChallengeRow>(
      `SELECT challenge_id, binding, issued_at, expires_at, state, lease_id,
              lease_expires_at, idempotency_key, receipt, payer, network,
              payment_json
       FROM mpp_challenges
       WHERE namespace = $1 AND challenge_id = $2
       FOR UPDATE`,
      [this.namespace, challengeId]
    );
    return result.rows[0];
  }

  async issue(challenge: MppChallengeIssue): Promise<MppChallengeIssueResult> {
    validateChallengeIssue(challenge);
    return this.transaction(async client => {
      const now = this.options.now();
      if (challenge.expiresAt <= now) {
        throw new Error('Cannot issue an expired MPP challenge');
      }
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [this.namespace]
      );
      await client.query(
        'DELETE FROM mpp_challenges WHERE namespace = $1 AND expires_at <= $2',
        [this.namespace, now]
      );
      const existing = await client.query(
        `SELECT 1 FROM mpp_challenges
         WHERE namespace = $1 AND challenge_id = $2`,
        [this.namespace, challenge.challengeId]
      );
      if (existing.rowCount === 1) return { status: 'exists' };

      const countResult = await client.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM mpp_challenges WHERE namespace = $1',
        [this.namespace]
      );
      const toDelete =
        Number(countResult.rows[0]?.count ?? 0) - this.options.maxEntries + 1;
      if (toDelete > 0) {
        const evictable = await client.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM mpp_challenges
           WHERE namespace = $1
             AND (
               state = 'issued'
               OR (state = 'leased' AND lease_expires_at <= $2)
             )`,
          [this.namespace, now]
        );
        if (Number(evictable.rows[0]?.count ?? 0) < toDelete) {
          return { status: 'capacity' };
        }
        await client.query(
          `DELETE FROM mpp_challenges
           WHERE (namespace, challenge_id) IN (
             SELECT namespace, challenge_id FROM mpp_challenges
             WHERE namespace = $1
               AND (
                 state = 'issued'
                 OR (state = 'leased' AND lease_expires_at <= $2)
               )
             ORDER BY issued_at ASC, challenge_id ASC
             LIMIT $3
           )`,
          [this.namespace, now, toDelete]
        );
      }
      await client.query(
        `INSERT INTO mpp_challenges
           (namespace, challenge_id, binding, issued_at, expires_at, state)
         VALUES ($1, $2, $3, $4, $5, 'issued')`,
        [
          this.namespace,
          challenge.challengeId,
          serializeChallengeBinding(challenge.binding),
          challenge.issuedAt,
          challenge.expiresAt,
        ]
      );
      return { status: 'issued' };
    });
  }

  async claim(claim: MppChallengeClaim): Promise<MppChallengeClaimResult> {
    validateChallengeClaim(claim);
    return this.transaction(async client => {
      const now = this.options.now();
      const row = await this.getForUpdate(client, claim.challengeId);
      if (!row) return { status: 'invalid', reason: 'missing' };
      const expiresAt = Number(row.expires_at);
      if (expiresAt <= now) {
        await client.query(
          'DELETE FROM mpp_challenges WHERE namespace = $1 AND challenge_id = $2',
          [this.namespace, claim.challengeId]
        );
        return { status: 'invalid', reason: 'expired' };
      }
      if (
        !bindingMatches(deserializeChallengeBinding(row.binding), claim.binding)
      ) {
        return { status: 'invalid', reason: 'binding_mismatch' };
      }
      if (row.state === 'consumed') {
        if (
          claim.idempotencyKey &&
          row.idempotency_key === claim.idempotencyKey &&
          row.receipt
        ) {
          return {
            status: 'recovered',
            authorization: {
              receipt: row.receipt,
              ...(row.payer ? { payer: row.payer } : {}),
              ...(row.network ? { network: row.network } : {}),
              ...(row.payment_json
                ? { payment: deserializeStoredPayment(row.payment_json) }
                : {}),
            },
          };
        }
        return { status: 'invalid', reason: 'consumed' };
      }
      const leaseExpiresAt =
        row.lease_expires_at === null
          ? undefined
          : Number(row.lease_expires_at);
      if (
        row.state === 'leased' &&
        leaseExpiresAt !== undefined &&
        leaseExpiresAt > now
      ) {
        return { status: 'in_progress', leaseExpiresAt };
      }

      const leaseId = crypto.randomUUID();
      const nextLeaseExpiresAt = Math.min(
        expiresAt,
        now + (claim.leaseMs ?? this.options.leaseMs)
      );
      await client.query(
        `UPDATE mpp_challenges
         SET state = 'leased', lease_id = $1, lease_expires_at = $2,
             idempotency_key = $3, receipt = NULL, payer = NULL,
             network = NULL, payment_json = NULL
         WHERE namespace = $4 AND challenge_id = $5`,
        [
          leaseId,
          nextLeaseExpiresAt,
          claim.idempotencyKey ?? null,
          this.namespace,
          claim.challengeId,
        ]
      );
      return {
        status: 'claimed',
        leaseId,
        leaseExpiresAt: nextLeaseExpiresAt,
        renewAfterMs: challengeLeaseRenewAfterMs(now, nextLeaseExpiresAt),
      };
    });
  }

  async renew(
    renewal: MppChallengeLeaseRenewal
  ): Promise<MppChallengeLeaseRenewalResult> {
    validateChallengeLeaseRenewal(renewal);
    await this.ensureSchema();
    const now = this.options.now();
    const requestedExpiry = now + (renewal.leaseMs ?? this.options.leaseMs);
    const result = await this.pool.query<{ lease_expires_at: string | number }>(
      `UPDATE mpp_challenges
       SET lease_expires_at = LEAST(expires_at, $1)
       WHERE namespace = $2 AND challenge_id = $3 AND state = 'leased'
         AND lease_id = $4 AND lease_expires_at > $5 AND expires_at > $5
       RETURNING lease_expires_at`,
      [
        requestedExpiry,
        this.namespace,
        renewal.challengeId,
        renewal.leaseId,
        now,
      ]
    );
    const leaseExpiresAt = result.rows[0]?.lease_expires_at;
    if (leaseExpiresAt === undefined) return { status: 'lost' };
    const numericLeaseExpiresAt = Number(leaseExpiresAt);
    return {
      status: 'renewed',
      leaseExpiresAt: numericLeaseExpiresAt,
      renewAfterMs: challengeLeaseRenewAfterMs(now, numericLeaseExpiresAt),
    };
  }

  async release(lease: MppChallengeLease): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `UPDATE mpp_challenges
       SET state = 'issued', lease_id = NULL, lease_expires_at = NULL,
           idempotency_key = NULL
       WHERE namespace = $1 AND challenge_id = $2 AND state = 'leased'
         AND lease_id = $3 AND expires_at > $4`,
      [this.namespace, lease.challengeId, lease.leaseId, this.options.now()]
    );
    return result.rowCount === 1;
  }

  async consume(
    consumption: MppChallengeConsume
  ): Promise<MppChallengeConsumeResult> {
    validateStoredAuthorization(consumption.authorization);
    await this.ensureSchema();
    const now = this.options.now();
    const authorization = consumption.authorization;
    const recoverableUntil = authorization
      ? now + this.options.authorizationRetentionMs
      : null;
    const result = await this.pool.query(
      `UPDATE mpp_challenges
       SET state = 'consumed', lease_id = NULL, lease_expires_at = NULL,
           expires_at = CASE
             WHEN idempotency_key IS NOT NULL AND $1::bigint IS NOT NULL
             THEN GREATEST(expires_at, $1)
             ELSE expires_at
           END,
           receipt = CASE WHEN idempotency_key IS NULL THEN NULL ELSE $2 END,
           payer = CASE WHEN idempotency_key IS NULL THEN NULL ELSE $3 END,
           network = CASE WHEN idempotency_key IS NULL THEN NULL ELSE $4 END,
           payment_json = CASE
             WHEN idempotency_key IS NULL THEN NULL ELSE $5 END
       WHERE namespace = $6 AND challenge_id = $7 AND state = 'leased'
         AND lease_id = $8 AND lease_expires_at > $9 AND expires_at > $9`,
      [
        recoverableUntil,
        authorization?.receipt ?? null,
        authorization?.payer ?? null,
        authorization?.network ?? null,
        serializeStoredPayment(authorization?.payment),
        this.namespace,
        consumption.challengeId,
        consumption.leaseId,
        now,
      ]
    );
    if (result.rowCount === 1) return { status: 'consumed' };
    const existing = await this.pool.query(
      `SELECT 1 FROM mpp_challenges
       WHERE namespace = $1 AND challenge_id = $2`,
      [this.namespace, consumption.challengeId]
    );
    return existing.rowCount === 1
      ? { status: 'invalid_lease' }
      : { status: 'missing' };
  }

  async recover(
    challengeId: string,
    idempotencyKey: string
  ): Promise<MppStoredAuthorization | undefined> {
    await this.ensureSchema();
    const result = await this.pool.query<PostgresChallengeRow>(
      `SELECT challenge_id, binding, issued_at, expires_at, state, lease_id,
              lease_expires_at, idempotency_key, receipt, payer, network,
              payment_json
       FROM mpp_challenges
       WHERE namespace = $1 AND challenge_id = $2 AND state = 'consumed'
         AND idempotency_key = $3 AND expires_at > $4`,
      [this.namespace, challengeId, idempotencyKey, this.options.now()]
    );
    const row = result.rows[0];
    if (!row?.receipt) return undefined;
    return {
      receipt: row.receipt,
      ...(row.payer ? { payer: row.payer } : {}),
      ...(row.network ? { network: row.network } : {}),
      ...(row.payment_json
        ? { payment: deserializeStoredPayment(row.payment_json) }
        : {}),
    };
  }

  async pruneExpired(now = this.options.now()): Promise<number> {
    await this.ensureSchema();
    const result = await this.pool.query(
      'DELETE FROM mpp_challenges WHERE namespace = $1 AND expires_at <= $2',
      [this.namespace, now]
    );
    return result.rowCount ?? 0;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.pool.end();
  }
}

/** Create a durable, multi-process MPP challenge store in Postgres. */
export function createPostgresMppChallengeStore(
  connectionString: string,
  options?: PostgresMppChallengeStoreOptions
): PostgresMppChallengeStore {
  return new PostgresMppChallengeStore(connectionString, options);
}
