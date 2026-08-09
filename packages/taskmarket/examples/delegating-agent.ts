/**
 * Example: Using the Taskmarket extension within a Lucid agent.
 *
 * This demonstrates the core delegation flow:
 * 1. Browse available Taskmarket tasks
 * 2. Inspect a task to determine if the agent can do it
 * 3. Claim the task
 * 4. Submit work upon completion
 */

import { taskmarket, type TaskmarketRuntime } from '@lucid-agents/taskmarket';
import type { Extension } from './types';

// The extension is registered during agent build:
//
//   const agent = createAgent({ name: 'delegator', version: '1.0.0' })
//     .use(identity({ trust }))
//     .use(payments({ config: paymentConfig }))
//     .use(taskmarket({ config: { apiKey: process.env.TASKMARKET_API_KEY } }))
//     .build();
//
// Access it via agent.taskmarket

export async function browseAndClaim(
  tm: TaskmarketRuntime,
  workerAddress: string,
): Promise<string | null> {
  // Find open bounty tasks rewarding 5+ USDC, expiring in 48+ hours
  const tasks = await tm.listTasks({
    status: 'open',
    mode: 'bounty',
    rewardMin: 5,
    deadlineHours: 48,
    limit: 10,
  });

  if (tasks.length === 0) {
    console.log('No matching tasks found.');
    return null;
  }

  // Pick the highest-reward task
  const best = tasks.reduce((top, t) =>
    t.rewardUsdc > top.rewardUsdc ? t : top,
  );

  console.log(`Best task: ${best.title} (${best.rewardUsdc} USDC)`);

  // Inspect full details
  const details = await tm.getTask(best.id);
  console.log(`Description: ${details.fullDescription.slice(0, 200)}...`);
  console.log(`Submission window open: ${details.submissionWindowOpen}`);

  if (!details.submissionWindowOpen) {
    console.log('Submission window is closed, skipping.');
    return null;
  }

  // Claim the task if it's a claim-mode task
  if (details.mode === 'claim') {
    const result = await tm.claimTask(best.id);
    if (result.ok) {
      console.log(`Claimed task ${best.id}`);
      return best.id;
    } else {
      console.error(`Failed to claim: ${result.error}`);
      return null;
    }
  }

  return best.id;
}

export async function completeAndSubmit(
  tm: TaskmarketRuntime,
  taskId: string,
  workerAddress: string,
): Promise<void> {
  // ... do the work ...
  const workContent = Buffer.from('Hello from the agent!').toString('base64');

  const result = await tm.submitWork({
    taskId,
    fileName: 'result.txt',
    mimeType: 'text/plain',
    content: workContent,
    role: 'final',
  });

  if (result.ok) {
    console.log('Work submitted successfully!');
  } else {
    console.error(`Submission failed: ${result.error}`);
  }
}

export async function createDelegationTask(
  tm: TaskmarketRuntime,
): Promise<void> {
  // When the agent has work it can't do itself, create a Taskmarket task
  // for a human or specialized worker to handle
  const task = await tm.createTask({
    description:
      'Create a high-quality logo design for a Web3 agent project. Must use ' +
      'modern gradients, represent AI/digital themes, and be delivered as ' +
      'SVG and PNG.',
    rewardUsdc: 50,
    durationHours: 72,
    mode: 'bounty',
    tags: ['design', 'web3', 'logo', 'ui'],
  });

  console.log(`Created delegation task: ${task.taskUrl}`);
}
