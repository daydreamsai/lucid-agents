import { a2a } from '@lucid-agents/a2a';
import { analytics } from '@lucid-agents/analytics';
import { ap2 } from '@lucid-agents/ap2';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { identity } from '@lucid-agents/identity';
import { custom, mpp } from '@lucid-agents/mpp';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { scheduler } from '@lucid-agents/scheduler';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

export type KitchenSinkProfile = 'free' | 'x402' | 'mpp';

export type CreateKitchenSinkAgentOptions = {
  profile?: KitchenSinkProfile;
  paymentsConfig?: PaymentsConfig;
};

/** Build the kitchen-sink runtime for a free or deterministic paid profile. */
export async function createKitchenSinkAgent(
  options: CreateKitchenSinkAgentOptions = {}
) {
  const configuredPayments = options.paymentsConfig ??
    paymentsFromEnv() ?? {
      payTo: '0x0000000000000000000000000000000000000001',
      network: 'eip155:84532' as const,
      facilitatorUrl: 'https://facilitator.example.com',
    };
  const paymentsConfig: PaymentsConfig =
    options.profile === 'x402'
      ? {
          ...configuredPayments,
          siwx: {
            enabled: true,
            storage: { type: 'in-memory' },
            verify: { skipSignatureVerification: true },
          },
        }
      : configuredPayments;
  const builder = createAgent({
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
    // 4. Payments — the free profile uses an in-memory demonstration tracker;
    //    x402 profiles can inject a deterministic facilitator.
    .use(payments({ config: paymentsConfig }))
    // 5. MPP — disabled in the free/x402 profiles and backed by a deterministic
    //    custom verifier in the MPP test profile.
    .use(
      mpp({
        config:
          options.profile === 'mpp'
            ? {
                methods: [custom.server('kitchen-sink-proof', {})],
                currency: 'usd',
                secretKey: 'kitchen-sink-mpp-secret',
                verifyCredential: async ({ credential }) =>
                  credential.payload.proof === 'kitchen-sink'
                    ? {
                        valid: true,
                        receipt: 'kitchen-sink-mpp-receipt',
                        payer: 'did:example:kitchen-sink-payer',
                        network: 'kitchen-sink:test',
                      }
                    : { valid: false },
              }
            : false,
      })
    )
    // 6. Scheduler — manages recurring A2A jobs; payments are optional
    .use(scheduler())
    // 7. AP2 (Agent-to-Person Protocol) — adds AP2 extension to the agent manifest;
    //    'merchant' is the valid role for an agent that accepts payments
    .use(ap2({ roles: ['merchant'] }));

  const walletsConfig = walletsFromEnv();
  if (walletsConfig) {
    // Wallets and identity are optional: only added when wallet env vars are present.
    // Identity depends on wallets to sign on-chain registration transactions.
    return builder
      .use(wallets({ config: walletsConfig }))
      .use(
        identity({
          config: {
            domain: process.env.AGENT_DOMAIN,
            autoRegister: process.env.AUTO_REGISTER === 'true',
          },
        })
      )
      .build();
  }

  return builder.build();
}
