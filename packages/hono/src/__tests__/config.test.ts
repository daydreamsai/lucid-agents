import {
  configureAgentKit,
  getAgentKitConfig,
  resetAgentKitConfigForTesting,
  createAgent,
} from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { wallets } from '@lucid-agents/wallet';
import { createAgentApp } from '@lucid-agents/hono';
import { paymentsFromEnv } from '@lucid-agents/payments';
import { afterEach, describe, expect, it } from 'bun:test';

describe('AgentKit config management', () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  it('returns defaults when no overrides provided', () => {
    const config = getAgentKitConfig();
    expect(config.payments).toBeUndefined();
    expect(config.wallets).toBeUndefined();
  });

  it('allows scoped config per app instance without global mutation', async () => {
    const paymentsConfig1 = {
      facilitatorUrl: 'https://facilitator.test' as any,
      payTo: '0x1230000000000000000000000000000000000000',
      network: 'base' as any,
    };
    const agent1 = await createAgent({
      name: 'config-test-1',
      version: '0.0.0',
      description: 'Test agent',
    })
      .use(http())
      .use(payments({ config: paymentsConfig1 }))
      .build({
        payments: paymentsConfig1,
      });
    const result1 = await createAgentApp(agent1);

    // App instance has the scoped config
    expect(result1.config.payments?.facilitatorUrl).toBe(
      'https://facilitator.test'
    );

    // Global config is not affected (preventing leakage)
    const globalConfig = getAgentKitConfig();
    expect(globalConfig.payments?.facilitatorUrl).not.toBe(
      'https://facilitator.test'
    );

    // Create a second agent with different config
    const paymentsConfig2 = {
      facilitatorUrl: 'https://facilitator2.test' as any,
      payTo: '0x4560000000000000000000000000000000000000',
      network: 'optimism' as any,
    };
    const agent2 = await createAgent({
      name: 'config-test-2',
      version: '0.0.0',
      description: 'Test agent 2',
    })
      .use(http())
      .use(payments({ config: paymentsConfig2 }))
      .build({
        payments: paymentsConfig2,
      });
    const result2 = await createAgentApp(agent2);

    // Each agent has its own config (no cross-contamination)
    expect(result1.config.payments?.facilitatorUrl).toBe(
      'https://facilitator.test'
    );
    expect(result2.config.payments?.facilitatorUrl).toBe(
      'https://facilitator2.test'
    );
    expect(result1.config.payments?.payTo).toBe(
      '0x1230000000000000000000000000000000000000'
    );
    expect(result2.config.payments?.payTo).toBe(
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
      },
    });

    const config = getAgentKitConfig();
    expect(config.payments.facilitatorUrl).toBe('https://facilitator.global');
    const payments = paymentsFromEnv(config.payments);
    expect(payments.facilitatorUrl).toBe('https://facilitator.global');
    expect(payments.network).toBe('base');
  });

  it('supports wallet overrides at global and instance scope', async () => {
    // Use valid 64-character hex private keys
    const globalPrivateKey =
      '0x1234567890123456789012345678901234567890123456789012345678901234';
    const instancePrivateKey =
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';

    configureAgentKit({
      wallets: {
        agent: { type: 'local', privateKey: globalPrivateKey },
      },
    });

    const globalConfig = getAgentKitConfig();
    expect(globalConfig.wallets?.agent?.privateKey).toBe(globalPrivateKey);

    const agent = await createAgent({
      name: 'config-test-wallet',
      version: '0.0.0',
      description: 'Config test wallet agent',
    })
      .use(http())
      .use(
        wallets({
          config: {
            agent: { type: 'local', privateKey: instancePrivateKey },
          },
        })
      )
      .build({
        wallets: {
          agent: { type: 'local', privateKey: instancePrivateKey },
        },
      });
    const { config } = await createAgentApp(agent);

    // The config should have the wallet configuration
    expect(config.wallets?.agent?.privateKey).toBe(instancePrivateKey);

    const globalAfter = getAgentKitConfig();
    expect(globalAfter.wallets?.agent?.privateKey).toBe(globalPrivateKey);
  });
});
