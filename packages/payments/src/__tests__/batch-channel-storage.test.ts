import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Channel } from '@x402/evm/batch-settlement/server';

import type { BatchChannelStorage } from '../batch-channel-storage';
import { createInMemoryBatchChannelStorage } from '../in-memory-batch-channel-storage';
import { createSQLiteBatchChannelStorage } from '../sqlite-batch-channel-storage';

const CHANNEL_ID = `0x${'ab'.repeat(32)}`;

function createChannel(
  channelId = CHANNEL_ID,
  chargedCumulativeAmount = '0'
): Channel {
  return {
    channelId,
    channelConfig: {
      payer: `0x${'11'.repeat(20)}`,
      payerAuthorizer: `0x${'22'.repeat(20)}`,
      receiver: `0x${'33'.repeat(20)}`,
      receiverAuthorizer: `0x${'44'.repeat(20)}`,
      token: `0x${'55'.repeat(20)}`,
      withdrawDelay: 900,
      salt: `0x${'66'.repeat(32)}`,
    },
    chargedCumulativeAmount,
    signedMaxClaimable: chargedCumulativeAmount,
    signature: `0x${'77'.repeat(65)}`,
    balance: '100',
    totalClaimed: '0',
    withdrawRequestedAt: 0,
    refundNonce: 0,
    lastRequestTimestamp: 1_000,
  };
}

function runStorageContract(
  name: string,
  createStorage: () => BatchChannelStorage
): void {
  describe(name, () => {
    test('implements create, unchanged, delete, list, and cleanup semantics', async () => {
      const storage = createStorage();

      expect(
        await storage.updateChannel(`0x${'AB'.repeat(32)}`, current => {
          expect(current).toBeUndefined();
          return createChannel(`0x${'AB'.repeat(32)}`);
        })
      ).toMatchObject({ status: 'updated' });
      expect((await storage.get(CHANNEL_ID))?.channelId).toBe(
        CHANNEL_ID.toLowerCase()
      );

      const unchanged = await storage.updateChannel(CHANNEL_ID, current => {
        expect(current?.chargedCumulativeAmount).toBe('0');
        return current;
      });
      expect(unchanged.status).toBe('unchanged');
      expect(await storage.list()).toHaveLength(1);

      expect(await storage.updateChannel(CHANNEL_ID, () => undefined)).toEqual({
        channel: undefined,
        status: 'deleted',
      });
      expect(await storage.get(CHANNEL_ID)).toBeUndefined();

      await storage.updateChannel(CHANNEL_ID, () => createChannel());
      await storage.clear();
      expect(await storage.list()).toEqual([]);
      await storage.close();
      await expect(storage.get(CHANNEL_ID)).rejects.toThrow('closed');
    });

    test('serializes voucher races without losing cumulative updates', async () => {
      const storage = createStorage();
      await storage.updateChannel(CHANNEL_ID, () => createChannel());

      await Promise.all(
        Array.from({ length: 25 }, () =>
          storage.updateChannel(CHANNEL_ID, current => {
            if (!current) throw new Error('Missing channel');
            const next = (
              BigInt(current.chargedCumulativeAmount) + 1n
            ).toString();
            return {
              ...current,
              chargedCumulativeAmount: next,
              signedMaxClaimable: next,
            };
          })
        )
      );

      expect((await storage.get(CHANNEL_ID))?.chargedCumulativeAmount).toBe(
        '25'
      );
      await storage.close();
    });

    test('rejects stale cumulative voucher updates atomically', async () => {
      const storage = createStorage();
      await storage.updateChannel(CHANNEL_ID, () => createChannel());

      const applyVoucher = (amount: bigint) =>
        storage.updateChannel(CHANNEL_ID, current => {
          if (!current || amount <= BigInt(current.signedMaxClaimable)) {
            return current;
          }
          const cumulative = amount.toString();
          return {
            ...current,
            chargedCumulativeAmount: cumulative,
            signedMaxClaimable: cumulative,
          };
        });

      await Promise.all([
        applyVoucher(5n),
        applyVoucher(3n),
        applyVoucher(9n),
        applyVoucher(7n),
      ]);
      const stale = await applyVoucher(8n);

      expect(stale.status).toBe('unchanged');
      expect((await storage.get(CHANNEL_ID))?.signedMaxClaimable).toBe('9');
      await storage.close();
    });
  });
}

runStorageContract('InMemoryBatchChannelStorage', () =>
  createInMemoryBatchChannelStorage()
);

const sqliteDirectories: string[] = [];

