/**
 * Quick Start Example - ERC-8004 Agent Identity
 *
 * This example shows how to resolve an existing identity read-only or
 * explicitly register a new agent using environment variables.
 *
 * Prerequisites:
 * 1. Create a .env file with required variables (see .env.example)
 * 2. Run: bun run examples/quick-start.ts
 */

import { createAgent } from '@lucid-agents/core';
import {
  type AgentIdentity,
  createAgentIdentity,
  type CreateAgentIdentityOptions,
  registerAgent,
} from '@lucid-agents/identity';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

type IdentityOperation = (
  options: CreateAgentIdentityOptions
) => Promise<AgentIdentity>;

export type IdentityQuickStartOptions = {
  env?: Record<string, string | undefined>;
  lookupIdentity?: IdentityOperation;
  registerIdentity?: IdentityOperation;
  log?: (...values: unknown[]) => void;
};

export async function runIdentityQuickStart(
  options: IdentityQuickStartOptions = {}
): Promise<void> {
  const env = options.env ?? process.env;
  const lookupIdentity = options.lookupIdentity ?? createAgentIdentity;
  const registerIdentity = options.registerIdentity ?? registerAgent;
  const log = options.log ?? console.log;

  log('ERC-8004 Agent Identity - Quick Start\n');

  // Create a minimal runtime with wallet configuration
  const agent = await createAgent({
    name: 'quick-start-agent',
    version: '1.0.0',
    description: 'Quick start example agent',
  })
    .use(wallets({ config: walletsFromEnv(undefined, env) }))
    .build();

  // Example 1: Read-only domain discovery or direct ID lookup
  log('Example 1: Existing Identity Lookup');
  log('Using environment variables for configuration...\n');

  const identity = await lookupIdentity({
    runtime: agent,
    agentId: env.IDENTITY_AGENT_ID,
    autoRegister: false,
    env,
  });

  log('Status:', identity.status);

  if (identity.record) {
    log('Found existing registration');
    log('Agent ID:', identity.record.agentId);
  } else {
    log(
      'No identity resolved. Publish a matching domain registration document, set IDENTITY_AGENT_ID, or use the explicit registration flow.'
    );
  }

  if (env.IDENTITY_AUTO_REGISTER !== 'true') {
    log(
      '\nRegistration skipped. Set IDENTITY_AUTO_REGISTER=true and AGENT_DOMAIN to run the single explicit write example.'
    );
    return;
  }

  const domain = env.AGENT_DOMAIN?.trim();
  if (!domain) {
    throw new Error(
      'AGENT_DOMAIN is required when IDENTITY_AUTO_REGISTER=true'
    );
  }

  // Example 2: Explicit, opt-in registration with custom trust metadata.
  log('\n\nExample 2: Explicit Registration');
  const registration = await registerIdentity({
    runtime: agent,
    domain,
    trustModels: ['feedback', 'tee-attestation'],
    trustOverrides: {
      feedbackDataUri: `https://${domain}/feedback.json`,
    },
    env,
  });

  log('Status:', registration.status);
  if (registration.didRegister) {
    log('Registered!');
    log('TX:', registration.transactionHash);
  }
}

if (import.meta.main) {
  runIdentityQuickStart().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
