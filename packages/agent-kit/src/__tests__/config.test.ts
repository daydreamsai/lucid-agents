import { afterEach, describe, expect, it } from 'bun:test';

import { createAgentApp } from '../app';
import { getAgentKitConfig, resetAgentKitConfigForTesting } from '../config';
import { paymentsFromEnv } from '../utils';

describe('AgentKit config management', () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  it('returns defaults when no overrides provided', () => {
    const config = getAgentKitConfig();
    expect(config.payments.facilitatorUrl).toBeTruthy();
    expect(config.wallet.walletApiUrl).toBeTruthy();
  });

  it('allows overriding payment defaults', () => {
    createAgentApp(
      {
        name: 'config-test',
        version: '0.0.0',
        description: 'Config test agent',
      },
      {
        config: {
          payments: {
            facilitatorUrl: 'https://facilitator.test' as any,
            payTo: '0x1230000000000000000000000000000000000000',
            network: 'base' as any,
            defaultPrice: '42',
          },
        },
        useConfigPayments: true,
      }
    );
    const config = getAgentKitConfig();
    expect(config.payments.facilitatorUrl).toBe('https://facilitator.test');
    const payments = paymentsFromEnv();
    expect(payments.facilitatorUrl).toBe('https://facilitator.test');
    expect(payments.defaultPrice).toBe('42');
  });

  it('exposes payments helpers via config utils', () => {
    createAgentApp(
      {
        name: 'config-test-wallet',
        version: '0.0.0',
        description: 'Config test wallet agent',
      },
      {
        config: { wallet: { walletApiUrl: 'https://api.example' } },
      }
    );
    const config = getAgentKitConfig();
    expect(config.wallet.walletApiUrl).toBe('https://api.example');
  });
});
