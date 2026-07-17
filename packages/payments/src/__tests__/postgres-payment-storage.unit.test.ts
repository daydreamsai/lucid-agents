import { describe, expect, it, spyOn } from 'bun:test';

import {
  createPostgresPaymentStorage,
  PostgresPaymentStorage,
} from '../postgres-payment-storage';

type QueryRow = Record<string, unknown>;
type QueryResult = { rows: QueryRow[] };
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

const defaultHandler: QueryHandler = sql => {
  if (sql.includes('AS total') && sql.includes('accounted')) {
    return { rows: [{ total: '12' }] };
  }
  if (sql.includes('SELECT * FROM payments')) {
    return {
      rows: [
        {
          id: 7,
          group_name: 'daily',
          scope: 'global',
          direction: 'incoming',
          amount: '9',
          timestamp: '1234',
        },
      ],
    };
  }
  return { rows: [] };
};

const withPool = (
  agentId?: string,
  handle: QueryHandler = defaultHandler,
  schemaInitialized = false
): { storage: PostgresPaymentStorage; pool: FakePool } => {
  const storage = new PostgresPaymentStorage('postgres://unused', agentId);
  const pool = new FakePool(handle);
  const mutable = storage as unknown as {
    pool: FakePool;
    schemaInitialized: boolean;
  };
  mutable.pool = pool;
  mutable.schemaInitialized = schemaInitialized;
  return { storage, pool };
};

const reservation = {
  groupName: 'daily',
  scope: 'global',
  direction: 'incoming' as const,
  amount: 4n,
  maxTotal: 10n,
  ttlMs: 5_000,
};

const compact = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

