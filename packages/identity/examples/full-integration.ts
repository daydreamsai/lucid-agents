/**
 * Full Integration Example - Comprehensive ERC-8004 Testing
 *
 * This example exercises ALL functionality of the ERC-8004 identity SDK:
 * - Identity Registry (registration, lookups, metadata)
 * - Validation Registry (requests, responses, queries)
 * - Reputation Registry (feedback, responses, queries)
 *
 * Prerequisites:
 * 1. Install @lucid-agents/core: bun add @lucid-agents/core
 * 2. Install @lucid-agents/wallet: bun add @lucid-agents/wallet
 * 3. Create a .env file with required variables:
 *    - AGENT_DOMAIN=your-agent.example.com
 *    - RPC_URL=https://sepolia.base.org
 *    - CHAIN_ID=84532
 *    - AGENT_WALLET_PRIVATE_KEY=0x...
 * 4. Run: bun run examples/full-integration.ts
 */

import { createApp } from '@lucid-agents/core';
import { wallets } from '@lucid-agents/wallet';
import { walletsFromEnv } from '@lucid-agents/wallet';

import { createAgentIdentity } from '../src/index';

async function main() {
  console.log('='.repeat(80));
  console.log('ERC-8004 Identity SDK - Comprehensive Integration Test');
  console.log('='.repeat(80));
  console.log('');

  // ============================================================================
  // STEP 0: Create Agent Runtime
  // ============================================================================
  console.log('STEP 0: Creating Agent Runtime');
  console.log('-'.repeat(80));

  // Create a minimal runtime with wallet configuration using extensions
  const agent = await createAgent({
    name: 'test-agent',
    version: '1.0.0',
    description: 'ERC-8004 integration test agent',
  })
    .use(wallets({ config: walletsFromEnv() }))
    .build();

  console.log('Runtime created with wallet configuration');

  // ============================================================================
  // STEP 1: Identity Registration - Register Two Agents
  // ============================================================================
  console.log('\nSTEP 1: Identity Registration - Register Two Agents');
  console.log('-'.repeat(80));

  // Register Agent 1 (main agent)
  const env = typeof process !== 'undefined' ? process.env : {};
  const baseDomain = env.AGENT_DOMAIN || 'test-agent.example.com';
  const agent1Domain = baseDomain;
  const agent2Domain = `client.${baseDomain}`;

  console.log(`\n1.1: Registering Agent 1 (${agent1Domain})...`);
  const identity1 = await createAgentIdentity({
    runtime,
    domain: agent1Domain,
    autoRegister: true,
    trustModels: ['feedback', 'inference-validation'],
  });

  console.log(`   Status: ${identity1.status}`);
  if (identity1.didRegister) {
    console.log(`   ✓ Agent 1 registered on-chain!`);
    console.log(`   Transaction: ${identity1.transactionHash}`);
    console.log(`   Agent ID: ${identity1.record?.agentId?.toString()}`);
  } else if (identity1.record) {
    console.log(`   ✓ Found existing registration`);
    console.log(`   Agent ID: ${identity1.record.agentId?.toString()}`);
  } else {
    console.log('   ✗ No identity found or registered');
    return;
  }

  // Register Agent 2 (client/validator agent) - same wallet, different domain
  console.log(`\n1.2: Registering Agent 2 (${agent2Domain})...`);
  const identity2 = await createAgentIdentity({
    runtime,
    domain: agent2Domain,
    autoRegister: true,
    trustModels: ['feedback', 'inference-validation'],
  });

  console.log(`   Status: ${identity2.status}`);
  if (identity2.didRegister) {
    console.log(`   ✓ Agent 2 registered on-chain!`);
    console.log(`   Transaction: ${identity2.transactionHash}`);
    console.log(`   Agent ID: ${identity2.record?.agentId?.toString()}`);
  } else if (identity2.record) {
    console.log(`   ✓ Found existing registration`);
    console.log(`   Agent ID: ${identity2.record.agentId?.toString()}`);
  } else {
    console.log('   ✗ No identity found or registered');
    return;
  }

  if (!identity1.clients || !identity2.clients) {
    console.log(
      '\nRegistry clients not available - cannot test further operations'
    );
    return;
  }

  const {
    identity: identityClient,
    validation,
    reputation,
  } = identity1.clients;
  const agent1Id = identity1.record!.agentId!;
  const agent2Address = identity2.record!.owner!;

  console.log('\n');

  // ============================================================================
  // STEP 2: Identity Registry Operations
  // ============================================================================
  console.log('STEP 2: Identity Registry Operations');
  console.log('-'.repeat(80));

  // 2.1: Get agent by ID (read)
  console.log('\n2.1: Reading agent record by ID...');
  const agentRecord = await identityClient.get(agent1Id);
  if (agentRecord) {
    console.log(`Agent record retrieved:`);
    console.log(`   Agent ID: ${agentRecord.agentId?.toString()}`);
    console.log(`   Owner: ${agentRecord.owner}`);
    console.log(`   Token URI: ${agentRecord.tokenURI}`);
  } else {
    console.log('Agent record not found (may need more confirmations)');
    // Use the record from identity if available
    if (identity1.record) {
      console.log('Using record from registration:');
      console.log(`   Agent ID: ${identity1.record.agentId?.toString()}`);
      console.log(`   Owner: ${identity1.record.owner}`);
      console.log(`   Token URI: ${identity1.record.tokenURI}`);
    }
  }

  // 2.2: Get metadata (read) - check before writing
  console.log('\n2.2: Reading agent metadata (before write)...');
  const metadataKey = 'test-key';
  const existingMetadata = await identityClient.getMetadata(
    agent1Id,
    metadataKey
  );
  if (existingMetadata) {
    console.log(`Metadata found for key "${metadataKey}":`);
    console.log(`   Value: ${Buffer.from(existingMetadata).toString('hex')}`);
  } else {
    console.log(
      `No metadata found for key "${metadataKey}" (expected for new key)`
    );
  }

  // 2.3: Set metadata (write)
  console.log('\n2.3: Writing agent metadata...');
  try {
    const testMetadata = new TextEncoder().encode('test-metadata-value');
    const metadataTx = await identityClient.setMetadata(
      agent1Id,
      metadataKey,
      testMetadata
    );
    console.log(`Metadata written:`);
    console.log(`   Transaction: ${metadataTx}`);
    console.log(`   Key: ${metadataKey}`);
    console.log(`   Value: ${Buffer.from(testMetadata).toString('hex')}`);

    // Read back after write
    const writtenMetadata = await identityClient.getMetadata(
      agent1Id,
      metadataKey
    );
    if (writtenMetadata) {
      const matches = Buffer.from(writtenMetadata).equals(testMetadata);
      console.log(
        `   ✓ Verified: Metadata can be read back (matches: ${matches})`
      );
    } else {
      console.log(
        `   ⚠ Metadata not yet readable (may need more confirmations)`
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Could not write metadata: ${message}`);
    console.log(
      `   Note: This requires the agent to be the owner of the token`
    );
  }

  // 2.4: Convert to registration entry (utility for trust config)
  console.log('\n2.4: Converting record to registration entry...');
  console.log('   (This utility formats the record for use in trust config)');
  const recordToUse =
    agentRecord ??
    (identity1.record
      ? {
          agentId: identity1.record.agentId!,
          owner: identity1.record.owner!,
          tokenURI: identity1.record.tokenURI!,
        }
      : null);
  if (recordToUse) {
    const registrationEntry = identityClient.toRegistrationEntry(recordToUse);
    console.log(`Registration entry created:`);
    console.log(`   Agent ID: ${registrationEntry.agentId}`);
    console.log(`   Agent Address: ${registrationEntry.agentAddress}`);
    if (registrationEntry.agentRegistry) {
      console.log(`   Registry: ${registrationEntry.agentRegistry}`);
    }
    if (registrationEntry.tokenURI) {
      console.log(`   Token URI: ${registrationEntry.tokenURI}`);
    }
  } else {
    console.log('No record available for conversion');
  }

  console.log('\n');

  // ============================================================================
  // STEP 3: Validation Registry Operations
  // ============================================================================
  console.log('STEP 3: Validation Registry Operations');
  console.log('-'.repeat(80));

  // 3.1: Get initial validation summary (read)
  console.log('\n3.1: Reading validation summary...');
  const initialSummary = await validation.getSummary(agent1Id);
  console.log(`Initial validation summary:`);
  console.log(`   Count: ${initialSummary.count.toString()}`);
  console.log(`   Average Response: ${initialSummary.avgResponse}`);

  // 3.2: Get agent validations (read)
  console.log('\n3.2: Reading agent validation requests...');
  const agentValidations = await validation.getAgentValidations(agent1Id);
  console.log(`Agent 1 has ${agentValidations.length} validation request(s)`);
  if (agentValidations.length > 0) {
    console.log(
      `   Request hashes: ${agentValidations.slice(0, 3).join(', ')}${agentValidations.length > 3 ? '...' : ''}`
    );
  }

  // 3.3: Create validation request (write) - Agent 1 requests validation from Agent 2
  console.log('\n3.3: Creating validation request (Agent 1 -> Agent 2)...');
  let requestHash: `0x${string}` | null = null;
  try {
    // Use Agent 2's address as the validator (Agent 2 must be registered in Identity Registry)
    const validatorAddress = agent2Address as `0x${string}`;
    const requestUri = `https://${identity1.domain}/validation-request-${Date.now()}.json`;
    const requestTx = await validation.createRequest({
      validatorAddress,
      agentId: agent1Id,
      requestUri,
    });
    console.log(`Validation request created:`);
    console.log(`   Transaction: ${requestTx}`);
    console.log(`   Validator (Agent 2): ${validatorAddress}`);
    console.log(`   Agent (Agent 1): ${agent1Id.toString()}`);
    console.log(`   Request URI: ${requestUri}`);

    // Compute request hash to check status
    const { hashValidationRequest } = await import(
      '../src/registries/signatures.js'
    );
    requestHash = hashValidationRequest(requestUri);

    // 3.4: Get validation status (read)
    console.log('\n3.4: Reading validation status...');
    const validationStatus = await validation.getValidationStatus(requestHash);
    if (validationStatus) {
      // Check if response is 0 (unresponded) or non-zero (responded)
      const isResponded = validationStatus.response !== 0;
      console.log(`Validation status retrieved:`);
      console.log(`   Validator: ${validationStatus.validatorAddress}`);
      console.log(`   Agent ID: ${validationStatus.agentId?.toString()}`);
      console.log(
        `   Response: ${validationStatus.response} ${isResponded ? '(responded)' : '(pending)'}`
      );
      console.log(`   Last Update: ${validationStatus.lastUpdate?.toString()}`);
    } else {
      console.log(
        `Validation status not yet available (may need more confirmations)`
      );
    }

    // 3.5: Get validator requests (read) - check Agent 2's pending requests
    console.log('\n3.5: Reading validator requests (Agent 2)...');
    const validatorRequests =
      await validation.getValidatorRequests(validatorAddress);
    console.log(
      `Agent 2 (validator) has ${validatorRequests.length} request(s)`
    );
    if (validatorRequests.length > 0) {
      console.log(
        `   Request hashes: ${validatorRequests.slice(0, 3).join(', ')}${validatorRequests.length > 3 ? '...' : ''}`
      );
    }

    // 3.6: Submit validation response (write) - Agent 2 responds as validator
    console.log(
      '\n3.6: Submitting validation response (Agent 2 as validator)...'
    );
    try {
      // Use Agent 2's clients to submit the response
      const responseHash =
        '0x0000000000000000000000000000000000000000000000000000000000000001' as const;
      const responseTx = await identity2.clients.validation.submitResponse({
        requestHash,
        response: 1, // 1 = valid
        responseUri: `https://${identity2.domain}/validation-response-${Date.now()}.json`,
        responseHash,
      });
      console.log(`Validation response submitted:`);
      console.log(`   Transaction: ${responseTx}`);
      console.log(`   Request Hash: ${requestHash}`);
      console.log(`   Response: 1 (valid)`);

      // Re-check validation status
      const updatedStatus = await validation.getValidationStatus(requestHash);
      if (updatedStatus && updatedStatus.response !== 0) {
        console.log(
          `   ✓ Confirmed: Validation status updated (response: ${updatedStatus.response})`
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Could not submit validation response: ${message}`);
      console.log(
        `   Note: The validator address must be a registered agent in the Identity Registry`
      );
    }

    // 3.7: Get updated summary (read)
    console.log('\n3.7: Reading updated validation summary...');
    const updatedSummary = await validation.getSummary(agent1Id);
    console.log(`Updated validation summary:`);
    console.log(`   Count: ${updatedSummary.count.toString()}`);
    console.log(`   Average Response: ${updatedSummary.avgResponse}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = (error as { reason?: string })?.reason;
    console.log(`Could not create validation request: ${message}`);
    if (reason) {
      console.log(`   Reason: ${reason}`);
    }
  }

  console.log('\n');

  // ============================================================================
  // STEP 4: Reputation Registry Operations
  // ============================================================================
  console.log('STEP 4: Reputation Registry Operations');
  console.log('-'.repeat(80));

  // 4.1: Get initial reputation summary (read)
  console.log('\n4.1: Reading reputation summary (Agent 1)...');
  const initialRepSummary = await reputation.getSummary(agent1Id);
  console.log(`Initial reputation summary:`);
  console.log(`   Count: ${initialRepSummary.count.toString()}`);
  console.log(`   Average Score: ${initialRepSummary.averageScore}`);

  // 4.2: Get clients (read)
  console.log('\n4.2: Reading feedback clients (Agent 1)...');
  const clients = await reputation.getClients(agent1Id);
  console.log(`Agent 1 has ${clients.length} feedback client(s)`);
  if (clients.length > 0) {
    console.log(
      `   Clients: ${clients.slice(0, 3).join(', ')}${clients.length > 3 ? '...' : ''}`
    );
  }

  // 4.3: Give feedback (write) - Agent 2 gives feedback to Agent 1
  console.log('\n4.3: Giving feedback (Agent 2 -> Agent 1)...');
  let feedbackEntry:
    | import('../src/registries/reputation.js').FeedbackEntry
    | null = null;
  let lastIndex = 0n;
  let clientAddress: `0x${string}` | null = null;

  try {
    // Use Agent 2's reputation client to give feedback to Agent 1
    const feedbackTx = await identity2.clients.reputation.giveFeedback({
      toAgentId: agent1Id,
      score: 85,
      tag1: 'helpful',
      tag2: 'reliable',
      feedbackUri: `https://${identity2.domain}/feedback-${Date.now()}.json`,
    });
    console.log(`Feedback given:`);
    console.log(`   Transaction: ${feedbackTx}`);
    console.log(`   From: Agent 2 (${agent2Address})`);
    console.log(`   To: Agent 1 (${agent1Id.toString()})`);
    console.log(`   Score: 85/100`);
    console.log(`   Tags: helpful, reliable`);

    // Get the feedback we just created (using Agent 1's read client)
    const updatedClients = await reputation.getClients(agent1Id);
    if (updatedClients.length > 0) {
      // Find Agent 2's address in the clients list
      clientAddress = (updatedClients.find(
        c => c.toLowerCase() === agent2Address.toLowerCase()
      ) || updatedClients[0]) as `0x${string}`;
      lastIndex = await reputation.getLastIndex(agent1Id, clientAddress);
      if (lastIndex > 0n) {
        feedbackEntry = await reputation.getFeedback(
          agent1Id,
          clientAddress,
          lastIndex
        );
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Could not give feedback: ${message}`);
    // Try to get existing feedback if any
    try {
      const existingClients = await reputation.getClients(agent1Id);
      if (existingClients.length > 0) {
        clientAddress = existingClients[0] as `0x${string}`;
        lastIndex = await reputation.getLastIndex(agent1Id, clientAddress);
        if (lastIndex > 0n) {
          feedbackEntry = await reputation.getFeedback(
            agent1Id,
            clientAddress,
            lastIndex
          );
        }
      }
    } catch {
      // Ignore errors when checking for existing feedback
    }
  }

  // 4.4: Get last index (read) - if we have a client
  if (clientAddress) {
    console.log('\n4.4: Reading last feedback index...');
    console.log(`Last feedback index: ${lastIndex.toString()}`);
  } else {
    console.log('\n4.4: No feedback clients found - skipping index read');
  }

  // 4.5: Get specific feedback (read)
  console.log('\n4.5: Reading specific feedback entry...');
  if (feedbackEntry) {
    console.log(`Feedback entry retrieved:`);
    console.log(`   Agent ID: ${feedbackEntry.agentId?.toString()}`);
    console.log(`   Client: ${feedbackEntry.clientAddress}`);
    console.log(`   Index: ${feedbackEntry.feedbackIndex?.toString()}`);
    console.log(`   Score: ${feedbackEntry.score}/100`);
    console.log(`   Tag1: ${feedbackEntry.tag1}`);
    console.log(`   Tag2: ${feedbackEntry.tag2}`);
    console.log(`   Revoked: ${feedbackEntry.isRevoked}`);
  } else {
    console.log('No feedback entries found');
  }

  // 4.6: Get all feedback (read)
  console.log('\n4.6: Reading all feedback (Agent 1)...');
  const allFeedback = await reputation.getAllFeedback(agent1Id);
  console.log(`Agent 1 has ${allFeedback.length} feedback entry/entries`);
  if (allFeedback.length > 0) {
    const avgScore =
      allFeedback.reduce((sum, f) => sum + f.score, 0) / allFeedback.length;
    console.log(`   Average score: ${avgScore.toFixed(1)}/100`);
    console.log(
      `   Active entries: ${allFeedback.filter(f => !f.isRevoked).length}`
    );
  }

  // 4.7: Append response to feedback (write) - Agent 1 responds to Agent 2's feedback
  console.log('\n4.7: Appending response to feedback (Agent 1 responds)...');
  if (
    feedbackEntry &&
    clientAddress &&
    feedbackEntry.feedbackIndex !== undefined
  ) {
    try {
      const responseTx = await reputation.appendResponse({
        agentId: agent1Id,
        clientAddress,
        feedbackIndex: feedbackEntry.feedbackIndex,
        responseUri: `https://${identity1.domain}/response-${Date.now()}.json`,
        responseHash:
          '0x0000000000000000000000000000000000000000000000000000000000000001' as const,
      });
      console.log(`Response appended:`);
      console.log(`   Transaction: ${responseTx}`);
      console.log(
        `   Feedback Index: ${feedbackEntry.feedbackIndex.toString()}`
      );

      // 4.8: Get response count (read)
      console.log('\n4.8: Reading response count...');
      const responseCount = await reputation.getResponseCount(
        agent1Id,
        clientAddress,
        feedbackEntry.feedbackIndex,
        [agent2Address] // responders list (Agent 2)
      );
      console.log(`Response count: ${responseCount.toString()}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Could not append response: ${message}`);
    }
  } else {
    console.log('No feedback entry available - skipping response append');
  }

  // 4.9: Get updated summary (read)
  console.log('\n4.9: Reading updated reputation summary (Agent 1)...');
  const updatedRepSummary = await reputation.getSummary(agent1Id);
  console.log(`Updated reputation summary:`);
  console.log(`   Count: ${updatedRepSummary.count.toString()}`);
  console.log(`   Average Score: ${updatedRepSummary.averageScore}`);

  // 4.10: Revoke feedback (write) - Agent 2 revokes their feedback
  console.log('\n4.10: Revoking feedback (Agent 2 revokes)...');
  if (feedbackEntry && feedbackEntry.feedbackIndex !== undefined) {
    try {
      // Use Agent 2's reputation client to revoke
      const revokeTx = await identity2.clients.reputation.revokeFeedback({
        agentId: agent1Id,
        feedbackIndex: feedbackEntry.feedbackIndex,
      });
      console.log(`Feedback revoked:`);
      console.log(`   Transaction: ${revokeTx}`);
      console.log(
        `   Feedback Index: ${feedbackEntry.feedbackIndex.toString()}`
      );

      // Verify it's revoked
      const revokedEntry = await reputation.getFeedback(
        agent1Id,
        feedbackEntry.clientAddress,
        feedbackEntry.feedbackIndex
      );
      if (revokedEntry?.isRevoked) {
        console.log(`   ✓ Confirmed: Feedback is now revoked`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Could not revoke feedback: ${message}`);
    }
  } else {
    console.log('No feedback entry available to revoke');
  }

  console.log('\n');

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('='.repeat(80));
  console.log('Integration Test Summary');
  console.log('='.repeat(80));
  console.log('');
  console.log('Identity Registry:');
  console.log('   - Agent registration');
  console.log('   - Read agent record');
  console.log('   - Read/write metadata');
  console.log('   - Convert to registration entry');
  console.log('');
  console.log('Validation Registry:');
  console.log('   - Create validation request');
  console.log('   - Read validation status');
  console.log('   - Read agent validations');
  console.log('   - Read validator requests');
  console.log('   - Read validation summary');
  console.log('');
  console.log('Reputation Registry:');
  console.log('   - Give feedback');
  console.log('   - Read feedback entries');
  console.log('   - Read all feedback');
  console.log('   - Append response to feedback');
  console.log('   - Read response count');
  console.log('   - Read reputation summary');
  console.log('   - Read feedback clients');
  console.log('');
  console.log('All ERC-8004 registry operations tested!');
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
