/**
 * Quick Start Example - ERC-8004 Agent Identity
 *
 * This example shows the simplest way to register your agent on the
 * ERC-8004 registry using environment variables.
 *
 * Prerequisites:
 * 1. Create a .env file with required variables (see .env.example)
 * 2. Run: bun run examples/quick-start.ts
 */

import { createAgent } from '@lucid-agents/core';
import { createAgentIdentity, registerAgent } from '@lucid-agents/identity';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

async function main() {
  console.log('ERC-8004 Agent Identity - Quick Start\n');

  // Create a minimal runtime with wallet configuration
  const agent = await createAgent({
    name: 'quick-start-agent',
    version: '1.0.0',
    description: 'Quick start example agent',
  })
    .use(wallets({ config: walletsFromEnv() }))
    .build();

  // Example 1: Simple registration with env vars
  console.log('Example 1: Simple Registration');
  console.log('Using environment variables for configuration...\n');

  const identity = await createAgentIdentity({
    runtime: agent,
    autoRegister: true,
  });

  console.log('Status:', identity.status);

  if (identity.didRegister) {
    console.log('Agent registered successfully!');
    console.log('Transaction:', identity.transactionHash);
    console.log(
      '\nNext step: Host your metadata at:',
      `https://${identity.domain}/.well-known/agent-registration.json`
    );
  } else if (identity.trust) {
    console.log('Found existing registration');
    console.log('Agent ID:', identity.record?.agentId);
  } else {
    console.log('No on-chain identity (agent will run without it)');
  }

  // Example 2: Explicit registration
  console.log('\n\nExample 2: Explicit Registration');
  console.log('Forcing registration with registerAgent()...\n');

  const registration = await registerAgent({
    runtime: agent,
    domain: 'my-agent.example.com',
  });

  console.log('Status:', registration.status);
  if (registration.didRegister) {
    console.log('Registered!');
    console.log('TX:', registration.transactionHash);
  }

  // Example 3: Custom configuration
  console.log('\n\nExample 3: Custom Configuration');
  console.log('Using custom trust models and overrides...\n');

  const customIdentity = await createAgentIdentity({
    runtime: agent,
    domain: 'custom-agent.example.com',
    autoRegister: true,
    trustModels: ['feedback', 'tee-attestation'],
    trustOverrides: {
      feedbackDataUri: 'https://custom-agent.example.com/feedback.json',
    },
  });

  console.log('Status:', customIdentity.status);
  if (customIdentity.trust) {
    console.log('Trust models:', customIdentity.trust.trustModels);
    console.log('Feedback URI:', customIdentity.trust.feedbackDataUri);
  }

  console.log(
    '\nDone! Check the full-integration example for usage with agent-kit.'
  );
}

main().catch(console.error);