describe('PostgresPaymentStorage without a live database', () => {
  it('initializes its schema and runs agent-scoped record queries', async () => {
    const { storage, pool } = withPool('agent-a');

    await storage.recordPayment({
      groupName: 'daily',
      scope: 'global',
      direction: 'incoming',
      amount: 5n,
    });
    expect(await storage.getTotal('daily', 'global', 'incoming', 1_000)).toBe(
      12n
    );
    expect(
      await storage.getAllRecords('daily', 'global', 'incoming', 1_000)
    ).toEqual([
      {
        id: 7,
        groupName: 'daily',
        scope: 'global',
        direction: 'incoming',
        amount: 9n,
        timestamp: 1234,
      },
    ]);
    await storage.releasePaymentReservation('reservation-a');
    await storage.close();

    expect(compact(pool.client.queries[0]!.sql)).toContain(
      'CREATE TABLE IF NOT EXISTS payments'
    );
    expect(pool.client.releases).toBe(1);
    expect(pool.queries.some(query => query.params[0] === 'agent-a')).toBe(
      true
    );
    expect(pool.queries[pool.queries.length - 1]?.params).toEqual([
      'reservation-a',
      'agent-a',
    ]);
    expect(pool.ends).toBe(1);
  });

  it('runs anonymous record queries and returns zero for an empty total', async () => {
    const { storage, pool } = withPool(undefined, sql => {
      if (sql.includes('SELECT SUM(amount) as total')) return { rows: [] };
      if (sql.includes('SELECT * FROM payments')) return { rows: [] };
      return { rows: [] };
    });

    await storage.recordPayment({
      groupName: 'daily',
      scope: 'global',
      direction: 'outgoing',
      amount: 3n,
    });
    expect(await storage.getTotal('daily', 'global', 'outgoing')).toBe(0n);
    expect(await storage.getAllRecords()).toEqual([]);
    await storage.releasePaymentReservation('reservation-b');

    expect(pool.queries.map(query => compact(query.sql)).join('\n')).toContain(
      'agent_id IS NULL'
    );
    expect(pool.queries[pool.queries.length - 1]?.params).toEqual([
      'reservation-b',
    ]);
  });

  it('allows and rejects atomic limit reservations for scoped tenants', async () => {
    const totals =
      (payment: string, pending: string): QueryHandler =>
      sql => {
        if (sql.includes('FROM payment_reservations') && sql.includes('SUM')) {
          return { rows: [{ total: pending }] };
        }
        if (sql.includes('FROM payments') && sql.includes('SUM')) {
          return { rows: [{ total: payment }] };
        }
        return { rows: [] };
      };
    const agent = withPool('agent-a', totals('2', '3'));
    const anonymous = withPool(undefined, totals('5', '2'));

    const allowed = await agent.storage.reservePaymentLimit(reservation);
    const denied = await anonymous.storage.reservePaymentLimit({
      ...reservation,
      windowMs: 60_000,
    });

    expect(allowed.allowed).toBe(true);
    expect(allowed.allowed && allowed.reservationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(denied).toEqual({ allowed: false });
    expect(
      agent.pool.client.queries.some(query =>
        query.sql.includes('pg_advisory_xact_lock')
      )
    ).toBe(true);
    expect(
      agent.pool.client.queries.some(query =>
        query.sql.includes('INSERT INTO payment_reservations')
      )
    ).toBe(true);
    expect(
      anonymous.pool.client.queries.filter(query => query.sql === 'COMMIT')
    ).toHaveLength(1);
  });

  it('commits individual and batched reservations with accounting records', async () => {
    const liveRow = {
      group_name: 'daily',
      scope: 'global',
      direction: 'incoming',
      amount: '4',
      expires_at: Date.now() + 60_000,
    };
    const handler: QueryHandler = sql =>
      sql.includes('FROM payment_reservations') && sql.includes('FOR UPDATE')
        ? { rows: [liveRow] }
        : { rows: [] };
    const agent = withPool('agent-a', handler);
    const anonymous = withPool(undefined, handler);

    expect(await agent.storage.commitPaymentReservation('single')).toBe(true);
    expect(
      await anonymous.storage.commitPaymentReservations(
        ['second', 'first'],
        [
          {
            groupName: 'audit',
            scope: 'history',
            direction: 'outgoing',
            amount: 2n,
          },
        ]
      )
    ).toBe(true);
    expect(
      await anonymous.storage.commitPaymentReservations(['same', 'same'])
    ).toBe(false);

    const selectParams = anonymous.pool.client.queries
      .filter(query => query.sql.includes('FOR UPDATE'))
      .map(query => query.params[0]);
    expect(selectParams).toEqual(['first', 'second']);
    expect(
      anonymous.pool.client.queries.filter(query =>
        query.sql.includes('INSERT INTO payments')
      )
    ).toHaveLength(3);
    expect(
      agent.pool.client.queries.some(query => query.params[1] === 'agent-a')
    ).toBe(true);
  });

  it('rejects missing and expired reservations and removes expired rows', async () => {
    const missing = withPool(undefined, () => ({ rows: [] }));
    const expired = withPool('agent-a', sql =>
      sql.includes('FOR UPDATE')
        ? {
            rows: [
              {
                group_name: 'daily',
                scope: 'global',
                direction: 'incoming',
                amount: '1',
                expires_at: Date.now() - 1,
              },
            ],
          }
        : { rows: [] }
    );

    expect(await missing.storage.commitPaymentReservations(['missing'])).toBe(
      false
    );
    expect(await expired.storage.commitPaymentReservations(['expired'])).toBe(
      false
    );
    expect(
      expired.pool.client.queries.some(query =>
        query.sql.includes('DELETE FROM payment_reservations')
      )
    ).toBe(true);
  });

  it('stages, commits, and releases durable settlement batches', async () => {
    const liveRow = {
      group_name: 'daily',
      scope: 'global',
      direction: 'incoming',
      amount: '4',
      expires_at: Date.now() + 60_000,
    };
    const stagedRows = [
      {
        group_name: 'daily',
        scope: 'global',
        direction: 'incoming',
        amount: '4',
        timestamp: Date.now(),
      },
      {
        group_name: 'audit',
        scope: 'history',
        direction: 'incoming',
        amount: '4',
        timestamp: Date.now(),
      },
    ];
    const { storage, pool } = withPool('agent-a', sql => {
      if (
        sql.includes('FROM payment_reservations') &&
        sql.includes('FOR UPDATE')
      ) {
        return { rows: [liveRow] };
      }
      if (
        sql.includes('FROM payment_settlement_entries') &&
        sql.includes('FOR UPDATE')
      ) {
        return { rows: stagedRows };
      }
      return { rows: [] };
    });

    const settlementId = await storage.stagePaymentSettlement(
      ['reservation-a'],
      [
        {
          groupName: 'audit',
          scope: 'history',
          direction: 'incoming',
          amount: 4n,
        },
      ]
    );
    expect(settlementId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      pool.client.queries.filter(query =>
        query.sql.includes('INSERT INTO payment_settlement_entries')
      )
    ).toHaveLength(2);

    expect(await storage.commitPaymentSettlement(settlementId!)).toBe(true);
    expect(
      pool.client.queries.filter(query =>
        query.sql.includes('INSERT INTO payments')
      )
    ).toHaveLength(2);
    expect(
      pool.client.queries.some(query =>
        query.sql.includes('DELETE FROM payment_settlement_entries')
      )
    ).toBe(true);

    await storage.releasePaymentSettlement('abandoned');
    expect(pool.queries[pool.queries.length - 1]?.params).toEqual([
      'abandoned',
      'agent-a',
    ]);
    expect(
      await storage.stagePaymentSettlement(
        ['duplicate', 'duplicate'],
        []
      )
    ).toBeUndefined();
  });

  it('rolls back failed reservations and commits tenant-specific clears', async () => {
    const reserveFailure = withPool(undefined, sql => {
      if (sql.includes('pg_advisory_xact_lock')) {
        throw new Error('lock failed');
      }
      return { rows: [] };
    });
    await expect(
      reserveFailure.storage.reservePaymentLimit(reservation)
    ).rejects.toThrow('lock failed');
    expect(
      reserveFailure.pool.client.queries.some(query => query.sql === 'ROLLBACK')
    ).toBe(true);

    const commitFailure = withPool(undefined, sql => {
      if (sql.includes('FOR UPDATE')) throw new Error('select failed');
      return { rows: [] };
    });
    await expect(
      commitFailure.storage.commitPaymentReservations(['reservation'])
    ).rejects.toThrow('select failed');
    expect(
      commitFailure.pool.client.queries.some(query => query.sql === 'ROLLBACK')
    ).toBe(true);

    const agent = withPool('agent-a');
    const anonymous = withPool();
    await agent.storage.clear();
    await anonymous.storage.clear();
    expect(
      agent.pool.client.queries.some(query => query.params[0] === 'agent-a')
    ).toBe(true);
    expect(
      anonymous.pool.client.queries.some(query =>
        query.sql.includes('WHERE agent_id IS NULL')
      )
    ).toBe(true);
  });

  it('surfaces storage query and clear failures after logging them', async () => {
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = (): QueryResult => {
      throw new Error('database unavailable');
    };
    const record = withPool(undefined, failure, true);
    const total = withPool(undefined, failure, true);
    const records = withPool(undefined, failure, true);
    const clear = withPool('agent-a', sql => {
      if (sql.includes('DELETE FROM payments')) {
        throw new Error('database unavailable');
      }
      return { rows: [] };
    });

    await expect(
      record.storage.recordPayment({
        groupName: 'daily',
        scope: 'global',
        direction: 'incoming',
        amount: 1n,
      })
    ).rejects.toThrow('database unavailable');
    await expect(
      total.storage.getTotal('daily', 'global', 'incoming')
    ).rejects.toThrow('database unavailable');
    await expect(records.storage.getAllRecords()).rejects.toThrow(
      'database unavailable'
    );
    await expect(clear.storage.clear()).rejects.toThrow('database unavailable');

    expect(logged).toHaveBeenCalledTimes(4);
    expect(
      clear.pool.client.queries.some(query => query.sql === 'ROLLBACK')
    ).toBe(true);
    logged.mockRestore();
  });

  it('keeps the public factory compatible with the storage interface', () => {
    const storage = createPostgresPaymentStorage('postgres://unused');
    expect(storage).toBeInstanceOf(PostgresPaymentStorage);
  });
});
