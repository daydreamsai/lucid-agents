import { describe, expect, test } from 'bun:test';

import { createTempoSessionMeter } from '../tempo-session-meter';
import { createInMemoryTempoSessionStore } from '../tempo-session-store';

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
});
