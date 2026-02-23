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
    // 1. HTTP transport — required for serving entrypoints via Hono
    .use(http())
    // 2. Agent-to-Agent (A2A) — enables task-based agent card and inter-agent calls
    .use(a2a())
    // 3. Analytics — tracks payment transactions; query from entrypoints via runtime.analytics
    .use(analytics())
    // 4. Payments — paymentsFromEnv() always returns a config (never undefined), so this
    //    is unconditional. The extension is passive until an entrypoint declares a price.
    .use(payments({ config: paymentsFromEnv() }))
    // 5. Scheduler — manages recurring jobs; requires payments to be registered first
    .use(scheduler())
    // 6. AP2 (Agent-to-Person Protocol) — adds AP2 extension to the agent manifest;
    //    'merchant' is the valid role for an agent that accepts payments
    .use(ap2({ roles: ['merchant'] }));

  const walletsConfig = walletsFromEnv();
  if (walletsConfig) {
    // Wallets and identity are optional: only added when wallet env vars are present.
    // Identity depends on wallets to sign on-chain registration transactions.
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
