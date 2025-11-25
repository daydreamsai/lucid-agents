/**
 * Full Integration Example - A2A Composition (Three Agents)
 *
 * This example demonstrates the core A2A use case: agent composition where an
 * agent acts as both server and client (facilitator/middleware pattern).
 *
 * Architecture:
 * - Agent 1 (Worker): Does the actual work (echo, process, stream)
 * - Agent 2 (Facilitator): Receives calls from Agent 3, calls Agent 1, returns results
 * - Agent 3 (Client): Calls Agent 2
 *
 * Flow: Agent 3 -> Agent 2 -> Agent 1 -> Agent 2 -> Agent 3
 *
 * This demonstrates that agents can act as both clients and servers,
 * enabling complex agent compositions and supply chains.
 *
 * Prerequisites:
 * 1. Install dependencies: bun install
 * 2. Run: bun run examples/full-integration.ts
 */

import {
  a2a,
  fetchAgentCard,
  findSkill,
  hasCapability,
  supportsPayments,
  waitForTask,
} from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import type { A2ARuntime } from '@lucid-agents/types/a2a';
import { z } from 'zod';

// Helper to start a simple HTTP server
async function startServer(
  port: number,
  handler: (req: Request) => Promise<Response> | Response
): Promise<{ url: string; close: () => void }> {
  if (typeof Bun !== 'undefined') {
    const server = Bun.serve({
      port,
      fetch: handler,
    });
    const url = `http://localhost:${port}`;
    return {
      url,
      close: () => {
        server.stop();
      },
    };
  }

  throw new Error('Bun runtime required for this example');
}

