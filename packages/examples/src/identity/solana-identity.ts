/**
 * Solana Identity Example
 *
 * Demonstrates how to use @lucid-agents/identity-solana to:
 * 1. Register an agent on the Solana identity registry (8004-solana devnet)
 * 2. Attach Solana identity to the Lucid SDK manifest
 * 3. Serve a paid entrypoint with x402 payment support
 *
 * Environment variables required:
 *   AGENT_DOMAIN=my-agent.example.com
 *   SOLANA_PRIVATE_KEY=[1,2,...,64]  # JSON array from `solana-keygen`
 *   SOLANA_CLUSTER=devnet
 *   SOLANA_RPC_URL=https://api.devnet.solana.com  # optional, uses default
 *   REGISTER_IDENTITY=true
 *
 * Run:
 *   bun run packages/examples/src/identity/solana-identity.ts
 */

import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import {
  identitySolana,
  identitySolanaFromEnv,
  createSolanaAgentIdentity,
} from '@lucid-agents/identity-solana';
import { z } from 'zod';

async function main() {
  // ── 1. One-shot registration (optional, same as autoRegister=true) ─────────
  // You can also register imperatively before building the agent:
  //
  // const identity = await createSolanaAgentIdentity({
  //   domain: 'my-agent.example.com',
  //   autoRegister: true,
  //   cluster: 'devnet',
  // });
  // console.log('Registered agent ID:', identity.record?.agentId);

  // ── 2. Build the agent with Solana identity extension ─────────────────────
  const agent = await createAgent({
    name: 'solana-identity-example',
    version: '1.0.0',
    description: 'Example agent with Solana on-chain identity',
  })
    .use(http())
    .use(
      identitySolana({
        config: identitySolanaFromEnv({
          // Override: only register on devnet for this example
          cluster: 'devnet',
        }),
      })
    )
    .build();

  console.log('Agent built with Solana identity extension');
  console.log('Trust config:', JSON.stringify(agent.trust, null, 2));

  // ── 3. Use identity clients for reputation feedback ────────────────────────
  // (In a real scenario, this would run after serving an x402 paid endpoint)
  //
  // if (agent.trust) {
  //   // Give feedback to another agent
  //   const identity = await createSolanaAgentIdentity({ cluster: 'devnet' });
  //   await identity.clients?.reputation.giveFeedback({
  //     toAgentId: 1,
  //     value: 90,
  //     valueDecimals: 0,
  //     tag1: 'reliable',
  //     tag2: 'fast',
  //     endpoint: 'https://other-agent.example.com',
  //   });
  // }

  console.log('✅ Example complete');
}

main().catch(console.error);
