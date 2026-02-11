import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createFacilitatorAuthHeaders, paymentsFromEnv } from '../utils';

const ENV_KEYS = [
  'PAYMENTS_RECEIVABLE_ADDRESS',
  'PAYMENTS_FACILITATOR_URL',
  'PAYMENTS_NETWORK',
  'PAYMENTS_DESTINATION',
  'FACILITATOR_URL',
  'NETWORK',
  'STRIPE_SECRET_KEY',
  'FACILITOR_AUTH',
  'FACILITATOR_AUTH',
  'PAYMENTS_FACILITATOR_AUTH',
  'DREAMS_AUTH_TOKEN',
] as const;

const originalEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  originalEnv[key] = process.env[key];
}

function resetEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (typeof value === 'undefined') {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

describe('paymentsFromEnv', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    resetEnv();
  });

  it('reads facilitator auth token from FACILITOR_AUTH', () => {
    process.env.PAYMENTS_RECEIVABLE_ADDRESS =
      '0xabc0000000000000000000000000000000000000';
    process.env.FACILITATOR_URL = 'https://facilitator.test';
    process.env.NETWORK = 'eip155:84532';
    process.env.FACILITOR_AUTH = 'token-from-typo-env';

    const config = paymentsFromEnv();

    expect(config.facilitatorAuth).toBe('token-from-typo-env');
  });

  it('prefers explicit config override for facilitator auth token', () => {
    process.env.PAYMENTS_RECEIVABLE_ADDRESS =
      '0xabc0000000000000000000000000000000000000';
    process.env.FACILITATOR_URL = 'https://facilitator.test';
    process.env.NETWORK = 'eip155:84532';
    process.env.FACILITOR_AUTH = 'env-token';

    const config = paymentsFromEnv({
      facilitatorAuth: 'override-token',
    });

    expect(config.facilitatorAuth).toBe('override-token');
  });

  it('falls back to DREAMS_AUTH_TOKEN when facilitator auth envs are not set', () => {
    process.env.PAYMENTS_RECEIVABLE_ADDRESS =
      '0xabc0000000000000000000000000000000000000';
    process.env.FACILITATOR_URL = 'https://facilitator.test';
    process.env.NETWORK = 'eip155:84532';
    process.env.DREAMS_AUTH_TOKEN = 'dreams-token';

    const config = paymentsFromEnv();

    expect(config.facilitatorAuth).toBe('dreams-token');
  });

  it('uses stripe mode when PAYMENTS_DESTINATION=stripe', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.PAYMENTS_DESTINATION = 'stripe';
    process.env.FACILITATOR_URL = 'https://facilitator.test';
    process.env.NETWORK = 'eip155:8453';

    const config = paymentsFromEnv();

    expect('stripe' in config).toBe(true);
    if ('stripe' in config) {
      expect(config.stripe.secretKey).toBe('sk_test_123');
    }
    expect('payTo' in config).toBe(false);
  });

  it('keeps static mode when only STRIPE_SECRET_KEY is set', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.PAYMENTS_RECEIVABLE_ADDRESS =
      '0xabc0000000000000000000000000000000000000';
    process.env.FACILITATOR_URL = 'https://facilitator.test';
    process.env.NETWORK = 'eip155:8453';

    const config = paymentsFromEnv();

    expect('payTo' in config).toBe(true);
    if ('payTo' in config) {
      expect(config.payTo).toBe('0xabc0000000000000000000000000000000000000');
    }
    expect('stripe' in config).toBe(false);
  });

  it('supports PAYMENTS_* aliases for facilitatorUrl and network', () => {
    process.env.PAYMENTS_RECEIVABLE_ADDRESS =
      '0xabc0000000000000000000000000000000000000';
    process.env.PAYMENTS_FACILITATOR_URL = 'https://facilitator.alias.test';
    process.env.PAYMENTS_NETWORK = 'eip155:84532';

    const config = paymentsFromEnv();

    expect(config.facilitatorUrl).toBe('https://facilitator.alias.test');
    expect(config.network).toBe('eip155:84532');
  });
});

describe('createFacilitatorAuthHeaders', () => {
  it('creates bearer headers for verify/settle/supported', () => {
    const headers = createFacilitatorAuthHeaders('secret-token');
    expect(headers?.verify.Authorization).toBe('Bearer secret-token');
    expect(headers?.settle.Authorization).toBe('Bearer secret-token');
    expect(headers?.supported.Authorization).toBe('Bearer secret-token');
  });

  it('normalizes existing bearer prefix', () => {
    const headers = createFacilitatorAuthHeaders('bearer existing-token');
    expect(headers?.verify.Authorization).toBe('Bearer existing-token');
  });
});
