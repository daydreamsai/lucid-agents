/*
 * Scheduler Example - Hiring Two Agents on Schedules
 *
 * Same setup as hello-interval, but we spin up two agents and create two hires.
 *
 * Run with: bun run src/scheduler/double-hire.ts
 *
 * Environment variables (same as hello-interval):
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

async function startAgent(name: string, port: number) {
  const agentRuntime = await createAgent({
    name,
    version: '1.0.0',
    description: `${name} that says hello (paid service)`,
  })
    .use(http())
    .use(payments({ config: paymentsFromEnv() }))
    .use(a2a())
    .build();

  const { app, addEntrypoint } = await createAgentApp(agentRuntime);

  addEntrypoint({
    key: 'hello',
    description: 'Says hello with a timestamp',
    price: '0.01',
    input: z.object({ name: z.string().optional() }),
    output: z.object({ message: z.string(), timestamp: z.string() }),
    handler: async ctx => {
      const input = ctx.input as { name?: string };
      const caller = input.name ?? 'World';
      const timestamp = new Date().toISOString();
      console.log(`[${name}] Hello, ${caller}! at ${timestamp}`);
      return {
        output: {
          message: `Hello, ${caller}!`,
          timestamp,
        },
      };
    },
  });

  const agentOrigin = `http://localhost:${port}`;
  Bun.serve({ port, fetch: app.fetch });
  console.log(`[example] ${name} running at ${agentOrigin}`);

  await new Promise(resolve => setTimeout(resolve, 100));

  const cardResp = await fetch(`${agentOrigin}/.well-known/agent-card.json`);
  const agentCard = (await cardResp.json()) as AgentCardWithEntrypoints;
  console.log(
    `[example] ${name} accepts payments via: ${agentCard.payments?.[0]?.method}`
  );
  console.log(
    `[example] ${name} payee address: ${agentCard.payments?.[0]?.payee}`
  );

  return { agentOrigin, agentCard };
}

async function main() {
  console.log('[example] Creating agents (service providers)...');
  const agentA = await startAgent('hello-agent-A', 8787);
  const agentB = await startAgent('hello-agent-B', 8788);

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

  console.log('\n[example] Creating hires (scheduling agent calls)...');
  const hireA = await schedulerAgent.scheduler.createHire({
    agentCardUrl: agentA.agentOrigin,
    entrypointKey: 'hello',
    schedule: { kind: 'interval', everyMs: 10_000 },
    jobInput: { name: 'Scheduler -> Agent A' },
  });

  const hireB = await schedulerAgent.scheduler.createHire({
    agentCardUrl: agentB.agentOrigin,
    entrypointKey: 'hello',
    schedule: { kind: 'interval', everyMs: 15_000 },
    jobInput: { name: 'Scheduler -> Agent B' },
  });

  console.log(`[example] Created hire A: ${hireA.hire.id}`);
  console.log(`[example] Created hire B: ${hireB.hire.id}`);
  console.log('[example] Jobs will run every 10s and 15s respectively');

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
