import { describe, expect, test } from 'bun:test';
import type { Channel } from '@x402/evm/batch-settlement/server';

import { PostgresBatchChannelStorage } from '../postgres-batch-channel-storage';

type QueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount?: number;
};

class FakeClient {
  readonly queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  channelRaw?: string;
  releases = 0;

  async query(
    sql: string,
    params: readonly unknown[] = []
  ): Promise<QueryResult> {
    this.queries.push({ sql, params });
    if (sql.includes('SELECT channel_json')) {
      return {
        rows: this.channelRaw ? [{ channel_json: this.channelRaw }] : [],
      };
    }
    if (sql.includes('INSERT INTO x402_batch_channels')) {
      this.channelRaw = String(params[2]);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('DELETE FROM x402_batch_channels')) {
      this.channelRaw = undefined;
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  }

  release(): void {
    this.releases += 1;
  }
}

class FakePool {
  readonly client = new FakeClient();
  ends = 0;

  async connect(): Promise<FakeClient> {
    return this.client;
  }

  async query(
    sql: string,
    params: readonly unknown[] = []
  ): Promise<QueryResult> {
    return this.client.query(sql, params);
  }

  async end(): Promise<void> {
    this.ends += 1;
  }
}

const CHANNEL_ID = `0x${'ef'.repeat(32)}`;

function channel(): Channel {
  return {
    channelId: CHANNEL_ID,
    channelConfig: {
      payer: `0x${'11'.repeat(20)}`,
      payerAuthorizer: `0x${'22'.repeat(20)}`,
      receiver: `0x${'33'.repeat(20)}`,
      receiverAuthorizer: `0x${'44'.repeat(20)}`,
      token: `0x${'55'.repeat(20)}`,
      withdrawDelay: 900,
      salt: `0x${'66'.repeat(32)}`,
    },
    chargedCumulativeAmount: '0',
    signedMaxClaimable: '0',
    signature: `0x${'77'.repeat(65)}`,
    balance: '100',
    totalClaimed: '0',
    withdrawRequestedAt: 0,
    refundNonce: 0,
    lastRequestTimestamp: 1_000,
  };
}

function createWithFakePool(): {
  storage: PostgresBatchChannelStorage;
  pool: FakePool;
} {
  const storage = new PostgresBatchChannelStorage('postgres://unused', {
    namespace: 'agent-a',
  });
  const pool = new FakePool();
  const mutable = storage as unknown as {
    pool: FakePool;
    schemaPromise: Promise<void>;
  };
  mutable.pool = pool;
  mutable.schemaPromise = Promise.resolve();
  return { storage, pool };
}

describe('PostgresBatchChannelStorage without a live database', () => {
  test('holds namespace and channel advisory locks around mutation', async () => {
    const { storage, pool } = createWithFakePool();

    expect(
      await storage.updateChannel(CHANNEL_ID, () => channel())
    ).toMatchObject({ status: 'updated' });
    expect(
      await storage.updateChannel(CHANNEL_ID, current => current)
    ).toMatchObject({ status: 'unchanged' });

    const compact = pool.client.queries.map(query =>
      query.sql.replace(/\s+/gu, ' ').trim()
    );
    expect(compact.filter(sql => sql === 'BEGIN')).toHaveLength(2);
    expect(compact.filter(sql => sql === 'COMMIT')).toHaveLength(2);
    expect(
      compact.filter(sql => sql.includes('pg_advisory_xact_lock_shared'))
    ).toHaveLength(2);
    expect(
      compact.filter(
        sql =>
          sql.includes('pg_advisory_xact_lock(') && !sql.includes('_shared')
      )
    ).toHaveLength(2);
    expect(
      compact.filter(sql => sql.includes('INSERT INTO x402_batch_channels'))
    ).toHaveLength(1);
    expect(pool.client.releases).toBe(2);

    await storage.clear();
    expect(
      pool.client.queries.some(
        query =>
          query.sql.includes('pg_advisory_xact_lock(') &&
          query.params[0] === 'agent-a'
      )
    ).toBe(true);
    await storage.close();
    expect(pool.ends).toBe(1);
  });

  test('rolls back and preserves the callback error', async () => {
    const { storage, pool } = createWithFakePool();
    const failure = new Error('voucher validation failed');

    await expect(
      storage.updateChannel(CHANNEL_ID, () => {
        throw failure;
      })
    ).rejects.toBe(failure);

    expect(pool.client.queries.map(query => query.sql.trim())).toContain(
      'ROLLBACK'
    );
    expect(pool.client.releases).toBe(1);
    await storage.close();
  });
});
