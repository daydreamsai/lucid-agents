import { analytics } from '@lucid-agents/analytics';
import { ap2 } from '@lucid-agents/ap2';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { identity } from '@lucid-agents/identity';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

export async function createSupplierReliabilityAgent() {
  let builder = createAgent({
    name: 'supplier-reliability-agent',
    version: '1.0.0',
    description: 'Provides a reliability score for a given supplier ID. Implements bounty issue #181.',
  })
    // HTTP transport — required for serving entrypoints
    .use(http())
    // Payments — required for the paid `score` entrypoint
    .use(payments({ config: paymentsFromEnv() }))
    // Analytics — useful for tracking revenue from the paid endpoint
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
