import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, test } from 'bun:test';

import { createPostgresTempoSessionStore } from '../postgres-tempo-session-store';

const connectionString = process.env.TEST_POSTGRES_URL;
const describePostgres = connectionString ? describe : describe.skip;
const stores: Array<{ close(): Promise<void> }> = [];

afterAll(async () => {
  await Promise.all(stores.map(store => store.close()));
});

describePostgres('Postgres Tempo session storage', () => {
  test('survives restart and serializes cross-pool deductions', async () => {
    const namespace = `tempo-${randomUUID()}`;
    const first = createPostgresTempoSessionStore(connectionString!, {
      namespace,
    });
    stores.push(first);
    await first.put('channel-a', {
      channelId: 'channel-a',
      spent: 0n,
      units: 0,
    });
    await first.close();
    stores.splice(stores.indexOf(first), 1);

    const left = createPostgresTempoSessionStore(connectionString!, {
      namespace,
    });
    const right = createPostgresTempoSessionStore(connectionString!, {
      namespace,
    });
    stores.push(left, right);
    const deduct = (store: typeof left) =>
      store.update<boolean>('channel-a', current => {
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

    expect(
      (await Promise.all([deduct(left), deduct(right), deduct(left)])).filter(
        Boolean
      )
    ).toHaveLength(2);
    expect(await right.get('channel-a')).toEqual({
      channelId: 'channel-a',
      spent: 2n,
      units: 2,
    });
  });
});
