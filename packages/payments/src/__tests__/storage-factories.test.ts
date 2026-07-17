import { describe, expect, it } from 'bun:test';

import {
  postgresPaymentStorageFactory,
  postgresSIWxStorageFactory,
} from '../storage/postgres';
import {
  sqlitePaymentStorageFactory,
  sqliteSIWxStorageFactory,
} from '../storage/sqlite';
import { PostgresPaymentStorage } from '../postgres-payment-storage';
import { PostgresSIWxStorage } from '../siwx-postgres-storage';
import { SQLitePaymentStorage } from '../sqlite-payment-storage';
import { SQLiteSIWxStorage } from '../siwx-sqlite-storage';

describe('payment storage factories', () => {
  it('creates SQLite payment and SIWX stores with in-memory defaults', async () => {
    const payment = sqlitePaymentStorageFactory();
    const siwx = sqliteSIWxStorageFactory();

    expect(payment).toBeInstanceOf(SQLitePaymentStorage);
    expect(siwx).toBeInstanceOf(SQLiteSIWxStorage);
    await payment.close();
    await siwx.close();
  });

  it('rejects non-SQLite configs at SQLite entrypoints', () => {
    expect(() => sqlitePaymentStorageFactory({ type: 'in-memory' })).toThrow(
      'Expected sqlite payment storage'
    );
    expect(() => sqliteSIWxStorageFactory({ type: 'in-memory' })).toThrow(
      'Expected sqlite SIWX storage'
    );
  });

  it('creates Postgres stores only when a connection string is supplied', async () => {
    const payment = postgresPaymentStorageFactory(
      {
        type: 'postgres',
        postgres: { connectionString: 'postgres://unused' },
      },
      'agent-a'
    );
    const siwx = postgresSIWxStorageFactory({
      type: 'postgres',
      postgres: { connectionString: 'postgres://unused' },
    });

    expect(payment).toBeInstanceOf(PostgresPaymentStorage);
    expect(siwx).toBeInstanceOf(PostgresSIWxStorage);
    await payment.close();
    await siwx.close();
  });

  it('fails closed for incomplete or mismatched Postgres configs', () => {
    expect(() => postgresPaymentStorageFactory(undefined)).toThrow(
      'requires connectionString'
    );
    expect(() => postgresPaymentStorageFactory({ type: 'in-memory' })).toThrow(
      'requires connectionString'
    );
    expect(() => postgresSIWxStorageFactory()).toThrow(
      'requires connectionString'
    );
    expect(() => postgresSIWxStorageFactory({ type: 'in-memory' })).toThrow(
      'requires connectionString'
    );
  });
});
