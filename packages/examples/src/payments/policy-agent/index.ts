import { join } from 'node:path';

import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import {
  createRuntimePaymentContext,
  payments,
  paymentsFromEnv,
} from '@lucid-agents/payments';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';
import { z } from 'zod';

/**
 * Agent that demonstrates payment policy enforcement when calling other agents.
 *
 * This agent uses payment policies to control its spending when making payments
 * to other agents. Policies are enforced BEFORE any payment is made.
 *
 * Required environment variables (see env.example):
 *   - FACILITATOR_URL - x402 facilitator endpoint
 *   - PAYMENTS_RECEIVABLE_ADDRESS - This agent's payment address (not used for making payments)
 *   - NETWORK - Network identifier (e.g., base-sepolia)
 *   - WALLET_PRIVATE_KEY - Private key for making payments to other agents
 *
 * How to test:
 * 1. Copy env.example to .env in both directories and configure
 * 2. Start the paid service: bun run packages/examples/src/payments/paid-service
 * 3. Start this agent: bun run packages/examples/src/payments/policy-agent
 * 4. Call the test-policies entrypoint to see policies in action
 *
 * Policy configuration (from payment-policies.json):
 * - Daily Spending Limit: Max $0.10 per payment, $1.00 total per day
 * - API Usage Policy: Max $0.05 per payment, allowed recipients only
 * - Blocked Services: Certain recipients are blocked
 *
 * What to expect:
 * - Calls to echo ($0.01) and process ($0.05) should succeed
 * - Calls to expensive ($0.15) should be BLOCKED (exceeds $0.10 limit)
 * - After many calls, total spending limit will block requests
 *
 * Run: bun run packages/examples/src/payments/policy-agent
 */

const agent = await createAgent({
  name: 'policy-agent',
  version: '1.0.0',
  description: 'Agent demonstrating payment policy enforcement',
})
  .use(http())
  .use(
    payments({
      config: paymentsFromEnv(),
      policies: join(import.meta.dir, '..', 'payment-policies.json'),
    })
  )
  .use(
    wallets({
      config: walletsFromEnv(),
    })
  )
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

/**
 * Test entrypoint that demonstrates policies in action.
 * Calls the paid-service agent with different entrypoints to show:
 * 1. Successful payments (within policy limits)
 * 2. Blocked payments (violating policy limits)
 * 3. Policy enforcement logging
 */
