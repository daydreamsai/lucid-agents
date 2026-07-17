import { describe, expect, it } from 'bun:test';

import { stringToBytes32, waitForConfirmation } from '../registries/utils';

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

  it('encodes strings as bytes32 and accepts valid hex values', () => {
    const encoded = stringToBytes32('quality');
    expect(encoded).toHaveLength(66);
    expect(encoded.startsWith('0x7175616c697479')).toBe(true);
    expect(stringToBytes32(txHash)).toBe(txHash);
  });

  it('rejects malformed bytes32 values and oversized tags', () => {
    expect(() => stringToBytes32('0x1234')).toThrow(
      'Invalid bytes32 hex string'
    );
    expect(() => stringToBytes32('x'.repeat(33))).toThrow('is too long');
  });
});
