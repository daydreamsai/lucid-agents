import { describe, expect, it } from 'bun:test';

import { negotiateMppOffers, parseAcceptPayment } from '../negotiation';

const offers = [
  { method: 'tempo', intent: 'charge' },
  { method: 'stripe', intent: 'charge' },
  { method: 'evm', intent: 'charge' },
] as const;

describe('Accept-Payment negotiation', () => {
  it('preserves server order when the header is absent or malformed', () => {
    expect(negotiateMppOffers(offers, null)).toEqual([...offers]);
    expect(negotiateMppOffers(offers, 'not a payment preference')).toEqual([
      ...offers,
    ]);
  });

  it('filters and deterministically orders compatible offers', () => {
    expect(
      negotiateMppOffers(
        offers,
        'stripe/charge;q=0.8, evm/charge, tempo/charge;q=0'
      )
    ).toEqual([offers[2], offers[1]]);
  });

  it('lets a specific opt-out override a broader wildcard', () => {
    expect(
      negotiateMppOffers(
        offers,
        'tempo/*;q=1, tempo/charge;q=0, */charge;q=0.5'
      )
    ).toEqual([offers[1], offers[2]]);
  });

  it('returns no offers when every compatible preference opts out', () => {
    expect(
      negotiateMppOffers(
        offers,
        'tempo/charge;q=0, stripe/charge;q=0, evm/charge;q=0'
      )
    ).toEqual([]);
  });

  it('falls back to server offers when a valid header matches none', () => {
    expect(negotiateMppOffers(offers, 'lightning/session')).toEqual([
      ...offers,
    ]);
  });

  it('parses q-values without accepting invalid precision or casing', () => {
    expect(parseAcceptPayment('stripe/charge;q=0.125')).toEqual([
      {
        method: 'stripe',
        intent: 'charge',
        q: 0.125,
        index: 0,
      },
    ]);
    expect(() => parseAcceptPayment('Stripe/charge')).toThrow();
    expect(() => parseAcceptPayment('stripe/charge;q=0.1234')).toThrow();
  });
});
