/*
 * Scheduler Example - Hiring an Agent on a Schedule
 *
 * This example demonstrates the scheduler's simplified API:
 *
 * ARCHITECTURE:
 * - AGENT: Provides a paid service (the "hello" entrypoint)
 *   - Has its own wallet to RECEIVE payments (configured via payments extension)
 *   - Exposes entrypoints with prices in the agent card
 *
 * - SCHEDULER: Hires the agent to run on a schedule
 *   - Has a PAYER wallet to PAY for each invocation (configured via wallets extension)
 *   - Uses a2aClient + paymentContext for automatic x402 payments
 *
 * PAYMENT FLOW (handled automatically by scheduler):
 *   1. Scheduler checks if job is due
 *   2. Scheduler invokes via a2aClient with x402-enabled fetch
 *   3. Payment is signed and sent automatically
 *   4. Agent receives payment and executes entrypoint
 *
 * Run with: bun run src/scheduler/hello-interval.ts
 *
 * Environment variables:
 *   AGENT_WALLET_PRIVATE_KEY     - Private key for the payer's wallet (pays for agent calls)
 *   PAYMENTS_RECEIVABLE_ADDRESS  - Agent's address to receive payments
 *   FACILITATOR_URL              - x402 facilitator endpoint
 *   NETWORK                      - Network (e.g., base-sepolia)
 */

import { a2a } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { createSchedulerWorker, scheduler } from '@lucid-agents/scheduler';
import type { AgentCardWithEntrypoints } from '@lucid-agents/types';
import { wallets } from '@lucid-agents/wallet';
import { z } from 'zod';

async function main() {
  // ============================================================================
  // STEP 1: Create the AGENT (service provider that receives payments)
  // ============================================================================
  console.log('[example] Creating agent (service provider)...');

  const serviceAgent = await createAgent({
    name: 'hello-agent',
    version: '1.0.0',
    description: 'A simple agent that says hello (paid service)',
  })
    .use(http())
    .use(payments({ config: paymentsFromEnv() }))
    .use(a2a())
    .build();

  const { app, addEntrypoint } = await createAgentApp(serviceAgent);

  addEntrypoint({
    key: 'hello',
    description: 'Says hello with a timestamp',
    price: '0.01',
    input: z.object({ name: z.string().optional() }),
    output: z.object({ message: z.string(), timestamp: z.string() }),
    handler: async ctx => {
      const input = ctx.input as { name?: string };
      const name = input.name ?? 'World';
      const timestamp = new Date().toISOString();
      console.log(`[agent] Hello, ${name}! at ${timestamp}`);
      return {
        output: {
          message: `Hello, ${name}!`,
          timestamp,
        },
      };
    },
  });

  const port = Number(process.env.PORT ?? 8787);
  const agentOrigin = `http://localhost:${port}`;

  Bun.serve({
    port,
    fetch: app.fetch,
  });
  console.log(`[example] Agent running at ${agentOrigin}`);

  await new Promise(resolve => setTimeout(resolve, 100));

  const cardResp = await fetch(`${agentOrigin}/.well-known/agent-card.json`);
  const agentCard = (await cardResp.json()) as AgentCardWithEntrypoints;
  console.log('[example] Agent card fetched');
  console.log(
    `[example] Agent accepts payments via: ${agentCard.payments?.[0]?.method}`
  );
  console.log(
    `[example] Agent payee address: ${agentCard.payments?.[0]?.payee}`
  );

  // ============================================================================
  // STEP 2: Create the SCHEDULER AGENT (agent that schedules calls to other agents)
  // ============================================================================
  console.log('\n[example] Creating scheduler agent...');

  const schedulerWalletPrivateKey = process.env.AGENT_WALLET_PRIVATE_KEY;
  if (!schedulerWalletPrivateKey) {
    throw new Error(
      'AGENT_WALLET_PRIVATE_KEY environment variable is required for the scheduler client wallet'
    );
  }

  const schedulerAgent = await createAgent({
    name: 'scheduler-agent',
    version: '1.0.0',
    description: 'Agent that schedules calls to other agents',
  })
    .use(
      wallets({
        config: {
          agent: { type: 'local', privateKey: schedulerWalletPrivateKey },
        },
      })
    )
    .use(a2a())
    .use(payments({ config: paymentsFromEnv() }))
    .use(scheduler())
    .build();

  if (!schedulerAgent.scheduler) {
    throw new Error('Scheduler extension not initialized');
  }

  const walletAddress = schedulerAgent.wallets?.agent?.connector
    ? await schedulerAgent.wallets.agent.connector.getAddress()
    : null;
  console.log(
    `[example] Scheduler agent wallet address: ${walletAddress || 'N/A'}`
  );

  // ============================================================================
  // STEP 4: Create a HIRE (schedule agent calls)
  // ============================================================================
  console.log('\n[example] Creating hire (scheduling agent calls)...');

  const { hire, job } = await schedulerAgent.scheduler.createHire({
    agentCardUrl: agentOrigin,
    entrypointKey: 'hello',
    schedule: { kind: 'interval', everyMs: 10_000 },
    jobInput: { name: 'Scheduler' },
  });

  console.log(`[example] Created hire: ${hire.id}`);
  console.log(`[example] Created job: ${job.id}`);
  console.log('[example] Job will run every 10 seconds');

  // ============================================================================
  // STEP 5: Start the scheduler worker
  // ============================================================================
  console.log('\n[example] Starting scheduler worker...');

  const worker = createSchedulerWorker(schedulerAgent.scheduler, 1_000);
  worker.start();
  console.log('[example] Scheduler worker started');
  console.log('[example] Press Ctrl+C to stop\n');

  process.on('SIGINT', () => {
    console.log('\n[example] Shutting down...');
    worker.stop();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('[example] Fatal error:', error);
  process.exit(1);
});