addEntrypoint({
  key: 'test-policies',
  description: 'Test payment policies by calling paid-service agent',
  input: z.object({
    serviceUrl: z.string().url().default('http://localhost:3001').optional(),
  }),
  output: z.object({
    tests: z.array(
      z.object({
        test: z.string(),
        success: z.boolean(),
        result: z.string(),
        cost: z.string().optional(),
      })
    ),
    summary: z.string(),
  }),
  handler: async ctx => {
    const runtime = ctx.runtime;
    if (!runtime?.payments) {
      throw new Error('Payments not configured');
    }

    const serviceUrl = ctx.input?.serviceUrl || 'http://localhost:3001';
    const paymentContext = await createRuntimePaymentContext({
      runtime,
      network: runtime.payments.config.network,
    });

    if (!paymentContext.fetchWithPayment) {
      throw new Error('Payment context not available');
    }

    const tests = [];

    // Test 1: Call echo ($0.01) - should succeed
    console.log('\n[Test 1] Calling echo ($0.01) - should succeed');
    try {
      const response = await paymentContext.fetchWithPayment(
        `${serviceUrl}/entrypoints/echo/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: { message: 'Hello!' } }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log('[PASS] Success:', result);
        tests.push({
          test: 'echo ($0.01)',
          success: true,
          result: 'Payment succeeded - within policy limits',
          cost: '$0.01',
        });
      } else {
        const error = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        console.log('[FAIL] Failed:', response.status, error);
        tests.push({
          test: 'echo ($0.01)',
          success: false,
          result: error.error?.message || `HTTP ${response.status}`,
        });
      }
    } catch (error) {
      console.log('[FAIL] Error:', error);
      tests.push({
        test: 'echo ($0.01)',
        success: false,
        result: error instanceof Error ? error.message : String(error),
      });
    }

    // Test 2: Call process ($0.05) - should succeed
    console.log('\n[Test 2] Calling process ($0.05) - should succeed');
    try {
      const response = await paymentContext.fetchWithPayment(
        `${serviceUrl}/entrypoints/process/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: { item: 'test-item' } }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log('[PASS] Success:', result);
        tests.push({
          test: 'process ($0.05)',
          success: true,
          result: 'Payment succeeded - within policy limits',
          cost: '$0.05',
        });
      } else {
        const error = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        console.log('[FAIL] Failed:', response.status, error);
        tests.push({
          test: 'process ($0.05)',
          success: false,
          result: error.error?.message || `HTTP ${response.status}`,
        });
      }
    } catch (error) {
      console.log('[FAIL] Error:', error);
      tests.push({
        test: 'process ($0.05)',
        success: false,
        result: error instanceof Error ? error.message : String(error),
      });
    }

    // Test 3: Call expensive ($0.15) - should be BLOCKED by policy
    console.log(
      '\n[Test 3] Calling expensive ($0.15) - should be BLOCKED (exceeds $0.10 limit)'
    );
    try {
      const response = await paymentContext.fetchWithPayment(
        `${serviceUrl}/entrypoints/expensive/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: { data: 'test' } }),
        }
      );

      if (response.status === 403) {
        const error = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
          reason?: string;
        };
        console.log(
          '[PASS] Correctly blocked by policy:',
          error.error?.message
        );
        tests.push({
          test: 'expensive ($0.15)',
          success: true,
          result: `Correctly blocked: ${error.error?.message || 'Policy violation'}`,
          cost: '$0 (blocked)',
        });
      } else if (response.ok) {
        console.log('[FAIL] Should have been blocked but succeeded!');
        tests.push({
          test: 'expensive ($0.15)',
          success: false,
          result: 'ERROR: Should have been blocked but payment went through',
          cost: '$0.15',
        });
      } else {
        console.log('[FAIL] Unexpected response:', response.status);
        tests.push({
          test: 'expensive ($0.15)',
          success: false,
          result: `Unexpected HTTP ${response.status}`,
        });
      }
    } catch (error) {
      console.log('[FAIL] Error:', error);
      tests.push({
        test: 'expensive ($0.15)',
        success: false,
        result: error instanceof Error ? error.message : String(error),
      });
    }

    const successCount = tests.filter(t => t.success).length;
    const summary = `${successCount}/${tests.length} tests passed. Policies are ${successCount === tests.length ? 'working correctly' : 'NOT working as expected'}!`;

    console.log(`\n[SUMMARY] ${summary}\n`);

    return {
      output: {
        tests,
        summary,
      },
    };
  },
});

/**
 * Test entrypoint for blocked domain scenario.
 * Demonstrates domain-based blocking (not in allowedRecipients).
 */
addEntrypoint({
  key: 'test-blocked-domain',
  description:
    'Test calling blocked-domain service (domain not in allowedRecipients)',
  input: z.object({
    blockedDomainUrl: z
      .string()
      .url()
      .default('http://localhost:3002')
      .optional(),
  }),
  output: z.object({
    test: z.object({
      blocked: z.boolean(),
      reason: z.string(),
      blockType: z.string(),
    }),
    summary: z.string(),
  }),
  handler: async ctx => {
    const runtime = ctx.runtime;
    if (!runtime?.payments) {
      throw new Error('Payments not configured');
    }

    const blockedDomainUrl =
      ctx.input?.blockedDomainUrl || 'http://localhost:3002';
    const paymentContext = await createRuntimePaymentContext({
      runtime,
      network: runtime.payments.config.network,
    });

    if (!paymentContext.fetchWithPayment) {
      throw new Error('Payment context not available');
    }

    console.log('\n[TEST] Attempting to call blocked domain service...');
    console.log(`URL: ${blockedDomainUrl}`);
    console.log(`Expected: BLOCKED (domain not in allowedRecipients)`);

    try {
      const response = await paymentContext.fetchWithPayment(
        `${blockedDomainUrl}/entrypoints/test-endpoint/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: { message: 'test' } }),
        }
      );

      if (response.status === 403) {
        const error = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
          reason?: string;
        };
        const reason =
          error.error?.message || error.reason || 'Policy violation';
        console.log('[PASS] Correctly blocked by domain policy:', reason);

        return {
          output: {
            test: {
              blocked: true,
              reason,
              blockType: 'domain_not_in_whitelist',
            },
            summary:
              'Domain policy correctly blocked the service (not in allowedRecipients)',
          },
        };
      } else if (response.ok) {
        console.log('[FAIL] Should have been blocked but succeeded!');
        return {
          output: {
            test: {
              blocked: false,
              reason: 'Payment went through when it should have been blocked',
              blockType: 'none',
            },
            summary: 'ERROR: Domain blocking policy did not work!',
          },
        };
      } else {
        console.log('[FAIL] Unexpected response:', response.status);
        return {
          output: {
            test: {
              blocked: false,
              reason: `Unexpected HTTP ${response.status}`,
              blockType: 'unknown',
            },
            summary: `Unexpected response: ${response.status}`,
          },
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('[FAIL] Error:', message);
      throw error;
    }
  },
});

