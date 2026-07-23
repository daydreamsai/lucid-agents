import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
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

type SQLiteChallengeRow = {
  challenge_id: string;
  binding: string;
  issued_at: number;
  expires_at: number;
  state: 'issued' | 'leased' | 'consumed';
  lease_id: string | null;
  lease_expires_at: number | null;
  idempotency_key: string | null;
  receipt: string | null;
  payer: string | null;
  network: string | null;
  payment_json: string | null;
};

/** Shared challenge-store and namespace options for SQLite persistence. */
export type SQLiteMppChallengeStoreOptions = MppChallengeStoreOptions & {
  /** Isolates records when several agents share one database. */
  namespace?: string;
};

/**
 * Bun SQLite-backed MPP challenge replay fence.
 *
 * The schema stores only route/digest bindings and verified receipt metadata.
 * Credentials, signing keys, and request bodies are never persisted.
 */
export class SQLiteMppChallengeStore implements MppChallengeStore {
  readonly durability = 'durable' as const;
  private readonly db: Database;
  private readonly namespace: string;
  private readonly options: NormalizedMppChallengeStoreOptions;
  private closed = false;

  constructor(
    dbPath = '.data/mpp-challenges.db',
    options: SQLiteMppChallengeStoreOptions = {}
  ) {
    if (typeof Bun === 'undefined') {
      throw new Error('SQLiteMppChallengeStore requires the Bun runtime');
    }
    const directory = dirname(dbPath);
    if (directory !== '.') mkdirSync(directory, { recursive: true });
    this.namespace = options.namespace?.trim() || 'default';
    this.options = normalizeMppChallengeStoreOptions(options);
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mpp_challenges (
        namespace TEXT NOT NULL,
        challenge_id TEXT NOT NULL,
        binding TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('issued', 'leased', 'consumed')),
        lease_id TEXT,
        lease_expires_at INTEGER,
        idempotency_key TEXT,
        receipt TEXT,
        payer TEXT,
        network TEXT,
        payment_json TEXT,
        PRIMARY KEY (namespace, challenge_id)
      );
      CREATE INDEX IF NOT EXISTS idx_mpp_challenges_expiry
        ON mpp_challenges(namespace, expires_at);
      CREATE INDEX IF NOT EXISTS idx_mpp_challenges_issued
        ON mpp_challenges(namespace, issued_at);
    `);
    const columns = this.db
      .prepare('PRAGMA table_info(mpp_challenges)')
      .all() as Array<{ name: string }>;
    if (!columns.some(column => column.name === 'payment_json')) {
      this.db.exec('ALTER TABLE mpp_challenges ADD COLUMN payment_json TEXT');
    }
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error('MPP challenge store is closed');
  }

  private transaction<T>(operation: () => T): T {
    this.ensureOpen();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // The transaction may already have ended.
      }
      throw error;
    }
  }

  private get(challengeId: string): SQLiteChallengeRow | undefined {
    return this.db
      .prepare(
        `SELECT challenge_id, binding, issued_at, expires_at, state, lease_id,
                lease_expires_at, idempotency_key, receipt, payer, network,
                payment_json
         FROM mpp_challenges
         WHERE namespace = ? AND challenge_id = ?`
      )
      .get(this.namespace, challengeId) as SQLiteChallengeRow | undefined;
  }

  async issue(challenge: MppChallengeIssue): Promise<MppChallengeIssueResult> {
    validateChallengeIssue(challenge);
    return this.transaction(() => {
      const now = this.options.now();
      if (challenge.expiresAt <= now) {
        throw new Error('Cannot issue an expired MPP challenge');
      }
      this.db
        .prepare(
          'DELETE FROM mpp_challenges WHERE namespace = ? AND expires_at <= ?'
        )
        .run(this.namespace, now);
      if (this.get(challenge.challengeId)) return { status: 'exists' };

      const countRow = this.db
        .prepare(
          'SELECT COUNT(*) AS count FROM mpp_challenges WHERE namespace = ?'
        )
        .get(this.namespace) as { count: number };
      const toDelete = countRow.count - this.options.maxEntries + 1;
      if (toDelete > 0) {
        const evictable = this.db
          .prepare(
            `SELECT COUNT(*) AS count FROM mpp_challenges
             WHERE namespace = ?
               AND (state <> 'leased' OR lease_expires_at <= ?)`
          )
          .get(this.namespace, now) as { count: number };
        if (evictable.count < toDelete) return { status: 'capacity' };
        this.db
          .prepare(
            `DELETE FROM mpp_challenges
             WHERE namespace = ? AND challenge_id IN (
               SELECT challenge_id FROM mpp_challenges
               WHERE namespace = ?
                 AND (state <> 'leased' OR lease_expires_at <= ?)
               ORDER BY issued_at ASC, challenge_id ASC
               LIMIT ?
             )`
          )
          .run(this.namespace, this.namespace, now, toDelete);
      }
      this.db
        .prepare(
          `INSERT INTO mpp_challenges
             (namespace, challenge_id, binding, issued_at, expires_at, state)
           VALUES (?, ?, ?, ?, ?, 'issued')`
        )
        .run(
          this.namespace,
          challenge.challengeId,
          serializeChallengeBinding(challenge.binding),
          challenge.issuedAt,
          challenge.expiresAt
        );
      return { status: 'issued' };
    });
  }

  async claim(claim: MppChallengeClaim): Promise<MppChallengeClaimResult> {
    validateChallengeClaim(claim);
    return this.transaction(() => {
      const now = this.options.now();
      const row = this.get(claim.challengeId);
      if (!row) return { status: 'invalid', reason: 'missing' };
      if (row.expires_at <= now) {
        this.db
          .prepare(
            'DELETE FROM mpp_challenges WHERE namespace = ? AND challenge_id = ?'
          )
          .run(this.namespace, claim.challengeId);
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
      if (
        row.state === 'leased' &&
        row.lease_expires_at !== null &&
        row.lease_expires_at > now
      ) {
        return {
          status: 'in_progress',
          leaseExpiresAt: row.lease_expires_at,
        };
      }

      const leaseId = crypto.randomUUID();
      const leaseExpiresAt = Math.min(
        row.expires_at,
        now + (claim.leaseMs ?? this.options.leaseMs)
      );
      this.db
        .prepare(
          `UPDATE mpp_challenges
           SET state = 'leased', lease_id = ?, lease_expires_at = ?,
               idempotency_key = ?, receipt = NULL, payer = NULL,
               network = NULL, payment_json = NULL
           WHERE namespace = ? AND challenge_id = ?`
        )
        .run(
          leaseId,
          leaseExpiresAt,
          claim.idempotencyKey ?? null,
          this.namespace,
          claim.challengeId
        );
      return {
        status: 'claimed',
        leaseId,
        leaseExpiresAt,
        renewAfterMs: challengeLeaseRenewAfterMs(now, leaseExpiresAt),
      };
    });
  }

  async renew(
    renewal: MppChallengeLeaseRenewal
  ): Promise<MppChallengeLeaseRenewalResult> {
    validateChallengeLeaseRenewal(renewal);
    this.ensureOpen();
    const now = this.options.now();
    const requestedExpiry = now + (renewal.leaseMs ?? this.options.leaseMs);
    const row = this.db
      .prepare(
        `UPDATE mpp_challenges
         SET lease_expires_at = MIN(expires_at, ?)
         WHERE namespace = ? AND challenge_id = ? AND state = 'leased'
           AND lease_id = ? AND lease_expires_at > ? AND expires_at > ?
         RETURNING lease_expires_at`
      )
      .get(
        requestedExpiry,
        this.namespace,
        renewal.challengeId,
        renewal.leaseId,
        now,
        now
      ) as { lease_expires_at: number } | undefined;
    if (!row) return { status: 'lost' };
    return {
      status: 'renewed',
      leaseExpiresAt: row.lease_expires_at,
      renewAfterMs: challengeLeaseRenewAfterMs(now, row.lease_expires_at),
    };
  }

  async release(lease: MppChallengeLease): Promise<boolean> {
    this.ensureOpen();
    const result = this.db
      .prepare(
        `UPDATE mpp_challenges
         SET state = 'issued', lease_id = NULL, lease_expires_at = NULL,
             idempotency_key = NULL
         WHERE namespace = ? AND challenge_id = ? AND state = 'leased'
           AND lease_id = ? AND expires_at > ?`
      )
      .run(
        this.namespace,
        lease.challengeId,
        lease.leaseId,
        this.options.now()
      );
    return result.changes === 1;
  }

  async consume(
    consumption: MppChallengeConsume
  ): Promise<MppChallengeConsumeResult> {
    validateStoredAuthorization(consumption.authorization);
    this.ensureOpen();
    const now = this.options.now();
    const authorization = consumption.authorization;
    const recoverableUntil = authorization
      ? now + this.options.authorizationRetentionMs
      : undefined;
    const result = this.db
      .prepare(
        `UPDATE mpp_challenges
         SET state = 'consumed', lease_id = NULL, lease_expires_at = NULL,
             expires_at = CASE
               WHEN idempotency_key IS NOT NULL AND ? IS NOT NULL
               THEN MAX(expires_at, ?)
               ELSE expires_at
             END,
             receipt = CASE WHEN idempotency_key IS NULL THEN NULL ELSE ? END,
             payer = CASE WHEN idempotency_key IS NULL THEN NULL ELSE ? END,
             network = CASE WHEN idempotency_key IS NULL THEN NULL ELSE ? END,
             payment_json = CASE
               WHEN idempotency_key IS NULL THEN NULL ELSE ? END
         WHERE namespace = ? AND challenge_id = ? AND state = 'leased'
           AND lease_id = ? AND lease_expires_at > ? AND expires_at > ?`
      )
      .run(
        recoverableUntil ?? null,
        recoverableUntil ?? null,
        authorization?.receipt ?? null,
        authorization?.payer ?? null,
        authorization?.network ?? null,
        serializeStoredPayment(authorization?.payment),
        this.namespace,
        consumption.challengeId,
        consumption.leaseId,
        now,
        now
      );
    if (result.changes === 1) return { status: 'consumed' };
    return this.get(consumption.challengeId)
      ? { status: 'invalid_lease' }
      : { status: 'missing' };
  }

  async recover(
    challengeId: string,
    idempotencyKey: string
  ): Promise<MppStoredAuthorization | undefined> {
    this.ensureOpen();
    const row = this.get(challengeId);
    if (
      !row ||
      row.expires_at <= this.options.now() ||
      row.state !== 'consumed' ||
      row.idempotency_key !== idempotencyKey ||
      !row.receipt
    ) {
      return undefined;
    }
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
    this.ensureOpen();
    const result = this.db
      .prepare(
        'DELETE FROM mpp_challenges WHERE namespace = ? AND expires_at <= ?'
      )
      .run(this.namespace, now);
    return result.changes;
  }

  close(): void {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }
}

/** Create a durable MPP challenge store backed by Bun SQLite. */
export function createSQLiteMppChallengeStore(
  dbPath?: string,
  options?: SQLiteMppChallengeStoreOptions
): SQLiteMppChallengeStore {
  return new SQLiteMppChallengeStore(dbPath, options);
}
