/**
 * Geo Demand Pulse Index - Agent Definition
 */
import { a2a } from '@lucid-agents/a2a';
import { analytics } from '@lucid-agents/analytics';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { identity } from '@lucid-agents/identity';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

export async function createGeoDemandAgent() {
  let builder = createAgent({
    name: 'geo-demand-pulse',
    version: '1.0.0',
    description: 'Geo Demand Pulse Index API - ZIP/city-level demand indices, trend velocity, and anomaly flags for agent buyers',
  })
    .use(http())
    .use(a2a())
    .use(analytics())
    .use(payments({ config: paymentsFromEnv() }));

  const walletsConfig = walletsFromEnv();
  if (walletsConfig) {
    builder = builder.use(wallets({ config: walletsConfig }));
    builder = builder.use(identity({ config: { domain: process.env.AGENT_DOMAIN, autoRegister: process.env.AUTO_REGISTER === 'true' } }));
  }

  return builder.build();
}