async function main() {
  console.log('='.repeat(80));
  console.log('A2A SDK - Comprehensive Integration Test');
  console.log('='.repeat(80));
  console.log('');

  // ============================================================================
  // STEP 1: Create Agent 1 (Worker Agent)
  // ============================================================================
  console.log('STEP 1: Creating Agent 1 (Worker Agent)');
  console.log('-'.repeat(80));

  const agentBuilder1 = createAgent({
    name: 'worker-agent',
    version: '1.0.0',
    description: 'Worker agent that processes tasks',
  })
    .use(http())
    .use(a2a());

  const {
    app: app1,
    addEntrypoint: addEntrypoint1,
    runtime: runtime1,
  } = await createAgentApp(await agentBuilder1.build());

  // Add echo entrypoint with tags for discovery
  addEntrypoint1({
    key: 'echo',
    description: 'Echoes back the input text',
    input: z.object({ text: z.string() }),
    output: z.object({ text: z.string() }),
    handler: async ctx => {
      const text = ctx.input.text || '';
      console.log(`[Agent 1] echo handler called with: "${text}"`);
      return {
        output: { text: `Echo: ${text}` },
        usage: { total_tokens: text.length },
      };
    },
  });

  // Add process entrypoint
  addEntrypoint1({
    key: 'process',
    description: 'Processes data and returns result',
    input: z.object({ data: z.array(z.number()) }),
    output: z.object({ result: z.number() }),
    handler: async ctx => {
      const data = ctx.input.data || [];
      const result = data.reduce((sum, n) => sum + n, 0);
      console.log(
        `[Agent 1] process handler called with data: [${data.join(', ')}]`
      );
      return {
        output: { result },
        usage: { total_tokens: data.length },
      };
    },
  });

  // Add stream entrypoint
  addEntrypoint1({
    key: 'stream',
    description: 'Streams characters back',
    input: z.object({ prompt: z.string() }),
    output: z.object({ done: z.boolean() }),
    streaming: true,
    stream: async (ctx, emit) => {
      const prompt = ctx.input.prompt || '';
      console.log(`[Agent 1] stream handler called with: "${prompt}"`);
      for (const char of prompt) {
        await emit({ kind: 'delta', delta: char, mime: 'text/plain' });
      }
      await emit({
        kind: 'text',
        text: `Streamed: ${prompt}`,
        mime: 'text/plain',
      });
      return {
        output: { done: true },
        usage: { total_tokens: prompt.length },
      };
    },
  });

  const server1 = await startServer(8787, app1.fetch.bind(app1));
  console.log(`Agent 1 running at: ${server1.url}`);
  console.log('');

  // ============================================================================
  // STEP 2: Create Agent 2 (Facilitator Agent - acts as both server and client)
  // ============================================================================
  console.log('STEP 2: Creating Agent 2 (Facilitator Agent)');
  console.log('-'.repeat(80));
  console.log('  Agent 2 acts as BOTH server and client:');
  console.log('    - Server: Receives calls from Agent 3');
  console.log('    - Client: Calls Agent 1 to do the work');
  console.log('-'.repeat(80));

  const agentBuilder2 = createAgent({
    name: 'facilitator-agent',
    version: '1.0.0',
    description: 'Facilitator agent that proxies requests to worker agent',
  })
    .use(http())
    .use(a2a());

  const {
    app: app2,
    addEntrypoint: addEntrypoint2,
    runtime: runtime2,
  } = await createAgentApp(await agentBuilder2.build());

  // Get A2A runtime from Agent 2 (now available via extension)
  const a2a2ForAgent1 = runtime2.a2a;
  if (!a2a2ForAgent1) {
    throw new Error('A2A runtime not available on Agent 2');
  }

  // Add facilitator entrypoints that call Agent 1
  addEntrypoint2({
    key: 'echo',
    description: 'Proxies echo requests to worker agent',
    input: z.object({ text: z.string() }),
    output: z.object({ text: z.string() }),
    handler: async ctx => {
      console.log(
        `[Agent 2] Facilitator echo handler called with: "${ctx.input.text}"`
      );
      const agent1Url = 'http://localhost:8787';
      const agent1Card = await a2a2ForAgent1.fetchCard(agent1Url);

      const { taskId } = await a2a2ForAgent1.client.sendMessage(
        agent1Card,
        'echo',
        {
          text: ctx.input.text,
        }
      );
      console.log(`[Agent 2] Created task ${taskId} for Agent 1`);

      const task = await waitForTask<{ text: string }>(
        a2a2ForAgent1.client,
        agent1Card,
        taskId
      );

      if (task.status === 'failed') {
        throw new Error(
          `Task failed: ${task.error?.message || 'Unknown error'}`
        );
      }

      console.log(
        `[Agent 2] Got result from Agent 1: ${JSON.stringify(task.result?.output)}`
      );

      // Validate output from remote agent with Zod schema (runtime safety)
      const outputSchema = z.object({ text: z.string() });
      const validatedOutput = outputSchema.parse(task.result?.output);

      return {
        output: validatedOutput,
        usage: task.result?.usage,
      };
    },
  });

  addEntrypoint2({
    key: 'process',
    description: 'Proxies process requests to worker agent',
    input: z.object({ data: z.array(z.number()) }),
    output: z.object({ result: z.number() }),
    handler: async ctx => {
      console.log(
        `[Agent 2] Facilitator process handler called with data: [${ctx.input.data.join(', ')}]`
      );
      const agent1Url = 'http://localhost:8787';
      const agent1Card = await a2a2ForAgent1.fetchCard(agent1Url);

      const { taskId } = await a2a2ForAgent1.client.sendMessage(
        agent1Card,
        'process',
        {
          data: ctx.input.data,
        }
      );
      console.log(`[Agent 2] Created task ${taskId} for Agent 1`);

      const task = await waitForTask<{ result: number }>(
        a2a2ForAgent1.client,
        agent1Card,
        taskId
      );

      if (task.status === 'failed') {
        throw new Error(
          `Task failed: ${task.error?.message || 'Unknown error'}`
        );
      }

      console.log(
        `[Agent 2] Got result from Agent 1: ${JSON.stringify(task.result?.output)}`
      );

      // Validate output from remote agent with Zod schema (runtime safety)
      const outputSchema = z.object({ result: z.number() });
      const validatedOutput = outputSchema.parse(task.result?.output);

      return {
        output: validatedOutput,
        usage: task.result?.usage,
      };
    },
  });

  const server2 = await startServer(8788, app2.fetch.bind(app2));
  console.log(`Agent 2 running at: ${server2.url}`);
  console.log('');

  // ============================================================================
  // STEP 3: Create Agent 3 (Client Agent)
  // ============================================================================
  console.log('STEP 3: Creating Agent 3 (Client Agent)');
  console.log('-'.repeat(80));

  const agent3 = await createAgent({
    name: 'client-agent',
    version: '1.0.0',
    description: 'Client agent that calls facilitator agent',
  })
    .use(a2a())
    .build();

  const a2a3: A2ARuntime | undefined = agent3.a2a;
  if (!a2a3) {
    throw new Error('A2A runtime not available on Agent 3');
  }
  console.log('Agent 3 ready');
  console.log('');

  try {
    // ============================================================================
    // STEP 4: Build Agent Cards
    // ============================================================================
    console.log('STEP 4: Building Agent Cards');
    console.log('-'.repeat(80));

    const a2a1: A2ARuntime | undefined = runtime1.a2a;
    if (!a2a1) {
      throw new Error('A2A runtime not available on Agent 1');
    }

    // Build full manifest from runtime (includes AP2 if payments enabled)
    const manifest1 = runtime1.manifest.build(server1.url);
    const manifest2 = runtime2.manifest.build(server2.url);

    console.log('Agent 1 (Worker) Card:');
    console.log(`  Name: ${manifest1.name}`);
    console.log(`  Description: ${manifest1.description || 'N/A'}`);
    console.log(`  Version: ${manifest1.version}`);
    console.log(`  URL: ${manifest1.url}`);
    console.log(`  Skills: ${manifest1.skills.map(s => s.id).join(', ')}`);
    // Show AP2 extensions if present
    if (manifest1.capabilities?.extensions?.length) {
      const ap2Ext = manifest1.capabilities.extensions.find(
        ext =>
          'uri' in ext && typeof ext.uri === 'string' && ext.uri.includes('ap2')
      );
      if (ap2Ext && 'params' in ap2Ext) {
        const roles = (ap2Ext.params as { roles?: string[] })?.roles || [];
        console.log(`  AP2 Roles: ${roles.join(', ')}`);
      }
    }
    console.log('');

    console.log('Agent 2 (Facilitator) Card:');
    console.log(`  Name: ${manifest2.name}`);
    console.log(`  Description: ${manifest2.description || 'N/A'}`);
    console.log(`  Version: ${manifest2.version}`);
    console.log(`  URL: ${manifest2.url}`);
    console.log(`  Skills: ${manifest2.skills.map(s => s.id).join(', ')}`);
    // Show AP2 extensions if present
    if (manifest2.capabilities?.extensions?.length) {
      const ap2Ext = manifest2.capabilities.extensions.find(
        ext =>
          'uri' in ext && typeof ext.uri === 'string' && ext.uri.includes('ap2')
      );
      if (ap2Ext && 'params' in ap2Ext) {
        const roles = (ap2Ext.params as { roles?: string[] })?.roles || [];
        console.log(`  AP2 Roles: ${roles.join(', ')}`);
      }
    }
    console.log('');

    // ============================================================================
    // STEP 5: Real-World Agent Discovery
    // ============================================================================
    console.log('STEP 5: Real-World Agent Discovery');
    console.log('-'.repeat(80));
    console.log('Demonstrates how an agent discovers and calls another agent:');
    console.log('  1. Fetch agent card from URL');
    console.log('  2. Check capabilities (streaming, payments, etc.)');
    console.log('  3. Find skill by tags (search/discovery)');
    console.log('  4. Call the discovered skill');
    console.log('-'.repeat(80));
    console.log('');

    // 5.1: Fetch agent card from URL (real-world discovery)
    console.log('5.1: Fetching Agent Card from URL');
    const agentUrl = server2.url;
    const discoveredCard = await fetchAgentCard(agentUrl);
    console.log(`  Fetched card from: ${agentUrl}`);
    console.log(`  Agent Name: ${discoveredCard.name}`);
    console.log(
      `  Protocol Version: ${discoveredCard.protocolVersion || '1.0'}`
    );
    console.log(`  Description: ${discoveredCard.description || 'N/A'}`);
    console.log(`  Version: ${discoveredCard.version}`);
    if (discoveredCard.supportedInterfaces?.length) {
      console.log(
        `  Supported Interfaces: ${discoveredCard.supportedInterfaces.map(i => i.protocolBinding).join(', ')}`
      );
    }
    console.log('');

    // 5.2: Check capabilities
    console.log('5.2: Checking Agent Capabilities');
    const supportsStreaming = hasCapability(discoveredCard, 'streaming');
    const supportsPushNotifications = hasCapability(
      discoveredCard,
      'pushNotifications'
    );
    const hasPayments = supportsPayments(discoveredCard);
    console.log(`  Streaming: ${supportsStreaming ? '✓' : '✗'}`);
    console.log(
      `  Push Notifications: ${supportsPushNotifications ? '✓' : '✗'}`
    );
    console.log(`  Payments: ${hasPayments ? '✓' : '✗'}`);
    console.log('');

    // 5.3: Discover skills by tags
    console.log('5.3: Discovering Skills by Tags');
    console.log('  Available skills:');
    discoveredCard.skills?.forEach(skill => {
      console.log(`    - ${skill.id}: ${skill.description || 'N/A'}`);
      if (skill.tags?.length) {
        console.log(`      Tags: ${skill.tags.join(', ')}`);
      }
    });
    console.log('');

    // 5.4: Find and call a skill
    console.log('5.4: Finding Skill and Calling It');
    // Find echo skill (could search by tags like "echo", "text", "utility")
    const echoSkill = findSkill(discoveredCard, 'echo');
    if (!echoSkill) {
      throw new Error('Echo skill not found');
    }
    console.log(`  Found skill: ${echoSkill.id}`);
    console.log(`  Description: ${echoSkill.description || 'N/A'}`);
    if (echoSkill.tags?.length) {
      console.log(`  Tags: ${echoSkill.tags.join(', ')}`);
    }
    console.log('');

    // Use the discovered card for subsequent calls
    const fetchedCard2 = discoveredCard;

    // ============================================================================
    // STEP 6: A2A Composition - Agent 3 -> Agent 2 -> Agent 1
    // ============================================================================
    console.log('STEP 6: A2A Composition (Agent 3 -> Agent 2 -> Agent 1)');
    console.log('-'.repeat(80));
    console.log('This demonstrates the facilitator pattern:');
    console.log('  - Agent 3 calls Agent 2 (facilitator)');
    console.log('  - Agent 2 receives call, then calls Agent 1 (worker)');
    console.log("  - Agent 2 returns Agent 1's result to Agent 3");
    console.log('-'.repeat(80));
    console.log('');

    // Agent 3 calls Agent 2's echo entrypoint using task-based operations
    // Agent 2 receives it and calls Agent 1 internally, then returns result
    console.log('6.1: Agent 3 -> Agent 2 -> Agent 1 (echo)');
    console.log(
      '  Flow: Agent 3 creates task on Agent 2, Agent 2 creates task on Agent 1, results flow back'
    );

    // Create task on Agent 2 (returns immediately with taskId)
    const echoTaskResponse = await a2a3.client.sendMessage(
      fetchedCard2,
      'echo',
      {
        text: 'Hello from Agent 3 through Agent 2!',
      }
    );
    console.log(
      `  Task created: ${echoTaskResponse.taskId} (status: ${echoTaskResponse.status})`
    );

    const echoTask = await waitForTask(
      a2a3.client,
      fetchedCard2,
      echoTaskResponse.taskId
    );

    if (echoTask.status === 'failed') {
      throw new Error(
        `Task failed: ${echoTask.error?.message || 'Unknown error'}`
      );
    }

    console.log(
      `  Final result at Agent 3: ${JSON.stringify(echoTask.result?.output)}`
    );
    console.log(`  Usage: ${JSON.stringify(echoTask.result?.usage)}`);
    console.log('');

    console.log('6.2: Agent 3 -> Agent 2 -> Agent 1 (process)');
    console.log(
      '  Flow: Agent 3 creates task on Agent 2, Agent 2 creates task on Agent 1, results flow back'
    );

    const processTaskResponse = await a2a3.client.sendMessage(
      fetchedCard2,
      'process',
      {
        data: [10, 20, 30],
      }
    );
    console.log(
      `  Task created: ${processTaskResponse.taskId} (status: ${processTaskResponse.status})`
    );

    const processTask = await waitForTask(
      a2a3.client,
      fetchedCard2,
      processTaskResponse.taskId
    );

    if (processTask.status === 'failed') {
      throw new Error(
        `Task failed: ${processTask.error?.message || 'Unknown error'}`
      );
    }

    console.log(
      `  Final result at Agent 3: ${JSON.stringify(processTask.result?.output)}`
    );
    console.log(
      `  Sum: ${(processTask.result?.output as { result: number })?.result}`
    );
    console.log('');

    // ============================================================================
    // STEP 7: Multi-Turn Conversations with contextId
    // ============================================================================
    console.log('STEP 7: Multi-Turn Conversations with contextId');
    console.log('-'.repeat(80));
    console.log('Demonstrates contextId for tracking multi-turn conversations');
    console.log('');

    const contextId = `conversation-${Date.now()}`;

    console.log('7.1: Create first message in conversation');
    const turn1TaskResponse = await a2a3.client.sendMessage(
      fetchedCard2,
      'echo',
      {
        text: 'First message in conversation',
      },
      undefined,
      { contextId }
    );
    console.log(
      `  Task created: ${turn1TaskResponse.taskId} (contextId: ${contextId})`
    );

    const turn1Task = await waitForTask(
      a2a3.client,
      fetchedCard2,
      turn1TaskResponse.taskId
    );
    console.log(`  Response: ${JSON.stringify(turn1Task.result?.output)}`);
    console.log('');

    console.log('7.2: Create second message in same conversation');
    const turn2TaskResponse = await a2a3.client.sendMessage(
      fetchedCard2,
      'echo',
      {
        text: 'Second message in conversation',
      },
      undefined,
      { contextId }
    );
    console.log(
      `  Task created: ${turn2TaskResponse.taskId} (contextId: ${contextId})`
    );

    const turn2Task = await waitForTask(
      a2a3.client,
      fetchedCard2,
      turn2TaskResponse.taskId
    );
    console.log(`  Response: ${JSON.stringify(turn2Task.result?.output)}`);
    console.log('');

    console.log('7.3: List all tasks in conversation');
    const conversationTasks = await a2a3.client.listTasks(fetchedCard2, {
      contextId,
    });
    console.log(
      `  Found ${conversationTasks.tasks.length} tasks in conversation`
    );
    conversationTasks.tasks.forEach((task, idx) => {
      console.log(
        `    ${idx + 1}. Task ${task.taskId.substring(0, 8)}... (${task.status})`
      );
    });
    console.log('');

    // ============================================================================
    // STEP 8: Task Cancellation
    // ============================================================================
    console.log('STEP 8: Task Cancellation');
    console.log('-'.repeat(80));
    console.log('Demonstrates cancelling a running task');
    console.log('');

    console.log('8.1: Create a long-running task (will be cancelled)');
    console.log(
      '  Note: For demonstration, we create a task but cancel immediately'
    );
    console.log(
      '  In practice, cancellation works on tasks that are still running'
    );

    const slowTaskResponse = await a2a3.client.sendMessage(
      fetchedCard2,
      'process',
      {
        data: Array.from({ length: 1000 }, (_, i) => i),
      }
    );
    console.log(
      `  Task created: ${slowTaskResponse.taskId} (status: ${slowTaskResponse.status})`
    );

    await new Promise(resolve => setTimeout(resolve, 10));

    console.log('8.2: Attempt to cancel the task');
    try {
      const cancelledTask = await a2a3.client.cancelTask(
        fetchedCard2,
        slowTaskResponse.taskId
      );
      console.log(
        `  Task cancelled: ${cancelledTask.taskId} (status: ${cancelledTask.status})`
      );
    } catch {
      const task = await a2a3.client.getTask(
        fetchedCard2,
        slowTaskResponse.taskId
      );
      console.log(
        `  Task already completed (status: ${task.status}) - cancellation only works on running tasks`
      );
      console.log(`  This demonstrates proper error handling for cancellation`);
    }
    console.log('');

    // ============================================================================
    // SUMMARY
    // ============================================================================
    console.log('='.repeat(80));
    console.log('A2A Composition Test Summary');
    console.log('='.repeat(80));
    console.log('');
    console.log('Architecture Demonstrated:');
    console.log('  ✓ Agent 1 (Worker): Does the actual work');
    console.log('  ✓ Agent 2 (Facilitator): Acts as both server AND client');
    console.log('    - Server: Receives calls from Agent 3');
    console.log('    - Client: Calls Agent 1 to perform work');
    console.log('  ✓ Agent 3 (Client): Initiates requests');
    console.log('');
    console.log('A2A Functionality Tested:');
    console.log('  ✓ Build Agent Card');
    console.log('  ✓ Fetch Agent Card');
    console.log('  ✓ Task-based operations (create task, poll status)');
    console.log(
      '  ✓ Agent composition via tasks (agent calling agent calling agent)'
    );
    console.log('  ✓ Multi-turn conversations with contextId');
    console.log('  ✓ List tasks filtered by contextId');
    console.log('  ✓ Cancel running tasks');
    console.log('');
    console.log(
      'This demonstrates that agents can act as both clients and servers,'
    );
    console.log('enabling complex agent compositions and supply chains!');
    console.log('='.repeat(80));
  } finally {
    // Cleanup
    server1.close();
    server2.close();
    console.log('\nServers stopped');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  if (typeof process !== 'undefined') process.exit(1);
});