/**
 * Test entrypoint for blocked wallet address scenario.
 * Demonstrates wallet address blocking (in blockedRecipients).
 */
addEntrypoint({
  key: 'test-blocked-wallet',
  description:
    'Test calling blocked-wallet service (address in blockedRecipients)',
  input: z.object({
    blockedWalletUrl: z
      .string()
      .url()
      .default('http://localhost:3003')
      .optional(),
  }),
  output: z.object({
    test: z.object({
      blocked: z.boolean(),
      reason: z.string(),
      blockType: z.string(),
      blockedAddress: z.string().optional(),
    }),
    summary: z.string(),
  }),
  handler: async ctx => {
    const runtime = ctx.runtime;
    if (!runtime?.payments) {
      throw new Error('Payments not configured');
    }

    const blockedWalletUrl =
      ctx.input?.blockedWalletUrl || 'http://localhost:3003';
    const paymentContext = await createRuntimePaymentContext({
      runtime,
      network: runtime.payments.config.network,
    });

    if (!paymentContext.fetchWithPayment) {
      throw new Error('Payment context not available');
    }

    console.log('\n[TEST] Attempting to call blocked wallet service...');
    console.log(`URL: ${blockedWalletUrl}`);
    console.log(`Expected: BLOCKED (wallet address in blockedRecipients)`);

    try {
      const response = await paymentContext.fetchWithPayment(
        `${blockedWalletUrl}/entrypoints/test-endpoint/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: { message: 'test' } }),
        }
      );

      if (response.status === 403) {
        const error = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
          reason?: string;
        };
        const reason =
          error.error?.message || error.reason || 'Policy violation';
        console.log('[PASS] Correctly blocked by wallet policy:', reason);

        return {
          output: {
            test: {
              blocked: true,
              reason,
              blockType: 'wallet_address_in_blacklist',
              blockedAddress: '0x1234567890123456789012345678901234567890',
            },
            summary:
              'Wallet policy correctly blocked the service (address in blockedRecipients)',
          },
        };
      } else if (response.ok) {
        console.log('[FAIL] Should have been blocked but succeeded!');
        return {
          output: {
            test: {
              blocked: false,
              reason: 'Payment went through when it should have been blocked',
              blockType: 'none',
            },
            summary: 'ERROR: Wallet blocking policy did not work!',
          },
        };
      } else {
        console.log('[FAIL] Unexpected response:', response.status);
        return {
          output: {
            test: {
              blocked: false,
              reason: `Unexpected HTTP ${response.status}`,
              blockType: 'unknown',
            },
            summary: `Unexpected response: ${response.status}`,
          },
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('[FAIL] Error:', message);
      throw error;
    }
  },
});

/**
 * Example entrypoint that calls another agent with payment policy enforcement.
 *
 * How to use this:
 * 1. Start another agent that accepts payments (e.g., from the cli templates)
 * 2. Call this entrypoint with:
 *    {
 *      "targetUrl": "http://localhost:3001",
 *      "endpoint": "echo",  // or whatever entrypoint the target has
 *      "data": { "input": "for the target agent" }
 *    }
 * 3. This agent will try to pay the target agent
 * 4. Policies will check if the payment is allowed:
 *    - Is spending under the limit?
 *    - Is the recipient allowed?
 *    - Are we under the rate limit?
 * 5. If policies pass, payment is made and call succeeds
 * 6. If policies fail, you get a 403 error with the policy violation reason
 */
addEntrypoint({
  key: 'delegate-with-policy',
  description: 'Calls another agent with payment policy enforcement',
  input: z.object({
    targetUrl: z.string().url(),
    endpoint: z.string(),
    data: z.unknown(),
  }),
  output: z.object({
    result: z.unknown(),
    paymentPolicy: z.string(),
  }),
  handler: async ctx => {
    const runtime = ctx.runtime;
    if (!runtime) {
      throw new Error('Runtime not available');
    }

    // Create payment-enabled fetch (policies are automatically enforced)
    const paymentContext = await createRuntimePaymentContext({
      runtime,
      network: runtime.payments?.config.network || 'base-sepolia',
    });

    if (!paymentContext.fetchWithPayment) {
      throw new Error('Payment context not available');
    }

    // Use payment-enabled fetch - policies will check before allowing payment
    // If policy violation, returns 403 response
    try {
      const response = await paymentContext.fetchWithPayment(
        `${ctx.input.targetUrl}/entrypoints/${ctx.input.endpoint}/invoke`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(ctx.input.data),
        }
      );

      if (!response.ok) {
        // Check if it's a policy violation
        if (response.status === 403) {
          const error = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
            reason?: string;
          };
          throw new Error(
            error.error?.message || error.reason || 'Payment blocked by policy'
          );
        }
        throw new Error(`Request failed: ${response.status}`);
      }

      const result = (await response.json()) as {
        output?: unknown;
      };

      return {
        output: {
          result: result.output || result,
          paymentPolicy: 'Payment successful - policies passed',
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('policy')) {
        throw error;
      }
      throw new Error(
        `Failed to call agent: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});

/**
 * Example entrypoint that demonstrates how policies work with multiple calls.
 *
 * This shows what happens when you make many payments in sequence:
 * - The first few payments might succeed
 * - As you hit spending or rate limits, later payments get blocked
 * - Each blocked payment returns a policy violation without spending money
 *
 * Try calling with:
 * {
 *   "items": ["item1", "item2", "item3", "item4", "item5"],
 *   "targetUrl": "http://localhost:3001"
 * }
 *
 * Watch the console to see which items succeed and which hit policy limits.
 */
addEntrypoint({
  key: 'batch-process',
  description: 'Processes multiple items with policy enforcement',
  input: z.object({
    items: z.array(z.string()),
    targetUrl: z.string().url(),
  }),
  output: z.object({
    processed: z.number(),
    blocked: z.number(),
    results: z.array(z.unknown()),
  }),
  handler: async ctx => {
    const runtime = ctx.runtime;
    if (!runtime?.payments) {
      throw new Error('Payments not configured');
    }

    const paymentContext = await createRuntimePaymentContext({
      runtime,
      network: runtime.payments.config.network,
    });

    if (!paymentContext.fetchWithPayment) {
      throw new Error('Payment context not available');
    }

    let processed = 0;
    let blocked = 0;
    const results: unknown[] = [];

    // Process items one by one - policies will enforce limits
    for (const item of ctx.input.items) {
      try {
        const response = await paymentContext.fetchWithPayment(
          `${ctx.input.targetUrl}/entrypoints/process/invoke`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ input: { item } }),
          }
        );

        if (response.status === 403) {
          // Policy violation
          const error = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
            reason?: string;
          };
          console.warn(
            `Policy violation for item ${item}:`,
            error.reason || error.error?.message
          );
          blocked++;
          continue;
        }

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        const result = await response.json();
        results.push(result);
        processed++;
      } catch (error) {
        if (error instanceof Error && error.message.includes('policy')) {
          blocked++;
        } else {
          throw error;
        }
      }
    }

    return {
      output: {
        processed,
        blocked,
        results,
      },
    };
  },
});

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `Policy agent ready at http://${server.hostname}:${server.port}/.well-known/agent.json`
);