afterEach(() => {
  for (const directory of sqliteDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

runStorageContract('SQLiteBatchChannelStorage', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lucid-batch-channel-'));
  sqliteDirectories.push(directory);
  return createSQLiteBatchChannelStorage(join(directory, 'channels.db'));
});

describe('durable batch channel storage', () => {
  test('SQLite survives restart and recovers pending request state', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lucid-batch-restart-'));
    sqliteDirectories.push(directory);
    const dbPath = join(directory, 'channels.db');
    const first = createSQLiteBatchChannelStorage(dbPath, {
      namespace: 'agent-a',
    });
    await first.updateChannel(CHANNEL_ID, () => ({
      ...createChannel(),
      pendingRequest: {
        pendingId: 'pending-1',
        signedMaxClaimable: '7',
        expiresAt: 9_000,
      },
    }));
    first.close();

    const second = createSQLiteBatchChannelStorage(dbPath, {
      namespace: 'agent-a',
    });
    expect((await second.get(CHANNEL_ID))?.pendingRequest).toEqual({
      pendingId: 'pending-1',
      signedMaxClaimable: '7',
      expiresAt: 9_000,
    });
    second.close();
  });

  test('two SQLite runtimes share one atomic update fence', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lucid-batch-race-'));
    sqliteDirectories.push(directory);
    const dbPath = join(directory, 'channels.db');
    const first = createSQLiteBatchChannelStorage(dbPath, {
      namespace: 'agent-a',
    });
    const second = createSQLiteBatchChannelStorage(dbPath, {
      namespace: 'agent-a',
    });
    await first.updateChannel(CHANNEL_ID, () => createChannel());

    const increment = (storage: BatchChannelStorage) =>
      storage.updateChannel(CHANNEL_ID, current => {
        if (!current) throw new Error('Missing channel');
        return {
          ...current,
          chargedCumulativeAmount: (
            BigInt(current.chargedCumulativeAmount) + 1n
          ).toString(),
        };
      });
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        increment(index % 2 === 0 ? first : second)
      )
    );

    expect((await first.get(CHANNEL_ID))?.chargedCumulativeAmount).toBe('20');
    first.close();
    second.close();
  });

  test('SQLite serializes voucher updates across Bun processes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lucid-batch-process-'));
    sqliteDirectories.push(directory);
    const dbPath = join(directory, 'channels.db');
    const namespace = 'agent-process';
    const storage = createSQLiteBatchChannelStorage(dbPath, { namespace });
    await storage.updateChannel(CHANNEL_ID, () => createChannel());
    storage.close();

    const worker = fileURLToPath(
      new URL('./fixtures/sqlite-batch-channel-worker.ts', import.meta.url)
    );
    const processes = Array.from({ length: 2 }, () =>
      Bun.spawn({
        cmd: [
          process.execPath,
          worker,
          dbPath,
          namespace,
          CHANNEL_ID,
          'increment',
          '25',
        ],
        stdout: 'pipe',
        stderr: 'pipe',
      })
    );
    const exitCodes = await Promise.all(
      processes.map(process => process.exited)
    );
    if (exitCodes.some(code => code !== 0)) {
      const errors = await Promise.all(
        processes.map(process => new Response(process.stderr).text())
      );
      throw new Error(`SQLite batch workers failed: ${errors.join('\n')}`);
    }

    const recovered = createSQLiteBatchChannelStorage(dbPath, { namespace });
    expect((await recovered.get(CHANNEL_ID))?.chargedCumulativeAmount).toBe(
      '50'
    );
    recovered.close();
  });

  test('SQLite rejects stale vouchers and cleans up across processes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lucid-batch-stale-'));
    sqliteDirectories.push(directory);
    const dbPath = join(directory, 'channels.db');
    const namespace = 'agent-stale';
    const storage = createSQLiteBatchChannelStorage(dbPath, { namespace });
    await storage.updateChannel(CHANNEL_ID, () => createChannel());
    storage.close();

    const worker = fileURLToPath(
      new URL('./fixtures/sqlite-batch-channel-worker.ts', import.meta.url)
    );
    const spawnWorker = (mode: string, value: string) =>
      Bun.spawn({
        cmd: [
          process.execPath,
          worker,
          dbPath,
          namespace,
          CHANNEL_ID,
          mode,
          value,
        ],
        stdout: 'pipe',
        stderr: 'pipe',
      });
    const voucherProcesses = [
      spawnWorker('voucher', '5'),
      spawnWorker('voucher', '9'),
      spawnWorker('voucher', '7'),
    ];
    expect(
      await Promise.all(voucherProcesses.map(process => process.exited))
    ).toEqual([0, 0, 0]);

    const stale = spawnWorker('voucher', '8');
    expect(await stale.exited).toBe(0);
    const recovered = createSQLiteBatchChannelStorage(dbPath, { namespace });
    expect((await recovered.get(CHANNEL_ID))?.signedMaxClaimable).toBe('9');
    recovered.close();

    const cleanup = spawnWorker('delete', '1');
    expect(await cleanup.exited).toBe(0);
    const cleaned = createSQLiteBatchChannelStorage(dbPath, { namespace });
    expect(await cleaned.get(CHANNEL_ID)).toBeUndefined();
    cleaned.close();
  });
});
