import { describe, expect, test } from 'bun:test';
import type {
  TempoSessionStore,
  TempoSessionStoreChange,
} from '@lucid-agents/types/mpp';

import { createTempoSessionMeter } from '../tempo-session-meter';
import {
  createInMemoryTempoSessionStore,
  type InMemoryTempoSessionStore,
} from '../tempo-session-store';

const channelId =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;

function channel(overrides: Record<string, unknown> = {}) {
  return {
    channelId,
    deposit: 3n,
    highestVoucherAmount: 2n,
    spent: 0n,
    units: 0,
    finalized: false,
    closeRequestedAt: 0n,
    ...overrides,
  };
}

function spent(value: unknown): bigint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = (value as { spent?: unknown }).spent;
  return typeof candidate === 'bigint' ? candidate : undefined;
}

function failNextSpentDecrease(
  delegate: InMemoryTempoSessionStore
): TempoSessionStore {
  let shouldFail = true;
  return {
    durability: delegate.durability,
    get: key => delegate.get(key),
    put: (key, value) => delegate.put(key, value),
    delete: key => delegate.delete(key),
    update: async <Result>(
      key: string,
      fn: (
        current: unknown | null
      ) => TempoSessionStoreChange<Result>
    ): Promise<Result> =>
      delegate.update(key, current => {
        const change = fn(current);
        if (
          shouldFail &&
          change.op === 'set' &&
          spent(change.value) !== undefined &&
          spent(current) !== undefined &&
          spent(change.value)! < spent(current)!
        ) {
          shouldFail = false;
          throw new Error('transient durable store failure');
        }
        return change;
      }),
    close: () => delegate.close(),
  };
}

describe('Tempo session meter', () => {
  test('atomically charges one unit and returns an upstream-shaped receipt', async () => {
    const store = createInMemoryTempoSessionStore();
    await store.put(channelId, channel());
    const meter = createTempoSessionMeter({
      store,
      channelId,
      challengeId: 'challenge-a',
      tickCost: 1n,
      maximumAmount: 3n,
      unitType: 'token',
    });

    const [first, second, third] = await Promise.all([
      meter.charge(),
      meter.charge(),
      meter.charge(),
    ]);
    expect(first.status).toBe('charged');
    expect(second.status).toBe('charged');
    expect(third.status).toBe('unavailable');

    const receipt = await meter.receipt();
    expect(receipt.event).toBe('payment-receipt');
    expect(receipt.data).toMatchObject({
      method: 'tempo',
      intent: 'session',
      challengeId: 'challenge-a',
      channelId,
      acceptedCumulative: '2',
      spent: '2',
      units: 2,
    });
    expect(receipt.serialized).toMatch(/^[A-Za-z0-9_-]+$/);
    if (first.status !== 'charged') throw new Error('Expected charged unit');
    await Promise.all([first.rollback(), first.rollback()]);
    expect(await store.get(channelId)).toMatchObject({
      spent: 1n,
      units: 1,
    });
    await store.close();
  });

  test('waits for a voucher update and reports the standard need-voucher data', async () => {
    const store = createInMemoryTempoSessionStore();
    await store.put(channelId, channel({ highestVoucherAmount: 0n }));
    const events: unknown[] = [];
    const meter = createTempoSessionMeter({
      store,
      channelId,
      challengeId: 'challenge-b',
      tickCost: 1n,
      maximumAmount: 3n,
      unitType: 'request',
      pollIntervalMs: 1,
      timeoutMs: 100,
    });

    const charge = meter.charge({
      onNeedVoucher: event => {
        events.push(event);
      },
    });
    await Bun.sleep(5);
    await store.update(channelId, current => ({
      op: 'set',
      value: { ...(current as object), highestVoucherAmount: 1n },
      result: undefined,
    }));

    expect((await charge).status).toBe('charged');
    expect(events[0]).toEqual({
      event: 'payment-need-voucher',
      data: {
        channelId,
        requiredCumulative: '1',
        acceptedCumulative: '0',
        deposit: '3',
      },
    });
    await store.close();
  });

  test('retries a charged unit rollback after a transient store failure', async () => {
    const durableState = createInMemoryTempoSessionStore();
    await durableState.put(channelId, channel());
    const meter = createTempoSessionMeter({
      store: failNextSpentDecrease(durableState),
      channelId,
      challengeId: 'challenge-retry-rollback',
      tickCost: 1n,
      maximumAmount: 3n,
      unitType: 'chunk',
    });

    const charged = await meter.charge();
    if (charged.status !== 'charged') throw new Error('Expected charged unit');
    await expect(charged.rollback()).rejects.toThrow(
      'transient durable store failure'
    );
    await charged.rollback();

    expect(await durableState.get(channelId)).toMatchObject({
      spent: 0n,
      units: 0,
    });
    await durableState.close();
  });

  test('rolls back only an unused prepaid unit when cancelled', async () => {
    const store = createInMemoryTempoSessionStore();
    await store.put(
      channelId,
      channel({ spent: 1n, units: 1, highestVoucherAmount: 2n })
    );
    const meter = createTempoSessionMeter({
      store,
      channelId,
      challengeId: 'challenge-prepaid',
      tickCost: 1n,
      maximumAmount: 3n,
      unitType: 'chunk',
      prepaidUnits: 1,
    });

    await Promise.all([meter.cancel(), meter.cancel()]);
    expect(await store.get(channelId)).toMatchObject({
      spent: 0n,
      units: 0,
      highestVoucherAmount: 2n,
    });
    await store.close();
  });

  test('retries prepaid cancellation after a transient store failure', async () => {
    const durableState = createInMemoryTempoSessionStore();
    await durableState.put(
      channelId,
      channel({ spent: 1n, units: 1, highestVoucherAmount: 2n })
    );
    const meter = createTempoSessionMeter({
      store: failNextSpentDecrease(durableState),
      channelId,
      challengeId: 'challenge-retry-cancel',
      tickCost: 1n,
      maximumAmount: 3n,
      unitType: 'chunk',
      prepaidUnits: 1,
    });

    await expect(meter.cancel()).rejects.toThrow(
      'transient durable store failure'
    );
    await meter.cancel();

    expect(await durableState.get(channelId)).toMatchObject({
      spent: 0n,
      units: 0,
    });
    await durableState.close();
  });
});
