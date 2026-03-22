import { analytics } from '@lucid-agents/analytics';
import { ap2 } from '@lucid-agents/ap2';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { identity } from '@lucid-agents/identity';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

export async function createIdentityReputationAgent() {
  let builder = createAgent({
    name: 'identity-reputation-agent',
    version: '1.0.0',
    description: 'Provides a reputation score for an ERC-8004 identity. Implements bounty #183.',
  })
    .use(http())
    .use(payments({ config: paymentsFromEnv() }))
    .use(analytics())
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
