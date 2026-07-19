import { describe, expect, it } from 'bun:test';

import { waitForConfirmation } from '../registries/utils';

const txHash =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;

describe('registry utilities', () => {
  it('waits for configured receipt confirmations', async () => {
    let received: unknown;
    const receipt = { logs: [] };

    expect(
      await waitForConfirmation(
        {
          async waitForTransactionReceipt(args: unknown) {
            received = args;
            return receipt;
          },
        },
        txHash,
        { confirmations: 3 }
      )
    ).toBe(receipt);
    expect(received).toEqual({ hash: txHash, confirmations: 3 });
  });

  it('falls back to polling a receipt or a fixed delay', async () => {
    const receipt = { logs: [] };
    expect(
      await waitForConfirmation(
        {
          async getTransactionReceipt({ hash }: { hash: string }) {
            expect(hash).toBe(txHash);
            return receipt;
          },
        },
        txHash,
        { timeout: 0 }
      )
    ).toBe(receipt);
    expect(
      await waitForConfirmation({}, txHash, { timeout: 0 })
    ).toBeUndefined();
  });
});
