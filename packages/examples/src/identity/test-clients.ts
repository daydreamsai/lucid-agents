/**
 * Write-enabled registry client probe.
 *
 * Set IDENTITY_RUN_WRITE_EXAMPLE=true only for an intentional registration
 * against the configured chain and signer.
 */

import { createAgent } from '@lucid-agents/core';
import { createAgentIdentity } from '@lucid-agents/identity';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

export async function runIdentityClientProbe(
  env: Record<string, string | undefined> = process.env
): Promise<void> {
  if (env.IDENTITY_RUN_WRITE_EXAMPLE !== 'true') {
    throw new Error(
      'This client probe may register an on-chain identity. Set IDENTITY_RUN_WRITE_EXAMPLE=true only after reviewing the configured signer, chain, domain, and gas policy.'
    );
  }

  console.log('Testing ERC-8004 Registry Clients Integration\n');

  // Create a minimal runtime with wallet configuration
  const agent = await createAgent({
    name: 'test-clients-agent',
    version: '1.0.0',
    description: 'Test registry clients',
  })
    .use(wallets({ config: walletsFromEnv(undefined, env) }))
    .build();

  const identity = await createAgentIdentity({
    runtime: agent,
    autoRegister: true,
    env,
  });

  console.log('Status:', identity.status);
  console.log('Domain:', identity.domain);
  console.log('Agent ID:', identity.record?.agentId?.toString());
  console.log('Transaction:', identity.transactionHash);
  console.log('Signature:', identity.signature?.slice(0, 20) + '...\n');

  if (identity.clients) {
    console.log('Registry Clients Created Successfully!\n');

    // Test Identity Registry Client
    console.log('Identity Registry:');
    console.log('   - Address:', identity.clients.identity.address);
    console.log('   - Chain ID:', identity.clients.identity.chainId);

    // Test Reputation Registry Client
    console.log('\nReputation Registry:');
    console.log('   - Address:', identity.clients.reputation.address);
    console.log('   - Chain ID:', identity.clients.reputation.chainId);
    console.log(
      '   - Methods:',
      Object.keys(identity.clients.reputation).filter(
        k =>
          typeof (identity.clients!.reputation as Record<string, unknown>)[
            k
          ] === 'function'
      )
    );

    console.log(
      '\nValidation Registry: not created by default (deprecated compatibility surface)'
    );

    console.log('\nDefault registry clients are ready to use.');

    // Example: Query reputation summary
    if (identity.record?.agentId) {
      try {
        const summary = await identity.clients.reputation.getSummary(
          identity.record.agentId
        );
        console.log('\nReputation Summary:');
        console.log('   - Total Feedback:', summary.count.toString());
        const average =
          summary.valueDecimals === 0
            ? Number(summary.value)
            : Number(summary.value) / 10 ** summary.valueDecimals;
        console.log('   - Average Score:', average);
      } catch {
        console.log(
          '\nReputation Summary: No feedback yet (this is normal for new agents)'
        );
      }
    }
  } else {
    console.log(
      'Registry clients were not created (missing RPC_URL or configuration)'
    );
  }
}

if (import.meta.main) {
  runIdentityClientProbe().catch(error => {
    console.error('Error:', error);
    process.exitCode = 1;
  });
}
