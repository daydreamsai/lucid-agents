import { describe, expect, it, spyOn } from 'bun:test';

import {
  createPostgresSIWxStorage,
  PostgresSIWxStorage,
} from '../siwx-postgres-storage';

type QueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
};
type QueryHandler = (
  sql: string,
  params: readonly unknown[]
) => QueryResult | Promise<QueryResult>;

class FakeClient {
  readonly queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  releases = 0;

  constructor(private readonly handle: QueryHandler) {}

  async query(
    sql: string,
    params: readonly unknown[] = []
  ): Promise<QueryResult> {
    this.queries.push({ sql, params });
    return this.handle(sql, params);
  }

  release(): void {
    this.releases += 1;
  }
}

class FakePool {
  readonly client: FakeClient;
  readonly queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  ends = 0;

  constructor(private readonly handle: QueryHandler) {
    this.client = new FakeClient(handle);
  }

  async connect(): Promise<FakeClient> {
    return this.client;
  }

  async query(
    sql: string,
    params: readonly unknown[] = []
  ): Promise<QueryResult> {
    this.queries.push({ sql, params });
    return this.handle(sql, params);
  }

  async end(): Promise<void> {
    this.ends += 1;
  }
}

const withPool = (
  handle: QueryHandler,
  schemaInitialized = false
): { storage: PostgresSIWxStorage; pool: FakePool } => {
  const storage = new PostgresSIWxStorage('postgres://unused');
  const pool = new FakePool(handle);
  const mutable = storage as unknown as {
    pool: FakePool;
    schemaInitialized: boolean;
  };
  mutable.pool = pool;
  mutable.schemaInitialized = schemaInitialized;
  return { storage, pool };
};

describe('PostgresSIWxStorage without a live database', () => {
  it('initializes its schema once and normalizes entitlement addresses', async () => {
    const { storage, pool } = withPool(sql => ({
      rows: sql.startsWith('SELECT 1 FROM siwx_entitlements') ? [{}] : [],
    }));

    expect(
      await storage.hasPaid(
        'https://agent.example/invoke',
        '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD'
      )
    ).toBe(true);
    expect(await storage.hasPaid('other', '0xABCD')).toBe(true);

    expect(pool.client.queries[0]?.sql).toContain(
      'CREATE TABLE IF NOT EXISTS siwx_entitlements'
    );
    expect(pool.client.releases).toBe(1);
    expect(pool.queries[0]?.params[1]).toBe(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    );
    expect(pool.client.queries).toHaveLength(1);
  });

  it('records entitlements and nonce metadata, consumes atomically, and clears data', async () => {
    let consumes = 0;
    const { storage, pool } = withPool(sql => {
      if (sql.includes('ON CONFLICT (nonce) DO NOTHING')) {
        consumes += 1;
        return { rows: [], rowCount: consumes === 1 ? 1 : 0 };
      }
      if (sql.startsWith('SELECT 1 FROM siwx_nonces')) return { rows: [{}] };
      return { rows: [] };
    }, true);

    await storage.recordPayment('resource', '0xABCD', 'eip155:1');
    expect(await storage.hasUsedNonce('nonce-a')).toBe(true);
    await storage.recordNonce('nonce-b', {
      resource: 'resource',
      address: '0xABCD',
      expiresAt: 42,
    });
    expect(await storage.consumeNonce('nonce-c')).toBe('consumed');
    expect(await storage.consumeNonce('nonce-c')).toBe('already_used');
    await storage.clear();
    await storage.close();

    const payment = pool.queries.find(query =>
      query.sql.includes('INSERT INTO siwx_entitlements')
    );
    const recordedNonce = pool.queries.find(query =>
      query.sql.includes('ON CONFLICT (nonce) DO UPDATE')
    );
    expect(payment?.params.slice(0, 3)).toEqual([
      'resource',
      '0xabcd',
      'eip155:1',
    ]);
    expect(recordedNonce?.params).toEqual([
      'nonce-b',
      'resource',
      '0xABCD',
      expect.any(Number),
      42,
    ]);
    expect(pool.queries.slice(-2).map(query => query.sql)).toEqual([
      'DELETE FROM siwx_entitlements',
      'DELETE FROM siwx_nonces',
    ]);
    expect(pool.ends).toBe(1);
  });

  it('propagates query errors after logging the failed operation', async () => {
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = (): QueryResult => {
      throw new Error('database unavailable');
    };
    const operations: Array<() => Promise<unknown>> = [
      () => withPool(failure, true).storage.hasPaid('resource', '0xabc'),
      () => withPool(failure, true).storage.recordPayment('resource', '0xabc'),
      () => withPool(failure, true).storage.hasUsedNonce('nonce'),
      () => withPool(failure, true).storage.recordNonce('nonce'),
      () => withPool(failure, true).storage.consumeNonce('nonce'),
      () => withPool(failure, true).storage.clear(),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toThrow('database unavailable');
    }
    expect(logged).toHaveBeenCalledTimes(6);
    logged.mockRestore();
  });

  it('keeps the public factory compatible with the storage interface', async () => {
    const storage = createPostgresSIWxStorage('postgres://unused');
    expect(storage).toBeInstanceOf(PostgresSIWxStorage);
    await storage.close?.();
  });
});
