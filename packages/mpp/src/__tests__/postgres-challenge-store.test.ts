import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { MppChallengeBinding } from '@lucid-agents/types/mpp';

import {
  createPostgresMppChallengeStore,
  type PostgresMppChallengeStore,
} from '../postgres-challenge-store';

const connectionString = process.env.TEST_POSTGRES_URL;
const describePostgres = connectionString ? describe : describe.skip;

describePostgres('PostgresMppChallengeStore integration', () => {
  const namespace = `test-${crypto.randomUUID()}`;
  const binding: MppChallengeBinding = {
    entrypointKey: 'echo',
    operation: 'invoke',
    challengeDigest: 'sha-256=:challenge:',
  };
  let now = 1_000;
  let first: PostgresMppChallengeStore;
  let second: PostgresMppChallengeStore;

  beforeAll(() => {
    first = createPostgresMppChallengeStore(connectionString!, {
      namespace,
      now: () => now,
    });
    second = createPostgresMppChallengeStore(connectionString!, {
      namespace,
      now: () => now,
    });
  });

  afterAll(async () => {
    await first.pruneExpired(Number.MAX_SAFE_INTEGER);
    await first.close();
    await second.close();
  });

  test('fences claims across pools and recovers after restart', async () => {
    await first.issue({
      challengeId: 'postgres-shared',
      binding,
      issuedAt: 1_000,
      expiresAt: 60_000,
    });
    const claims = await Promise.all([
      first.claim({
        challengeId: 'postgres-shared',
        binding,
        idempotencyKey: 'postgres-idempotency',
      }),
      second.claim({
        challengeId: 'postgres-shared',
        binding,
        idempotencyKey: 'postgres-idempotency',
      }),
    ]);
    expect(claims.filter(result => result.status === 'claimed')).toHaveLength(
      1
    );
    expect(
      claims.filter(result => result.status === 'in_progress')
    ).toHaveLength(1);
    const claimed = claims.find(result => result.status === 'claimed');
    if (!claimed || claimed.status !== 'claimed') {
      throw new Error('Expected one claim');
    }
    expect(
      await second.renew({
        challengeId: 'postgres-shared',
        leaseId: 'stale-lease',
      })
    ).toEqual({ status: 'lost' });
    now += 1_000;
    expect(
      await first.renew({
        challengeId: 'postgres-shared',
        leaseId: claimed.leaseId,
      })
    ).toMatchObject({
      status: 'renewed',
      leaseExpiresAt: 32_000,
    });
    await first.consume({
      challengeId: 'postgres-shared',
      leaseId: claimed.leaseId,
      authorization: { receipt: 'postgres-receipt' },
    });
    await first.close();
    first = createPostgresMppChallengeStore(connectionString!, {
      namespace,
      now: () => now,
    });
    expect(
      await first.recover('postgres-shared', 'postgres-idempotency')
    ).toEqual({ receipt: 'postgres-receipt' });
  });

  test('retains an unexpired consumed replay tombstone under capacity pressure', async () => {
    const boundedNamespace = `bounded-${crypto.randomUUID()}`;
    const store = createPostgresMppChallengeStore(connectionString!, {
      namespace: boundedNamespace,
      maxEntries: 1,
      now: () => now,
    });
    try {
      await store.issue({
        challengeId: 'postgres-consumed',
        binding,
        issuedAt: now,
        expiresAt: now + 60_000,
      });
      const claimed = await store.claim({
        challengeId: 'postgres-consumed',
        binding,
      });
      if (claimed.status !== 'claimed') throw new Error('Expected claim');
      await store.consume({
        challengeId: 'postgres-consumed',
        leaseId: claimed.leaseId,
      });

      expect(
        await store.issue({
          challengeId: 'postgres-overflow',
          binding,
          issuedAt: now,
          expiresAt: now + 60_000,
        })
      ).toEqual({ status: 'capacity' });
      expect(
        await store.claim({
          challengeId: 'postgres-consumed',
          binding,
        })
      ).toEqual({ status: 'invalid', reason: 'consumed' });
    } finally {
      await store.pruneExpired(Number.MAX_SAFE_INTEGER);
      await store.close();
    }
  });
});
