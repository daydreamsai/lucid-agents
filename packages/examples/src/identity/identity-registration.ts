/**
 * ERC-8004 Identity Registration Example
 *
 * Demonstrates how to register an agent's on-chain identity on Base using
 * the ERC-8004 standard via @lucid-agents/identity.
 *
 * Prerequisites:
 *   1. Set AGENT_WALLET_TYPE=private-key
 *   2. Set AGENT_WALLET_PRIVATE_KEY=0x... (Base Sepolia funded key)
 *   3. Set AGENT_DOMAIN=my-agent.example.com (or any domain you control)
 *   4. Optionally set RPC_URL and CHAIN_ID
 *
 * Run with:
 *   AGENT_WALLET_TYPE=private-key \
 *   AGENT_WALLET_PRIVATE_KEY=0xYourKey \
 *   AGENT_DOMAIN=my-agent.example.com \
 *   bun run packages/examples/src/identity/identity-registration.ts
 */

import { createAgent } from '@lucid-agents/core';
import { createAgentIdentity, registerAgent } from '@lucid-agents/identity';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

// ── Config ────────────────────────────────────────────────────────────────────

const AGENT_DOMAIN = process.env.AGENT_DOMAIN ?? 'demo-agent.example.com';
const RPC_URL = process.env.RPC_URL;
const CHAIN_ID = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 84532; // Base Sepolia

// ── Build agent runtime ───────────────────────────────────────────────────────

export async function buildIdentityAgent(opts?: {
  domain?: string;
  rpcUrl?: string;
  chainId?: number;
}) {
  const domain = opts?.domain ?? AGENT_DOMAIN;
  const rpcUrl = opts?.rpcUrl ?? RPC_URL;
  const chainId = opts?.chainId ?? CHAIN_ID;

  const walletsConfig = walletsFromEnv();

  const agentBuilder = createAgent({
    name: 'identity-registration-demo',
    version: '1.0.0',
    description: 'Demonstrates ERC-8004 identity registration on Base',
  });

  if (walletsConfig) {
    agentBuilder.use(wallets({ config: walletsConfig }));
  }

  const agent = await agentBuilder.build();

  return { agent, domain, rpcUrl, chainId };
}

// ── Registration helpers ──────────────────────────────────────────────────────

/**
 * Example 1 — Auto-register using environment variables.
 * Returns identity status without throwing if wallet is not configured.
 */
export async function autoRegisterIdentity() {
  console.log('Example 1: Auto-register via env vars');
  const { agent } = await buildIdentityAgent();

  const identity = await createAgentIdentity({
    runtime: agent,
    autoRegister: true,
  });

  if (identity.didRegister) {
    console.log('  ✓ Registered! TX:', identity.transactionHash);
  } else if (identity.trust) {
    console.log('  ✓ Already registered. Agent ID:', identity.record?.agentId);
  } else {
    console.log('  ℹ No on-chain identity (wallet not configured)');
  }

  return identity;
}

/**
 * Example 2 — Explicit registration with a specific domain.
 */
export async function explicitRegisterIdentity(domain: string) {
  console.log(`Example 2: Explicit registration for domain: ${domain}`);
  const { agent } = await buildIdentityAgent({ domain });

  const registration = await registerAgent({ runtime: agent, domain });

  if (registration.didRegister) {
    console.log('  ✓ Registered! TX:', registration.transactionHash);
  } else {
    console.log('  ℹ Status:', registration.status);
  }

  return registration;
}

/**
 * Example 3 — Registration with custom trust models.
 */
export async function registerWithTrustModels() {
  console.log('Example 3: Registration with custom trust models');
  const { agent, domain } = await buildIdentityAgent();

  const identity = await createAgentIdentity({
    runtime: agent,
    domain,
    autoRegister: true,
    trustModels: ['feedback', 'tee-attestation'],
    trustOverrides: {
      feedbackDataUri: `https://${domain}/feedback.json`,
    },
  });

  if (identity.trust) {
    console.log('  Trust models:', identity.trust.trustModels);
    console.log('  Feedback URI:', identity.trust.feedbackDataUri);
  } else {
    console.log('  ℹ No trust data returned (wallet not configured)');
  }

  return identity;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('ERC-8004 Identity Registration Example');
  console.log('='.repeat(60));
  console.log(`Domain:  ${AGENT_DOMAIN}`);
  console.log(`Network: Base (chain ${CHAIN_ID})`);
  console.log('');

  await autoRegisterIdentity();
  console.log('');

  await explicitRegisterIdentity(AGENT_DOMAIN);
  console.log('');

  await registerWithTrustModels();
  console.log('');

  console.log('Done! Host your metadata at:');
  console.log(`  https://${AGENT_DOMAIN}/.well-known/agent-metadata.json`);
}

if (
  typeof process !== 'undefined' &&
  process.argv[1]?.endsWith('identity-registration.ts')
) {
  main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
