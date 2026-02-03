import { describe, expect, it } from 'bun:test';
import { paymentRequiredResponse } from '../payments';

describe('paymentRequiredResponse (x402 v2)', () => {
  it('sets PAYMENT-REQUIRED header and x402Version=2 without legacy headers', async () => {
    const response = paymentRequiredResponse({
      required: true,
      payTo: '0xabc1230000000000000000000000000000000000',
      price: '1.5',
      network: 'eip155:84532',
      facilitatorUrl: 'https://facilitator.test',
    });

    expect(response.status).toBe(402);
    expect(response.headers.get('PAYMENT-REQUIRED')).toBeTruthy();
    expect(response.headers.get('X-Price')).toBeNull();
    expect(response.headers.get('X-Network')).toBeNull();
    expect(response.headers.get('X-Pay-To')).toBeNull();
    expect(response.headers.get('X-Facilitator')).toBeNull();

    const body = await response.json();
    expect(body.x402Version).toBe(2);
  });
});
