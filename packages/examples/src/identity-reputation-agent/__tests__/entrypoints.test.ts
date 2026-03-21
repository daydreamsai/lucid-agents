import { createAgentApp } from '@lucid-agents/hono';
import { describe, expect, it } from 'bun:test';
import { createIdentityReputationAgent } from '../agent';
import { registerEntrypoints } from '../entrypoints';

describe('reputation entrypoint', () => {
  it('should return a 402 for a priced endpoint without payment', async () => {
    const agent = await createIdentityReputationAgent();
    const { app, addEntrypoint } = await createAgentApp(agent);
    registerEntrypoints(addEntrypoint);

    const res = await app.request('/entrypoints/reputation/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { identity: 'my-agent.example.com' } }),
    });

    expect(res.status).toBe(402);
  });
});
