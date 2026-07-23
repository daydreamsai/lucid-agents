import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import type {
  MppChallengeBinding,
  MppChallengeClaimResult,
  MppChallengeIssue,
  MppChallengeStore,
} from '@lucid-agents/types/mpp';

import { createInMemoryMppChallengeStore } from '../in-memory-challenge-store';
import { createSQLiteMppChallengeStore } from '../sqlite-challenge-store';

const binding: MppChallengeBinding = {
  entrypointKey: 'summarize',
  operation: 'invoke',
  challengeDigest: 'sha-256=:challenge:',
  requestMethod: 'POST',
  requestTarget: 'https://agent.example/invoke/summarize',
  requestBodyDigest: 'sha-256=:body:',
};

function challenge(
  challengeId: string,
  issuedAt: number,
  expiresAt = issuedAt + 60_000
): MppChallengeIssue {
  return { challengeId, binding, issuedAt, expiresAt };
}

function expectOneClaim(
  results: readonly MppChallengeClaimResult[]
): Extract<MppChallengeClaimResult, { status: 'claimed' }> {
  expect(results.filter(result => result.status === 'claimed')).toHaveLength(1);
  expect(
    results.filter(result => result.status === 'in_progress')
  ).toHaveLength(1);
  return results.find(
    (
      result
    ): result is Extract<MppChallengeClaimResult, { status: 'claimed' }> =>
      result.status === 'claimed'
  )!;
}

