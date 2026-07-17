import { describe, expect, it, spyOn } from 'bun:test';
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

  it('reports each missing static payment field', () => {
    const error = spyOn(console, 'error').mockImplementation(() => undefined);
    const valid = {
      payTo: '0xabc0000000000000000000000000000000000000',
      facilitatorUrl: 'https://facilitator.test',
      network: 'eip155:84532',
    } as PaymentsConfig;

    expect(() =>
      validatePaymentsConfig(
        { ...valid, payTo: undefined } as never,
        valid.network,
        'missing-payee'
      )
    ).toThrow('PAYMENTS_RECEIVABLE_ADDRESS');
    expect(() =>
      validatePaymentsConfig(
        { ...valid, facilitatorUrl: undefined } as never,
        valid.network,
        'missing-facilitator'
      )
    ).toThrow('FACILITATOR_URL');
    expect(() =>
      validatePaymentsConfig(valid, undefined, 'missing-network')
    ).toThrow('NETWORK is not set');
    expect(error).toHaveBeenCalledTimes(3);
    error.mockRestore();
  });

  it('requires a Stripe secret and reports unsupported networks', () => {
    const error = spyOn(console, 'error').mockImplementation(() => undefined);
    const stripe = {
      stripe: { secretKey: '  ' },
      facilitatorUrl: 'https://facilitator.test',
      network: 'eip155:8453',
    } as PaymentsConfig;

    expect(() =>
      validatePaymentsConfig(stripe, stripe.network, 'stripe')
    ).toThrow('STRIPE_SECRET_KEY');
    expect(() =>
      validatePaymentsConfig(
        {
          payTo: '0xabc0000000000000000000000000000000000000',
          facilitatorUrl: 'https://facilitator.test',
          network: 'eip155:999999',
        } as PaymentsConfig,
        'eip155:999999',
        'unsupported'
      )
    ).toThrow('Please use a supported CAIP-2 identifier');
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
