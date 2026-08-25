import { createAgent } from '@lucid-agents/core';
import { describe, expect, it } from 'bun:test';
import { privateKeyToAccount } from 'viem/accounts';

import { taskmarket } from '../extension';

const account = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);

describe('taskmarket() example composition', () => {
  it('composes through createAgent without external services', async () => {
    const agent = await createAgent({
      name: 'taskmarket-requester',
      version: '1.0.0',
      description: 'Smoke test for the taskmarket requester extension',
    })
      .use(taskmarket({ account }))
      .build();

    expect(agent.taskmarket).toBeDefined();
    const preview = agent.taskmarket.previewCreate({
      description: 'Summarize the weekly onchain report',
      rewardUsdc: '1.5',
      durationHours: 24,
      tags: ['research'],
      deliverables: 'One markdown file, 400-800 words',
    });
    expect(preview.description).toBe('Summarize the weekly onchain report');
    expect(preview.deliverables).toBe('One markdown file, 400-800 words');
    const authorization = agent.taskmarket.confirm(preview);
    expect(authorization.confirmed).toBe(true);
    expect(authorization.previewId).toBe(preview.previewId);
    expect(authorization.token.length).toBeGreaterThan(0);
  });
});