function runChallengeStoreContract(
  name: string,
  createStore: (now: () => number, maxEntries?: number) => MppChallengeStore
): void {
  describe(name, () => {
    test('issues without overwriting and fences concurrent verification', async () => {
      let now = 1_000;
      const store = createStore(() => now);
      expect(await store.issue(challenge('challenge-1', now))).toEqual({
        status: 'issued',
      });
      expect(await store.issue(challenge('challenge-1', now))).toEqual({
        status: 'exists',
      });

      const claims = await Promise.all([
        store.claim({
          challengeId: 'challenge-1',
          binding,
          idempotencyKey: 'idempotency-key-0001',
        }),
        store.claim({
          challengeId: 'challenge-1',
          binding,
          idempotencyKey: 'idempotency-key-0001',
        }),
      ]);
      const claimed = expectOneClaim(claims);

      expect(
        await store.consume({
          challengeId: 'challenge-1',
          leaseId: 'not-the-lease',
          authorization: { receipt: 'receipt-1' },
        })
      ).toEqual({ status: 'invalid_lease' });
      expect(
        await store.consume({
          challengeId: 'challenge-1',
          leaseId: claimed.leaseId,
          authorization: {
            receipt: 'receipt-1',
            payer: 'did:example:payer',
            network: 'eip155:1',
            payment: {
              amount: '25',
              currency: 'usd',
              intent: 'charge',
              method: 'stripe',
            },
          },
        })
      ).toEqual({ status: 'consumed' });

      expect(
        await store.recover('challenge-1', 'idempotency-key-0001')
      ).toEqual({
        receipt: 'receipt-1',
        payer: 'did:example:payer',
        network: 'eip155:1',
        payment: {
          amount: '25',
          currency: 'usd',
          intent: 'charge',
          method: 'stripe',
        },
      });
      expect(
        await store.recover('challenge-1', 'different-key')
      ).toBeUndefined();
      expect(
        await store.claim({
          challengeId: 'challenge-1',
          binding,
          idempotencyKey: 'idempotency-key-0001',
        })
      ).toEqual({
        status: 'recovered',
        authorization: {
          receipt: 'receipt-1',
          payer: 'did:example:payer',
          network: 'eip155:1',
          payment: {
            amount: '25',
            currency: 'usd',
            intent: 'charge',
            method: 'stripe',
          },
        },
      });
      expect(
        await store.claim({
          challengeId: 'challenge-1',
          binding,
          idempotencyKey: 'different-key',
        })
      ).toEqual({ status: 'invalid', reason: 'consumed' });

      now += 60_001;
      expect(await store.pruneExpired()).toBe(0);
      expect(
        await store.recover('challenge-1', 'idempotency-key-0001')
      ).toMatchObject({ receipt: 'receipt-1' });
      now += 24 * 60 * 60 * 1_000;
      expect(await store.pruneExpired()).toBe(1);
      await store.close?.();
    });

    test('does not destroy a challenge on a mismatched claim', async () => {
      const store = createStore(() => 5_000);
      await store.issue(challenge('challenge-2', 5_000));
      expect(
        await store.claim({
          challengeId: 'challenge-2',
          binding: { ...binding, entrypointKey: 'other' },
        })
      ).toEqual({ status: 'invalid', reason: 'binding_mismatch' });
      expect(
        await store.claim({ challengeId: 'challenge-2', binding })
      ).toMatchObject({ status: 'claimed' });
      await store.close?.();
    });

    test('releases retryable verification and reclaims expired leases', async () => {
      let now = 10_000;
      const store = createStore(() => now);
      await store.issue(challenge('challenge-3', now));
      const first = await store.claim({
        challengeId: 'challenge-3',
        binding,
        leaseMs: 100,
      });
      expect(first.status).toBe('claimed');
      if (first.status !== 'claimed') throw new Error('Expected claim');
      expect(
        await store.release({
          challengeId: 'challenge-3',
          leaseId: first.leaseId,
        })
      ).toBe(true);

      const second = await store.claim({
        challengeId: 'challenge-3',
        binding,
        leaseMs: 100,
      });
      expect(second.status).toBe('claimed');
      now += 101;
      const third = await store.claim({
        challengeId: 'challenge-3',
        binding,
      });
      expect(third.status).toBe('claimed');
      await store.close?.();
    });

    test('renews only the active lease and fences stale verifiers', async () => {
      let now = 15_000;
      const store = createStore(() => now);
      await store.issue(challenge('challenge-renew', now, now + 1_000));
      const claimed = await store.claim({
        challengeId: 'challenge-renew',
        binding,
        leaseMs: 90,
      });
      if (claimed.status !== 'claimed') throw new Error('Expected claim');
      expect(claimed.renewAfterMs).toBe(30);

      now += 50;
      expect(
        await store.renew({
          challengeId: 'challenge-renew',
          leaseId: 'stale-lease',
          leaseMs: 90,
        })
      ).toEqual({ status: 'lost' });
      const renewed = await store.renew({
        challengeId: 'challenge-renew',
        leaseId: claimed.leaseId,
        leaseMs: 90,
      });
      expect(renewed).toEqual({
        status: 'renewed',
        leaseExpiresAt: now + 90,
        renewAfterMs: 30,
      });

      now += 60;
      expect(
        await store.claim({ challengeId: 'challenge-renew', binding })
      ).toMatchObject({ status: 'in_progress' });
      now += 31;
      expect(
        await store.renew({
          challengeId: 'challenge-renew',
          leaseId: claimed.leaseId,
        })
      ).toEqual({ status: 'lost' });
      expect(
        await store.claim({ challengeId: 'challenge-renew', binding })
      ).toMatchObject({ status: 'claimed' });
      await store.close?.();
    });

    test('retains no authorization when the claim has no idempotency key', async () => {
      const store = createStore(() => 20_000);
      await store.issue(challenge('challenge-4', 20_000));
      const result = await store.claim({
        challengeId: 'challenge-4',
        binding,
      });
      if (result.status !== 'claimed') throw new Error('Expected claim');
      await store.consume({
        challengeId: 'challenge-4',
        leaseId: result.leaseId,
        authorization: { receipt: 'must-not-be-recoverable' },
      });
      expect(
        await store.recover('challenge-4', 'unrelated-key')
      ).toBeUndefined();
      await store.close?.();
    });

    test('retains an unexpired consumed replay tombstone under capacity pressure', async () => {
      const now = 22_000;
      const store = createStore(() => now, 1);
      await store.issue(challenge('consumed-challenge', now));
      const claimed = await store.claim({
        challengeId: 'consumed-challenge',
        binding,
      });
      if (claimed.status !== 'claimed') throw new Error('Expected claim');
      await store.consume({
        challengeId: 'consumed-challenge',
        leaseId: claimed.leaseId,
      });

      expect(await store.issue(challenge('overflow-challenge', now))).toEqual({
        status: 'capacity',
      });
      expect(
        await store.claim({
          challengeId: 'consumed-challenge',
          binding,
        })
      ).toEqual({ status: 'invalid', reason: 'consumed' });
      await store.close?.();
    });
  });
}

runChallengeStoreContract('InMemoryMppChallengeStore', (now, maxEntries) =>
  createInMemoryMppChallengeStore({ now, maxEntries })
);

const sqliteDirectories: string[] = [];