// Display policy information if available
if (agent.payments?.policyGroups) {
  console.log('Payment policies configured:');
  agent.payments.policyGroups.forEach(group => {
    console.log(`  - ${group.name}`);
    if (group.outgoingLimits?.global) {
      if (group.outgoingLimits.global.maxPaymentUsd) {
        console.log(
          `    - Max payment: $${group.outgoingLimits.global.maxPaymentUsd}`
        );
      }
      if (group.outgoingLimits.global.maxTotalUsd) {
        console.log(
          `    - Max total: $${group.outgoingLimits.global.maxTotalUsd}`
        );
      }
      if (group.outgoingLimits.global.windowMs) {
        const hours = group.outgoingLimits.global.windowMs / (60 * 60 * 1000);
        console.log(`    - Window: ${hours} hours`);
      }
    }
    if (group.outgoingLimits?.perTarget) {
      const targetCount = Object.keys(group.outgoingLimits.perTarget).length;
      console.log(`    - Per-target limits: ${targetCount} targets`);
    }
    if (group.allowedRecipients) {
      console.log(
        `    - Allowed recipients: ${group.allowedRecipients.length}`
      );
    }
    if (group.blockedRecipients) {
      console.log(
        `    - Blocked recipients: ${group.blockedRecipients.length}`
      );
    }
    if (group.rateLimits) {
      const hours = group.rateLimits.windowMs / (60 * 60 * 1000);
      console.log(
        `    - Rate limit: ${group.rateLimits.maxPayments} per ${hours} hour(s)`
      );
    }
  });
} else {
  console.log('WARNING: No payment policies configured');
  console.log('   Create payment-policies.json to enable policy enforcement');
}
