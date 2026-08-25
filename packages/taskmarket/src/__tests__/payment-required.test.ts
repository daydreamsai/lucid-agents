import { describe, expect, it } from 'bun:test';

import { BASE_CAIP2, BASE_USDC_ADDRESS } from '../constants';
import { UnsafePaymentError } from '../errors';
import { parsePaymentRequired, selectSafeOffer } from '../payment-required';

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
}

const safeAccept = {
  scheme: 'exact',
  network: BASE_CAIP2,
  amount: '1500000',
  asset: BASE_USDC_ADDRESS,
  payTo: '0x1111111111111111111111111111111111111111',
};

describe('payment required validation', () => {
  it('parses a PAYMENT-REQUIRED header', () => {
    const response = new Response(null, {
      status: 402,
      headers: {
        'PAYMENT-REQUIRED': b64({ x402Version: 2, accepts: [safeAccept] }),
      },
    });
    const required = parsePaymentRequired(response, undefined);
    expect(required?.accepts?.[0]?.amount).toBe('1500000');
  });

  it('rejects a non-Base network without selecting it', () => {
    expect(() =>
      selectSafeOffer(
        {
          accepts: [{ ...safeAccept, network: 'eip155:1' }],
        },
        { amount: '1500000', maxSpendBaseUnits: '1500000' }
      )
    ).toThrow(UnsafePaymentError);
  });

  it('rejects a non-USDC asset', () => {
    expect(() =>
      selectSafeOffer(
        {
          accepts: [
            {
              ...safeAccept,
              asset: '0x0000000000000000000000000000000000000001',
            },
          ],
        },
        { amount: '1500000', maxSpendBaseUnits: '1500000' }
      )
    ).toThrow('canonical Base USDC');
  });

  it('rejects an amount that does not match the confirmed preview', () => {
    expect(() =>
      selectSafeOffer(
        { accepts: [{ ...safeAccept, amount: '1500001' }] },
        { amount: '1500000', maxSpendBaseUnits: '5000000' }
      )
    ).toThrow('does not match the confirmed amount');
  });

  it('rejects an amount above max spend', () => {
    expect(() =>
      selectSafeOffer(
        { accepts: [{ ...safeAccept, amount: '1500000' }] },
        { amount: '1500000', maxSpendBaseUnits: '1000' }
      )
    ).toThrow('exceeds max spend');
  });
});
