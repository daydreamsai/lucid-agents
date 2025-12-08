import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

/**
 * Agent that demonstrates incoming payment policies (receivables).
 *
 * This agent uses incoming payment policies to control which payments it accepts
 * and how much it can receive. Policies are enforced when others try to pay this agent.
 *
 * Required environment variables (see env.example):
 *   - FACILITATOR_URL - x402 facilitator endpoint
 *   - PAYMENTS_RECEIVABLE_ADDRESS - This agent's payment address
 *   - NETWORK - Network identifier (e.g., base-sepolia)
 *
 * How to test:
 * 1. Copy env.example to .env and configure
 * 2. Start this agent: bun run packages/examples/src/payments/receivables-policies
 * 3. Call the entrypoints with payment to see policies in action
 *
 * Policy configuration demonstrates:
 * - Global incoming limits (max per payment, max total, time windows)
 * - Per-sender limits (different limits for different wallet addresses)
 * - Per-endpoint limits (different limits for different entrypoints)
 * - Sender allow/block lists (domain and wallet-based)
 *
 * What to expect:
 * - Payments from allowed senders within limits will succeed
 * - Payments from blocked senders will be rejected (403)
 * - Payments exceeding limits will be rejected (403)
 * - Domain-based checks happen before payment (payment not received)
 * - Wallet-based checks happen after payment (payment received but service denied)
 *
 * Run: bun run packages/examples/src/payments/receivables-policies
 */

const agent = await createAgent({
  name: 'receivables-policies-agent',
  version: '1.0.0',
  description: 'Agent demonstrating incoming payment policy enforcement',
})
  .use(http())
  .use(
    payments({
      config: {
        ...paymentsFromEnv(),
        policyGroups: [
          {
            name: 'Incoming Payment Controls',
            incomingLimits: {
              global: {
                maxPaymentUsd: 100.0,
                maxTotalUsd: 5000.0,
                windowMs: 86400000,
              },
              perSender: {
                '0x1234567890123456789012345678901234567890': {
                  maxTotalUsd: 1000.0,
                  windowMs: 86400000,
                },
              },
              perEndpoint: {
                '/entrypoints/premium/invoke': {
                  maxTotalUsd: 500.0,
                  windowMs: 86400000,
                },
              },
            },
            blockedSenders: [
              'https://untrusted.example.com',
              '0x9999999999999999999999999999999999999999',
            ],
            allowedSenders: [
              'https://trusted.example.com',
              '0x1234567890123456789012345678901234567890',
            ],
          },
        ],
      },
    })
  )
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

/**
 * Basic entrypoint with incoming payment policy enforcement.
 * Domain-based checks happen before payment, wallet-based checks after.
 */
addEntrypoint({
  key: 'basic',
  description: 'Basic service with incoming payment controls',
  input: z.object({ message: z.string() }),
  output: z.object({ result: z.string() }),
  price: '0.01',
  async handler({ input }) {
    return {
      output: { result: `Processed: ${input.message}` },
    };
  },
});

/**
 * Premium entrypoint with stricter per-endpoint limits.
 */
addEntrypoint({
  key: 'premium',
  description: 'Premium service with stricter incoming limits',
  input: z.object({ data: z.string() }),
  output: z.object({ result: z.string() }),
  price: '0.10',
  async handler({ input }) {
    return {
      output: { result: `Premium processing: ${input.data}` },
    };
  },
});

/**
 * Free entrypoint (no payment required).
 * Policies still apply if someone tries to pay.
 */
addEntrypoint({
  key: 'free',
  description: 'Free service (no payment required)',
  input: z.object({ query: z.string() }),
  output: z.object({ answer: z.string() }),
  async handler({ input }) {
    return {
      output: { answer: `Answer to "${input.query}": 42` },
    };
  },
});

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `Receivables policies agent ready at http://${server.hostname}:${server.port}/.well-known/agent.json`
);

if (agent.payments?.policyGroups) {
  console.log('\nIncoming payment policies configured:');
  agent.payments.policyGroups.forEach(group => {
    console.log(`  - ${group.name}`);
    if (group.incomingLimits?.global) {
      if (group.incomingLimits.global.maxPaymentUsd) {
        console.log(
          `    - Max per payment: $${group.incomingLimits.global.maxPaymentUsd}`
        );
      }
      if (group.incomingLimits.global.maxTotalUsd) {
        console.log(
          `    - Max total: $${group.incomingLimits.global.maxTotalUsd}`
        );
      }
      if (group.incomingLimits.global.windowMs) {
        const hours = group.incomingLimits.global.windowMs / (60 * 60 * 1000);
        console.log(`    - Window: ${hours} hours`);
      }
    }
    if (group.incomingLimits?.perSender) {
      const senderCount = Object.keys(group.incomingLimits.perSender).length;
      console.log(`    - Per-sender limits: ${senderCount} senders`);
    }
    if (group.incomingLimits?.perEndpoint) {
      const endpointCount = Object.keys(
        group.incomingLimits.perEndpoint
      ).length;
      console.log(`    - Per-endpoint limits: ${endpointCount} endpoints`);
    }
    if (group.blockedSenders) {
      console.log(
        `    - Blocked senders: ${group.blockedSenders.length} entries`
      );
    }
    if (group.allowedSenders) {
      console.log(
        `    - Allowed senders: ${group.allowedSenders.length} entries`
      );
    }
  });
} else {
  console.log('WARNING: No incoming payment policies configured');
}
