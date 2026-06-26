import { analytics } from '@lucid-agents/analytics';
import { ap2 } from '@lucid-agents/ap2';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { identity } from '@lucid-agents/identity';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

export async function createGeoDemandAgent() {
  let builder = createAgent({
    name: 'geo-demand-pulse-agent',
    version: '1.0.0',
    description: 'Provides a Geo Demand Pulse Index for agent buyers. Implements bounty issue #182.',
  })
    // HTTP transport — required for serving entrypoints
    .use(http())
    // Payments — required for the paid `pulse` entrypoint
    .use(payments({ config: paymentsFromEnv() }))
    // Analytics — useful for tracking revenue
    .use(analytics())
    // AP2 — advertises this agent as a merchant
    .use(ap2({ roles: ['merchant'] }));

  const walletsConfig = walletsFromEnv();
  if (walletsConfig) {
    // Wallets and identity are optional but good practice for a paid agent
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
