import { describe, expect, it } from 'bun:test';

import { createKitchenSinkAgent } from '../agent';

describe('createKitchenSinkAgent', () => {
  it('always-wired extensions (a2a, analytics, payments, scheduler, ap2)', async () => {
    const agent = await createKitchenSinkAgent();

    expect(agent.a2a).toBeDefined();
    expect(agent.analytics).toBeDefined();
    expect(agent.payments).toBeDefined();
    expect(agent.scheduler).toBeDefined();
    expect(agent.ap2).toBeDefined();
  });

  it('does not include wallet/identity when env vars are absent', async () => {
    const saved = {
      type: process.env.AGENT_WALLET_TYPE,
      key: process.env.AGENT_WALLET_PRIVATE_KEY,
    };
    delete process.env.AGENT_WALLET_TYPE;
    delete process.env.AGENT_WALLET_PRIVATE_KEY;

    try {
      const agent = await createKitchenSinkAgent();
      expect(agent.wallets).toBeUndefined();
      expect(agent.identity).toBeUndefined();
    } finally {
      if (saved.type) process.env.AGENT_WALLET_TYPE = saved.type;
      if (saved.key) process.env.AGENT_WALLET_PRIVATE_KEY = saved.key;
    }
  });
});
