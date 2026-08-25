import { createTaskmarketClient } from '../src/index';
import type { TaskmarketAccount } from '../src/index';

/**
 * Documented requester loop. Replace `account` with a wallet connector
 * account from `@lucid-agents/wallet`. This file is a type-checked example,
 * not a live payment.
 */
export async function exampleRequesterFlow(account: TaskmarketAccount) {
  const client = createTaskmarketClient({ account });
  const preview = client.previewCreate({
    description: 'Summarize the weekly onchain report',
    rewardUsdc: '1.5',
    durationHours: 24,
    tags: ['research'],
    deliverables: 'One markdown file, 400-800 words',
  });
  return {
    description: preview.description,
    rewardUsdc: preview.rewardUsdc,
    deadlineIso: preview.deadlineIso,
    deliverables: preview.deliverables,
    network: preview.network,
    maxSpendUsdc: preview.maxSpendUsdc,
  };
}
