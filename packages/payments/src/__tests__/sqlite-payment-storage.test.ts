import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  createSQLitePaymentStorage,
  SQLitePaymentStorage,
} from '../sqlite-payment-storage';

const directories: string[] = [];
const storages: SQLitePaymentStorage[] = [];

const createStorage = (): SQLitePaymentStorage => {
  const directory = mkdtempSync(join(tmpdir(), 'lucid-sqlite-storage-'));
  directories.push(directory);
  const storage = new SQLitePaymentStorage(
    join(directory, 'nested', 'payments.sqlite')
  );
  storages.push(storage);
  return storage;
};

afterEach(() => {
  for (const storage of storages.splice(0)) storage.close();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SQLitePaymentStorage', () => {
  it('records, totals, filters, and maps payment rows', async () => {
    const storage = createStorage();
    await storage.recordPayment({
      groupName: 'daily',
      scope: 'global',
      direction: 'incoming',
      amount: 2n,
    });
    await storage.recordPayment({
      groupName: 'daily',
      scope: 'target',
      direction: 'outgoing',
      amount: 3n,
    });

    expect(await storage.getTotal('daily', 'global', 'incoming')).toBe(2n);
    expect(await storage.getTotal('daily', 'global', 'incoming', 60_000)).toBe(
      2n
    );
    expect(await storage.getAllRecords()).toHaveLength(2);
    expect(await storage.getAllRecords('daily')).toHaveLength(2);
    expect(await storage.getAllRecords('daily', 'global')).toHaveLength(1);
    expect(await storage.getAllRecords('daily', 'global', 'incoming')).toEqual([
      expect.objectContaining({
        groupName: 'daily',
        scope: 'global',
        direction: 'incoming',
        amount: 2n,
      }),
    ]);
    expect(
      await storage.getAllRecords('daily', 'global', 'incoming', 60_000)
    ).toHaveLength(1);
  });

  it('reserves capacity with lifetime and windowed limits', async () => {
    const storage = createStorage();
    await storage.recordPayment({
      groupName: 'daily',
      scope: 'global',
      direction: 'incoming',
      amount: 2n,
    });
    const base = {
      groupName: 'daily',
      scope: 'global',
      direction: 'incoming' as const,
      amount: 3n,
      maxTotal: 10n,
      ttlMs: 60_000,
    };

    const first = await storage.reservePaymentLimit(base);
    expect(first.allowed).toBe(true);
    expect(
      await storage.reservePaymentLimit({
        ...base,
        amount: 6n,
        windowMs: 60_000,
      })
    ).toEqual({ allowed: false });
    if (first.allowed)
      await storage.releasePaymentReservation(first.reservationId);
    expect(
      await storage.reservePaymentLimit({ ...base, windowMs: 60_000 })
    ).toEqual(expect.objectContaining({ allowed: true }));
  });

  it('commits reservations and additional accounting records atomically', async () => {
    const storage = createStorage();
    const first = await storage.reservePaymentLimit({
      groupName: 'daily',
      scope: 'global',
      direction: 'incoming',
      amount: 4n,
      maxTotal: 10n,
      ttlMs: 60_000,
    });
    if (!first.allowed) throw new Error('Expected reservation');

    expect(await storage.commitPaymentReservation(first.reservationId)).toBe(
      true
    );
    expect(await storage.getTotal('daily', 'global', 'incoming')).toBe(4n);

    const second = await storage.reservePaymentLimit({
      groupName: 'daily',
      scope: 'global',
      direction: 'incoming',
      amount: 1n,
      maxTotal: 10n,
      ttlMs: 60_000,
    });
    if (!second.allowed) throw new Error('Expected reservation');
    expect(
      await storage.commitPaymentReservations(
        [second.reservationId],
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
    expect(await storage.getTotal('audit', 'history', 'outgoing')).toBe(2n);
    expect(
      await storage.commitPaymentReservations(['duplicate', 'duplicate'])
    ).toBe(false);
    expect(await storage.commitPaymentReservations(['missing'])).toBe(false);
  });

  it('rejects expired reservations and clears all state', async () => {
    const storage = createStorage();
    const expired = await storage.reservePaymentLimit({
      groupName: 'daily',
      scope: 'global',
      direction: 'incoming',
      amount: 1n,
      maxTotal: 10n,
      ttlMs: -1,
    });
    if (!expired.allowed) throw new Error('Expected reservation');

    expect(
      await storage.commitPaymentReservations([expired.reservationId])
    ).toBe(false);
    await storage.recordPayment({
      groupName: 'daily',
      scope: 'global',
      direction: 'incoming',
      amount: 1n,
    });
    await storage.clear();
    expect(await storage.getAllRecords()).toEqual([]);
  });

  it('creates storage through the public factory', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lucid-sqlite-factory-'));
    directories.push(directory);
    const storage = createSQLitePaymentStorage(join(directory, 'payments.db'));
    expect(storage).toBeInstanceOf(SQLitePaymentStorage);
    storage.close?.();
  });
});
