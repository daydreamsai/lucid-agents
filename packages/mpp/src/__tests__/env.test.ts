import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import { custom, mppFromEnv } from '../index';

const envKeys = [
  'MPP_METHOD',
  'MPP_CURRENCY',
  'MPP_DEFAULT_INTENT',
  'MPP_CHALLENGE_EXPIRY',
  'MPP_SECRET_KEY',
  'MPP_REALM',
  'MPP_TEMPO_CURRENCY',
  'MPP_TEMPO_RECIPIENT',
  'MPP_TEMPO_CHAIN_ID',
  'PAYMENTS_RECEIVABLE_ADDRESS',
  'MPP_STRIPE_SECRET_KEY',
  'STRIPE_SECRET_KEY',
  'MPP_STRIPE_NETWORK_ID',
] as const;

const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]])
);

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('mppFromEnv', () => {
  it('preserves an explicitly supplied credential verifier', () => {
    const verifyCredential = async () => ({
      valid: true as const,
      receipt: 'environment-verifier-receipt',
    });

    const config = mppFromEnv({
      methods: [custom.server('test', {})],
      verifyCredential,
    });

    expect(config.verifyCredential).toBe(verifyCredential);
  });

  it('builds Tempo and Stripe methods from environment variables', () => {
    process.env.MPP_METHOD = 'tempo, stripe';
    process.env.MPP_TEMPO_CURRENCY = '0xtoken';
    process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xrecipient';
    process.env.MPP_TEMPO_CHAIN_ID = '42431';
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.MPP_STRIPE_NETWORK_ID = 'base-sepolia';
    process.env.MPP_CURRENCY = 'eur';
    process.env.MPP_DEFAULT_INTENT = 'session';
    process.env.MPP_CHALLENGE_EXPIRY = '45';
    process.env.MPP_SECRET_KEY = 'challenge-secret';
    process.env.MPP_REALM = 'agent.example.com';

    const config = mppFromEnv();

    expect(config.methods).toEqual([
      {
        name: 'tempo',
        implementation: 'tempo',
        config: {
          currency: '0xtoken',
          recipient: '0xrecipient',
          chainId: 42431,
        },
      },
      {
        name: 'stripe',
        implementation: 'stripe',
        config: { secretKey: 'sk_test', networkId: 'base-sepolia' },
      },
    ]);
    expect(config).toEqual(
      expect.objectContaining({
        currency: 'eur',
        defaultIntent: 'session',
        challengeExpirySeconds: 45,
        secretKey: 'challenge-secret',
        realm: 'agent.example.com',
      })
    );
  });

  it('warns and skips incomplete or unknown methods', () => {
    process.env.MPP_METHOD = 'tempo,stripe,lightning';
    const warning = spyOn(console, 'warn').mockImplementation(() => undefined);

    const config = mppFromEnv();

    expect(config.methods).toEqual([]);
    expect(warning).toHaveBeenCalledTimes(3);
    expect(config.currency).toBe('usd');
    expect(config.defaultIntent).toBe('charge');
    expect(config.challengeExpirySeconds).toBe(300);
    warning.mockRestore();
  });

  it('prefers explicit overrides and optional session configuration', () => {
    process.env.MPP_CURRENCY = 'ignored';
    const session = { amount: '10.00' };
    const method = custom.server('custom', {});

    const config = mppFromEnv({
      methods: [method],
      currency: 'aud',
      defaultIntent: 'session',
      challengeExpirySeconds: 90,
      realm: 'override-realm',
      secretKey: 'override-secret',
      session,
    });

    expect(config.methods).toEqual([method]);
    expect(config).toEqual(
      expect.objectContaining({
        currency: 'aud',
        defaultIntent: 'session',
        challengeExpirySeconds: 90,
        realm: 'override-realm',
        secretKey: 'override-secret',
        session,
      })
    );
  });
});
