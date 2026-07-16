import { describe, expect, it } from 'bun:test';
import { normalizePaymentNetwork, validatePaymentsConfig } from '../validation';
import type { PaymentsConfig } from '@lucid-agents/types/payments';

describe('validatePaymentsConfig', () => {
  it('normalizes legacy aliases to the canonical CAIP-2 identifiers', () => {
    expect(normalizePaymentNetwork('base')).toBe('eip155:8453');
    expect(normalizePaymentNetwork('base-sepolia')).toBe('eip155:84532');
    expect(normalizePaymentNetwork('ethereum')).toBe('eip155:1');
    expect(normalizePaymentNetwork('sepolia')).toBe('eip155:11155111');
    expect(normalizePaymentNetwork('solana')).toBe(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
    );
    expect(normalizePaymentNetwork('solana-devnet')).toBe(
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
    );
  });

  it('preserves and normalizes canonical CAIP-2 identifiers', () => {
    expect(normalizePaymentNetwork(' EIP155:84532 ')).toBe('eip155:84532');
    expect(normalizePaymentNetwork('SOLANA:DEVNET')).toBe(
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
    );
  });

  it('rejects malformed and unsupported network identifiers', () => {
    expect(() => normalizePaymentNetwork('solana-testnet')).toThrow(
      'Unsupported payment network'
    );
    expect(() => normalizePaymentNetwork('eip155:999999')).toThrow(
      'Unsupported payment network'
    );
  });

  it('accepts static payments config', () => {
    const config: PaymentsConfig = {
      payTo: '0xabc0000000000000000000000000000000000000',
      facilitatorUrl: 'https://facilitator.test',
      network: 'eip155:84532',
    };

    expect(() =>
      validatePaymentsConfig(config, config.network, 'echo')
    ).not.toThrow();
  });

  it('accepts stripe mode on base network', () => {
    const config: PaymentsConfig = {
      stripe: {
        secretKey: 'sk_test_123',
      },
      facilitatorUrl: 'https://facilitator.test',
      network: 'eip155:8453',
    };

    expect(() =>
      validatePaymentsConfig(config, config.network, 'echo')
    ).not.toThrow();
  });

  it('rejects stripe mode on non-base network', () => {
    const config: PaymentsConfig = {
      stripe: {
        secretKey: 'sk_test_123',
      },
      facilitatorUrl: 'https://facilitator.test',
      network: 'eip155:84532',
    };

    expect(() =>
      validatePaymentsConfig(config, config.network, 'echo')
    ).toThrow('Stripe destination mode currently supports only Base mainnet');
  });
});
