import { describe, expect, it } from 'bun:test';
import { validatePaymentsConfig } from '../validation';
import type { PaymentsConfig } from '@lucid-agents/types/payments';

describe('validatePaymentsConfig', () => {
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

    expect(() => validatePaymentsConfig(config, config.network, 'echo')).toThrow(
      'Stripe destination mode currently supports only Base mainnet'
    );
  });
});
