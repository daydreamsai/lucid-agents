import { a2a, fetchAgentCard, findSkill, waitForTask } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';

/**
 * Creates a minimal client agent with the HTTP transport and A2A extension.
 * Demonstrates that an agent does not need all capabilities — it can be
 * purpose-built for a single role (here: calling other agents via A2A).
 * The http() extension is required for createAgentApp() to serve its own card.
 */
export async function createClientAgent() {
  return createAgent({
    name: 'kitchen-sink-client',
    version: '1.0.0',
    description: 'Client agent that demonstrates A2A calls to the kitchen-sink',
  })
    .use(http())
    .use(a2a())
    .build();
}

/**
 * One-shot A2A demo: discovers the kitchen-sink, calls its echo entrypoint,
 * and logs the result. Called from index.ts on startup.
 */
export async function runA2ADemo(kitchenSinkUrl: string) {
  const agent = await createClientAgent();
  const a2aRuntime = agent.a2a;
  if (!a2aRuntime) throw new Error('A2A runtime not available on client agent');

  console.log('[client] Fetching kitchen-sink agent card...');
  const card = await fetchAgentCard(kitchenSinkUrl);
  console.log(`[client] Found: ${card.name} v${card.version}`);

  const echoSkill = findSkill(card, 'echo');
  if (!echoSkill)
    throw new Error('echo skill not found on kitchen-sink agent card');
  console.log(`[client] Discovered skill: ${echoSkill.id}`);

  console.log('[client] Sending A2A task...');
  const { taskId } = await a2aRuntime.client.sendMessage(card, 'echo', {
    text: 'Hello from the client agent!',
  });

  const task = await waitForTask(a2aRuntime.client, card, taskId);
  if (task.status === 'failed') {
    throw new Error(
      `A2A task failed: ${String(task.error?.message ?? 'unknown')}`
    );
  }

  const output = task.result?.output as
    | { text: string; timestamp: string }
    | undefined;
  console.log(`[client] Result: ${JSON.stringify(output)}`);
  return output;
}
