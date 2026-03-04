/*
 * XMPT Example - Agent-to-Agent Messaging
 *
 * This example demonstrates XMPT (eXtensible Message Passing Txn) for
 * agent-to-agent communication using the Lucid SDK.
 *
 * ARCHITECTURE:
 * - Two agents exchange messages using the XMPT extension
 * - Local transport for testing (simulates messaging without external service)
 * - Demonstrates send, onMessage, reply, and getInbox
 *
 * Run with: bun run src/xmpt/xmpt-messaging.ts
 */

import { createAgent } from '@lucid-agents/core';
import { xmpt } from '@lucid-agents/xmpt';

async function main() {
  console.log('[example] Creating two agents for messaging demo...\n');

  // ============================================================================
  // Agent A - alice@agentmail.to
  // ============================================================================
  const alice = await createAgent({
    name: 'alice',
    version: '1.0.0',
    description: 'Alice agent',
  })
    .use(xmpt({ inbox: 'alice@agentmail.to', transport: 'local' }))
    .build();

  if (!alice.xmpt) {
    throw new Error('XMPT extension not initialized for Alice');
  }

  console.log('[example] Alice initialized with inbox: alice@agentmail.to');

  // ============================================================================
  // Agent B - bob@agentmail.to
  // ============================================================================
  const bob = await createAgent({
    name: 'bob',
    version: '1.0.0',
    description: 'Bob agent',
  })
    .use(xmpt({ inbox: 'bob@agentmail.to', transport: 'local' }))
    .build();

  if (!bob.xmpt) {
    throw new Error('XMPT extension not initialized for Bob');
  }

  console.log('[example] Bob initialized with inbox: bob@agentmail.to\n');

  // ============================================================================
  // Alice sends a message to Bob
  // ============================================================================
  console.log('[example] Alice sends message to Bob...');

  const message = await alice.xmpt.send('bob@agentmail.to', 'Hello Bob!', {
    subject: 'Greetings',
    metadata: { priority: 'normal' },
  });

  console.log(`[example] Message sent!`);
  console.log(`  ID: ${message.id}`);
  console.log(`  From: ${message.from}`);
  console.log(`  To: ${message.to}`);
  console.log(`  Subject: ${message.subject}`);
  console.log(`  Body: ${message.body}\n`);

  // ============================================================================
  // Bob checks inbox
  // ============================================================================
  console.log('[example] Bob checks inbox...');

  const bobInbox = await bob.xmpt.getInbox();
  console.log(`[example] Bob has ${bobInbox.length} message(s) in inbox:`);
  bobInbox.forEach(msg => {
    console.log(
      `  - From: ${msg.from}, Subject: ${msg.subject}, Body: ${msg.body}`
    );
  });
  console.log();

  // ============================================================================
  // Bob replies to Alice
  // ============================================================================
  console.log('[example] Bob replies to Alice...');

  const reply = await bob.xmpt.reply(message.id, 'Hi Alice! Nice to meet you!');

  console.log(`[example] Reply sent!`);
  console.log(`  Thread ID: ${reply.threadId}`);
  console.log(`  Body: ${reply.body}\n`);

  // ============================================================================
  // Alice receives reply via callback
  // ============================================================================
  console.log('[example] Setting up message callback for Alice...');

  alice.xmpt.onMessage(envelope => {
    console.log(`[example] Alice received new message!`);
    console.log(`  From: ${envelope.from}`);
    console.log(`  Body: ${envelope.body}`);
    if (envelope.threadId) {
      console.log(`  Thread: ${envelope.threadId}`);
    }
  });

  // Send another message to trigger callback
  await alice.xmpt.send('alice@agentmail.to', 'Testing callback', {
    threadId: message.id,
  });

  console.log();

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('[example] === Demo Complete ===');
  console.log('[example] Demonstrated:');
  console.log('  1. send() - Send message to another agent');
  console.log('  2. getInbox() - Check received messages');
  console.log('  3. reply() - Reply to a thread');
  console.log('  4. onMessage() - Register callback for incoming messages');
  console.log('\n[example] For production, use transport: "agentmail" to');
  console.log('[example] connect to a real messaging service like AgentMail.');
}

main().catch(error => {
  console.error('[example] Fatal error:', error);
  process.exit(1);
});
