import {
  configureAgentKit,
  getAgentKitConfig,
  resetAgentKitConfigForTesting,
} from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { paymentsFromEnv } from '@lucid-agents/payments';
import { afterEach, describe, expect, it } from 'bun:test';

describe('AgentKit config management', () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  it('returns defaults when no overrides provided', () => {
    const config = getAgentKitConfig();
    // Security: Payments are NOT configured by default to prevent accidental misconfiguration
    expect(config.payments.facilitatorUrl).toBeUndefined();
    expect(config.payments.payTo).toBeUndefined();
    expect(config.wallet.walletApiUrl).toBeTruthy();
  });

  it('allows scoped config per app instance without global mutation', () => {
    const result1 = createAgentApp(
      { name: 'config-test-1', version: '0.0.0', description: 'Test agent' },
      {
        payments: {
          facilitatorUrl: 'https://facilitator.test' as any,
          payTo: '0x1230000000000000000000000000000000000000',
          network: 'base' as any,
          defaultPrice: '42',
        },
        config: {
          payments: {
            facilitatorUrl: 'https://facilitator.test' as any,
            payTo: '0x1230000000000000000000000000000000000000',
            network: 'base' as any,
            defaultPrice: '42',
          },
        },
      }
    );

    // App instance has the scoped config
    expect(result1.config.payments.facilitatorUrl).toBe(
      'https://facilitator.test'
    );
    expect(result1.config.payments.defaultPrice).toBe('42');

    // Global config is not affected (preventing leakage)
    const globalConfig = getAgentKitConfig();
    expect(globalConfig.payments.facilitatorUrl).not.toBe(
      'https://facilitator.test'
    );

    // Create a second agent with different config
    const result2 = createAgentApp(
      { name: 'config-test-2', version: '0.0.0', description: 'Test agent 2' },
      {
        payments: {
          facilitatorUrl: 'https://facilitator2.test' as any,
          payTo: '0x4560000000000000000000000000000000000000',
          network: 'optimism' as any,
          defaultPrice: '100',
        },
        config: {
          payments: {
            facilitatorUrl: 'https://facilitator2.test' as any,
            payTo: '0x4560000000000000000000000000000000000000',
            network: 'optimism' as any,
            defaultPrice: '100',
          },
        },
      }
    );

    // Each agent has its own config (no cross-contamination)
    expect(result1.config.payments.facilitatorUrl).toBe(
      'https://facilitator.test'
    );
    expect(result2.config.payments.facilitatorUrl).toBe(
      'https://facilitator2.test'
    );
    expect(result1.config.payments.payTo).toBe(
      '0x1230000000000000000000000000000000000000'
    );
    expect(result2.config.payments.payTo).toBe(
      '0x4560000000000000000000000000000000000000'
    );
  });

  it('supports explicit global configuration via configureAgentKit', () => {
    // Explicitly configure global state
    configureAgentKit({
      payments: {
        facilitatorUrl: 'https://facilitator.global' as any,
        payTo: '0x1230000000000000000000000000000000000000',
        network: 'base' as any,
        defaultPrice: '99',
      },
    });

    const config = getAgentKitConfig();
    expect(config.payments.facilitatorUrl).toBe('https://facilitator.global');
    const payments = paymentsFromEnv(config.payments);
    expect(payments.facilitatorUrl).toBe('https://facilitator.global');
    expect(payments.defaultPrice).toBe('99');
  });

  it('instance config overrides global config', () => {
    // Set global config
    configureAgentKit({
      wallet: { walletApiUrl: 'https://global.example' },
    });

    // Create app with instance-specific override
    const { config } = createAgentApp(
      {
        name: 'config-test-wallet',
        version: '0.0.0',
        description: 'Config test wallet agent',
      },
      {
        config: { wallet: { walletApiUrl: 'https://instance.example' } },
      }
    );

    // Instance config should override global
    expect(config.wallet.walletApiUrl).toBe('https://instance.example');

    // Global config unchanged
    const globalConfig = getAgentKitConfig();
    expect(globalConfig.wallet.walletApiUrl).toBe('https://global.example');
  });
});
