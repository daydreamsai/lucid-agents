import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createInMemoryTempoSessionStore } from '../tempo-session-store';
import { createTempoSessionMeter } from '../tempo-session-meter';
import { createSQLiteTempoSessionStore } from '../sqlite-tempo-session-store';

const channelId =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;

describe('Tempo session storage', () => {
  test('process-local storage preserves channel values and updates them atomically', async () => {
    const store = createInMemoryTempoSessionStore({ maxEntries: 2 });
    expect(store.durability).toBe('process');

    await store.put('channel-a', {
      channelId: 'channel-a',
      spent: 1n,
      units: 1,
    });
    const first = (await store.get('channel-a')) as {
      spent: bigint;
      units: number;
    };
    first.units = 99;

    const units = await store.update<number>('channel-a', current => {
      const channel = current as { spent: bigint; units: number };
      const next = {
        ...channel,
        spent: channel.spent + 2n,
        units: channel.units + 1,
      };
      return { op: 'set', value: next, result: next.units };
    });

    expect(units).toBe(2);
    expect(await store.get('channel-a')).toEqual({
      channelId: 'channel-a',
      spent: 3n,
      units: 2,
    });
    await store.close();
  });

  test('SQLite survives restart and serializes concurrent deductions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lucid-mpp-session-'));
    const path = join(directory, 'sessions.db');
    try {
      const first = createSQLiteTempoSessionStore(path, {
        namespace: 'merchant',
      });
      await first.put('channel-a', {
        channelId: 'channel-a',
        spent: 0n,
        units: 0,
      });
      await first.close();

      const second = createSQLiteTempoSessionStore(path, {
        namespace: 'merchant',
      });
      const deduct = () =>
        second.update<boolean>('channel-a', current => {
          const channel = current as { spent: bigint; units: number };
          if (channel.spent >= 2n) return { op: 'noop', result: false };
          return {
            op: 'set',
            value: {
              ...channel,
              spent: channel.spent + 1n,
              units: channel.units + 1,
            },
            result: true,
          };
        });

      expect(await Promise.all([deduct(), deduct(), deduct()])).toEqual([
        true,
        true,
        false,
      ]);
      expect(await second.get('channel-a')).toEqual({
        channelId: 'channel-a',
        spent: 2n,
        units: 2,
      });
      await second.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('SQLite resumes metering after restart and coordinates simultaneous meters', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lucid-mpp-meter-'));
    const path = join(directory, 'sessions.db');
    try {
      const initial = createSQLiteTempoSessionStore(path);
      await initial.put(channelId, {
        channelId,
        deposit: 3n,
        highestVoucherAmount: 3n,
        spent: 0n,
        units: 0,
        finalized: false,
        closeRequestedAt: 0n,
      });
      const beforeRestart = createTempoSessionMeter({
        store: initial,
        channelId,
        challengeId: 'before-restart',
        tickCost: 1n,
        maximumAmount: 3n,
        unitType: 'request',
      });
      expect((await beforeRestart.charge()).status).toBe('charged');
      await initial.close();

      const resumed = createSQLiteTempoSessionStore(path);
      const first = createTempoSessionMeter({
        store: resumed,
        channelId,
        challengeId: 'after-restart-a',
        tickCost: 1n,
        maximumAmount: 3n,
        unitType: 'request',
      });
      const second = createTempoSessionMeter({
        store: resumed,
        channelId,
        challengeId: 'after-restart-b',
        tickCost: 1n,
        maximumAmount: 3n,
        unitType: 'request',
      });

      expect(
        (await Promise.all([first.charge(), second.charge()])).map(
          result => result.status
        )
      ).toEqual(['charged', 'charged']);
      expect((await first.receipt()).data).toMatchObject({
        acceptedCumulative: '3',
        spent: '3',
        units: 3,
      });
      expect((await second.charge()).status).toBe('unavailable');
      await resumed.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