afterEach(() => {
  for (const directory of sqliteDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

runChallengeStoreContract('SQLiteMppChallengeStore', (now, maxEntries) => {
  const directory = mkdtempSync(join(tmpdir(), 'lucid-mpp-store-'));
  sqliteDirectories.push(directory);
  return createSQLiteMppChallengeStore(join(directory, 'challenges.db'), {
    now,
    maxEntries,
  });
});

describe('durable MPP challenge storage', () => {
  test('bounded memory does not evict an active verification lease', async () => {
    const store = createInMemoryMppChallengeStore({
      maxEntries: 1,
      now: () => 25_000,
    });
    await store.issue(challenge('active-challenge', 25_000));
    const active = await store.claim({
      challengeId: 'active-challenge',
      binding,
    });
    if (active.status !== 'claimed') throw new Error('Expected claim');
    expect(await store.issue(challenge('overflow-challenge', 25_000))).toEqual({
      status: 'capacity',
    });
    expect(
      await store.consume({
        challengeId: 'active-challenge',
        leaseId: active.leaseId,
      })
    ).toEqual({ status: 'consumed' });
    await store.close();
  });

  test('SQLite survives restart and recovers a verified receipt', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lucid-mpp-restart-'));
    sqliteDirectories.push(directory);
    const dbPath = join(directory, 'challenges.db');
    const first = createSQLiteMppChallengeStore(dbPath, {
      namespace: 'agent-a',
      now: () => 30_000,
    });
    await first.issue(challenge('challenge-restart', 30_000));
    first.close();

    const second = createSQLiteMppChallengeStore(dbPath, {
      namespace: 'agent-a',
      now: () => 30_001,
    });
    const claim = await second.claim({
      challengeId: 'challenge-restart',
      binding,
      idempotencyKey: 'idempotency-key-restart',
    });
    if (claim.status !== 'claimed') throw new Error('Expected claim');
    await second.consume({
      challengeId: 'challenge-restart',
      leaseId: claim.leaseId,
      authorization: {
        receipt: 'receipt-after-restart',
        payment: {
          amount: '7',
          currency: 'usd',
          intent: 'charge',
          method: 'stripe',
        },
      },
    });
    second.close();

    const third = createSQLiteMppChallengeStore(dbPath, {
      namespace: 'agent-a',
      now: () => 30_002,
    });
    expect(
      await third.recover('challenge-restart', 'idempotency-key-restart')
    ).toEqual({
      receipt: 'receipt-after-restart',
      payment: {
        amount: '7',
        currency: 'usd',
        intent: 'charge',
        method: 'stripe',
      },
    });
    third.close();
  });

  test('two SQLite runtimes share one atomic claim fence', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lucid-mpp-concurrency-'));
    sqliteDirectories.push(directory);
    const dbPath = join(directory, 'challenges.db');
    const first = createSQLiteMppChallengeStore(dbPath, {
      namespace: 'agent-a',
      now: () => 40_000,
    });
    const second = createSQLiteMppChallengeStore(dbPath, {
      namespace: 'agent-a',
      now: () => 40_000,
    });
    await first.issue(challenge('challenge-shared', 40_000));
    const claimed = expectOneClaim(
      await Promise.all([
        first.claim({ challengeId: 'challenge-shared', binding }),
        second.claim({ challengeId: 'challenge-shared', binding }),
      ])
    );
    expect(
      await second.consume({
        challengeId: 'challenge-shared',
        leaseId: 'other-runtime-lease',
      })
    ).toEqual({ status: 'invalid_lease' });
    expect(
      await first.consume({
        challengeId: 'challenge-shared',
        leaseId: claimed.leaseId,
      })
    ).toEqual({ status: 'consumed' });
    first.close();
    second.close();
  });

  test('SQLite schema cannot persist credentials, signing keys, or bodies', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lucid-mpp-schema-'));
    sqliteDirectories.push(directory);
    const dbPath = join(directory, 'challenges.db');
    const store = createSQLiteMppChallengeStore(dbPath);
    store.close();
    const db = new Database(dbPath, { readonly: true });
    const columns = (
      db.query('PRAGMA table_info(mpp_challenges)').all() as Array<{
        name: string;
      }>
    ).map(column => column.name);
    expect(columns).not.toContain('credential');
    expect(columns).not.toContain('signing_key');
    expect(columns).not.toContain('request_body');
    expect(columns).toContain('binding');
    expect(columns).toContain('receipt');
    expect(columns).toContain('payment_json');
    db.close();
  });
});
