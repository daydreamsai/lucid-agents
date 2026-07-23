import type {
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
  cloneStoredAuthorization,
  normalizeMppChallengeStoreOptions,
  validateChallengeClaim,
  validateChallengeIssue,
  validateChallengeLeaseRenewal,
  validateStoredAuthorization,
  type MppChallengeStoreOptions,
  type NormalizedMppChallengeStoreOptions,
  type StoredMppChallengeRecord,
} from './challenge-store';

/**
 * Bounded, process-local MPP replay fence for tests and development.
 *
 * State is lost on process restart. Use a durable Node adapter in production.
 */
export class InMemoryMppChallengeStore implements MppChallengeStore {
  readonly durability = 'process' as const;
  private readonly records = new Map<string, StoredMppChallengeRecord>();
  private readonly options: NormalizedMppChallengeStoreOptions;
  private operationQueue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(options?: MppChallengeStoreOptions) {
    this.options = normalizeMppChallengeStoreOptions(options);
  }

  private async withLock<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.closed) throw new Error('MPP challenge store is closed');
    const previous = this.operationQueue;
    let release: () => void = () => {};
    this.operationQueue = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    try {
      if (this.closed) throw new Error('MPP challenge store is closed');
      return await operation();
    } finally {
      release();
    }
  }

  private prune(now: number): number {
    let deleted = 0;
    for (const [challengeId, record] of this.records) {
      if (record.expiresAt <= now) {
        this.records.delete(challengeId);
        deleted += 1;
      }
    }
    return deleted;
  }

  async issue(challenge: MppChallengeIssue): Promise<MppChallengeIssueResult> {
    validateChallengeIssue(challenge);
    return this.withLock(() => {
      const now = this.options.now();
      this.prune(now);
      if (challenge.expiresAt <= now) {
        throw new Error('Cannot issue an expired MPP challenge');
      }
      if (this.records.has(challenge.challengeId)) {
        return { status: 'exists' };
      }
      const toDelete = this.records.size - this.options.maxEntries + 1;
      if (toDelete > 0) {
        const evictable = [...this.records]
          .filter(
            ([, record]) =>
              record.state === 'issued' ||
              (record.state === 'leased' &&
                record.leaseExpiresAt !== undefined &&
                record.leaseExpiresAt <= now)
          )
          .slice(0, toDelete);
        if (evictable.length < toDelete) return { status: 'capacity' };
        for (const [challengeId] of evictable) {
          this.records.delete(challengeId);
        }
      }
      this.records.set(challenge.challengeId, {
        ...challenge,
        binding: { ...challenge.binding },
        state: 'issued',
      });
      return { status: 'issued' };
    });
  }

  async claim(
    claim: Parameters<MppChallengeStore['claim']>[0]
  ): Promise<MppChallengeClaimResult> {
    validateChallengeClaim(claim);
    return this.withLock(() => {
      const now = this.options.now();
      const record = this.records.get(claim.challengeId);
      if (!record) return { status: 'invalid', reason: 'missing' };
      if (record.expiresAt <= now) {
        this.records.delete(claim.challengeId);
        return { status: 'invalid', reason: 'expired' };
      }
      if (!bindingMatches(record.binding, claim.binding)) {
        return { status: 'invalid', reason: 'binding_mismatch' };
      }
      if (record.state === 'consumed') {
        if (
          claim.idempotencyKey &&
          record.idempotencyKey === claim.idempotencyKey &&
          record.authorization
        ) {
          return {
            status: 'recovered',
            authorization: cloneStoredAuthorization(record.authorization),
          };
        }
        return { status: 'invalid', reason: 'consumed' };
      }
      if (
        record.state === 'leased' &&
        record.leaseExpiresAt !== undefined &&
        record.leaseExpiresAt > now
      ) {
        return {
          status: 'in_progress',
          leaseExpiresAt: record.leaseExpiresAt,
        };
      }

      const leaseId = crypto.randomUUID();
      const leaseExpiresAt = Math.min(
        record.expiresAt,
        now + (claim.leaseMs ?? this.options.leaseMs)
      );
      record.state = 'leased';
      record.leaseId = leaseId;
      record.leaseExpiresAt = leaseExpiresAt;
      record.idempotencyKey = claim.idempotencyKey;
      record.authorization = undefined;
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
    return this.withLock(() => {
      const now = this.options.now();
      const record = this.records.get(renewal.challengeId);
      if (
        !record ||
        record.expiresAt <= now ||
        record.state !== 'leased' ||
        record.leaseId !== renewal.leaseId ||
        record.leaseExpiresAt === undefined ||
        record.leaseExpiresAt <= now
      ) {
        return { status: 'lost' };
      }
      const leaseExpiresAt = Math.min(
        record.expiresAt,
        now + (renewal.leaseMs ?? this.options.leaseMs)
      );
      record.leaseExpiresAt = leaseExpiresAt;
      return {
        status: 'renewed',
        leaseExpiresAt,
        renewAfterMs: challengeLeaseRenewAfterMs(now, leaseExpiresAt),
      };
    });
  }

  async release(lease: MppChallengeLease): Promise<boolean> {
    return this.withLock(() => {
      const now = this.options.now();
      const record = this.records.get(lease.challengeId);
      if (!record) return false;
      if (record.expiresAt <= now) {
        this.records.delete(lease.challengeId);
        return false;
      }
      if (record.state !== 'leased' || record.leaseId !== lease.leaseId) {
        return false;
      }
      record.state = 'issued';
      record.leaseId = undefined;
      record.leaseExpiresAt = undefined;
      record.idempotencyKey = undefined;
      return true;
    });
  }

  async consume(
    consumption: MppChallengeConsume
  ): Promise<MppChallengeConsumeResult> {
    validateStoredAuthorization(consumption.authorization);
    return this.withLock(() => {
      const now = this.options.now();
      const record = this.records.get(consumption.challengeId);
      if (!record) return { status: 'missing' };
      if (record.expiresAt <= now) {
        this.records.delete(consumption.challengeId);
        return { status: 'missing' };
      }
      if (
        record.state !== 'leased' ||
        record.leaseId !== consumption.leaseId ||
        record.leaseExpiresAt === undefined ||
        record.leaseExpiresAt <= now
      ) {
        return { status: 'invalid_lease' };
      }
      record.state = 'consumed';
      record.leaseId = undefined;
      record.leaseExpiresAt = undefined;
      record.authorization =
        record.idempotencyKey && consumption.authorization
          ? cloneStoredAuthorization(consumption.authorization)
          : undefined;
      if (record.authorization) {
        record.expiresAt = Math.max(
          record.expiresAt,
          now + this.options.authorizationRetentionMs
        );
      }
      return { status: 'consumed' };
    });
  }

  async recover(
    challengeId: string,
    idempotencyKey: string
  ): Promise<MppStoredAuthorization | undefined> {
    return this.withLock(() => {
      const now = this.options.now();
      const record = this.records.get(challengeId);
      if (!record) return undefined;
      if (record.expiresAt <= now) {
        this.records.delete(challengeId);
        return undefined;
      }
      return record.state === 'consumed' &&
        record.idempotencyKey === idempotencyKey &&
        record.authorization
        ? cloneStoredAuthorization(record.authorization)
        : undefined;
    });
  }

  async pruneExpired(now = this.options.now()): Promise<number> {
    return this.withLock(() => this.prune(now));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.withLock(() => {
      this.records.clear();
      this.closed = true;
    });
  }
}

/** Create a bounded process-local MPP challenge store. */
export function createInMemoryMppChallengeStore(
  options?: MppChallengeStoreOptions
): InMemoryMppChallengeStore {
  return new InMemoryMppChallengeStore(options);
}
