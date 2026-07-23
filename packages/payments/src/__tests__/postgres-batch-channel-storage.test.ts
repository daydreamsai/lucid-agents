import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Channel } from '@x402/evm/batch-settlement/server';

import type { BatchChannelStorage } from '../batch-channel-storage';
import {
  createPostgresBatchChannelStorage,
  type PostgresBatchChannelStorage,
} from '../postgres-batch-channel-storage';

const connectionString = process.env.TEST_POSTGRES_URL;
const describePostgres = connectionString ? describe : describe.skip;
const CHANNEL_ID = `0x${'cd'.repeat(32)}`;

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

describePostgres('PostgresBatchChannelStorage integration', () => {
  const namespace = `batch-test-${crypto.randomUUID()}`;
  let first: PostgresBatchChannelStorage;
  let second: PostgresBatchChannelStorage;

  beforeAll(() => {
    first = createPostgresBatchChannelStorage(connectionString!, {
      namespace,
    });
    second = createPostgresBatchChannelStorage(connectionString!, {
      namespace,
    });
  });

  afterAll(async () => {
    await first.clear();
    await first.close();
    await second.close();
  });

  test('serializes multi-pool updates and recovers after restart', async () => {
    await first.updateChannel(CHANNEL_ID, () => channel());
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

    await first.close();
    first = createPostgresBatchChannelStorage(connectionString!, {
      namespace,
    });
    expect((await first.get(CHANNEL_ID))?.chargedCumulativeAmount).toBe('20');
  });
});
