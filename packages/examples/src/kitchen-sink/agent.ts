import { a2a } from '@lucid-agents/a2a';
import { analytics } from '@lucid-agents/analytics';
import { ap2 } from '@lucid-agents/ap2';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { identity } from '@lucid-agents/identity';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { scheduler } from '@lucid-agents/scheduler';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

export async function createKitchenSinkAgent() {
  let builder = createAgent({
    name: 'kitchen-sink-agent',
    version: '1.0.0',
    description: 'Demonstrates all major Lucid Agents SDK capabilities',
  })
    .use(http())
    .use(a2a())
    .use(analytics())
    .use(payments({ config: paymentsFromEnv() }))
    .use(scheduler())
    .use(ap2({ roles: ['merchant'] }));

  const walletsConfig = walletsFromEnv();
  if (walletsConfig) {
    builder = builder.use(wallets({ config: walletsConfig }));
    builder = builder.use(
      identity({
        config: {
          domain: process.env.AGENT_DOMAIN,
          autoRegister: process.env.AUTO_REGISTER === 'true',
        },
      })
    );
  }

  return builder.build();
}
