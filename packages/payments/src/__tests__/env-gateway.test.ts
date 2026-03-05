/**
 * Tests for Circle Gateway env var integration in paymentsFromEnv().
 */
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';

const ENV_KEYS = [
  'CIRCLE_GATEWAY_FACILITATOR',
  'PAYMENTS_RECEIVABLE_ADDRESS',
  'PAYMENTS_NETWORK',
  'PAYMENTS_FACILITATOR_URL',
  'FACILITATOR_URL',
  'NETWORK',
  'PAYMENTS_DESTINATION',
  'STRIPE_SECRET_KEY',
  'FACILITOR_AUTH',
  'FACILITATOR_AUTH',
  'PAYMENTS_FACILITATOR_AUTH',
  'DREAMS_AUTH_TOKEN',
] as const;

const savedEnv: Record<string, string | undefined> = {};

function saveEnv() {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearTestEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe('paymentsFromEnv — Circle Gateway env vars', () => {
  beforeEach(() => {
    saveEnv();
    clearTestEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('CIRCLE_GATEWAY_FACILITATOR=true enables gateway facilitator', () => {
    process.env.CIRCLE_GATEWAY_FACILITATOR = 'true';
    process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xabc1000000000000000000000000000000000001';
    process.env.PAYMENTS_NETWORK = 'eip155:8453';

    const { paymentsFromEnv } = require('../utils');
    const config = paymentsFromEnv();

    expect((config as Record<string, unknown>).facilitator).toBe('circle-gateway');
  });

  it('CIRCLE_GATEWAY_FACILITATOR=false does NOT enable gateway', () => {
    process.env.CIRCLE_GATEWAY_FACILITATOR = 'false';
    process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xabc1000000000000000000000000000000000002';
    process.env.PAYMENTS_NETWORK = 'eip155:8453';

    const { paymentsFromEnv } = require('../utils');
    const config = paymentsFromEnv();

    expect((config as Record<string, unknown>).facilitator).toBeUndefined();
  });

  it('missing CIRCLE_GATEWAY_FACILITATOR = standard x402 config', () => {
    process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xabc1000000000000000000000000000000000003';
    process.env.PAYMENTS_NETWORK = 'eip155:8453';

    const { paymentsFromEnv } = require('../utils');
    const config = paymentsFromEnv();

    expect((config as Record<string, unknown>).facilitator).toBeUndefined();
  });

  it('circleGateway override enables gateway without env var', () => {
    process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xabc1000000000000000000000000000000000004';
    process.env.PAYMENTS_NETWORK = 'eip155:8453';

    const { paymentsFromEnv } = require('../utils');
    const config = paymentsFromEnv({
      circleGateway: { gatewayUrl: 'https://custom.circle.example' },
    });

    expect((config as Record<string, unknown>).facilitator).toBe('circle-gateway');
  });

  it('Circle Gateway sets facilitatorUrl to gateway.circle.com by default', () => {
    process.env.CIRCLE_GATEWAY_FACILITATOR = 'true';
    process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xabc1000000000000000000000000000000000005';
    process.env.PAYMENTS_NETWORK = 'eip155:8453';

    const { paymentsFromEnv } = require('../utils');
    const config = paymentsFromEnv() as Record<string, unknown>;

    expect(config.facilitatorUrl).toContain('circle.com');
  });

  it('CIRCLE_GATEWAY_FACILITATOR=TRUE (uppercase) enables gateway', () => {
    process.env.CIRCLE_GATEWAY_FACILITATOR = 'TRUE';
    process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xabc1000000000000000000000000000000000006';
    process.env.PAYMENTS_NETWORK = 'eip155:8453';

    const { paymentsFromEnv } = require('../utils');
    const config = paymentsFromEnv();

    expect((config as Record<string, unknown>).facilitator).toBe('circle-gateway');
  });
});
