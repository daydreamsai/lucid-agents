import { createAgentApp } from '@lucid-agents/hono';
import { describe, expect, it } from 'bun:test';
import { createDataFreshnessAgent } from '../agent';
import { registerEntrypoints } from '../entrypoints';

describe('freshness entrypoint', () => {
  it('should return a 402 for a priced endpoint without payment', async () => {
    const agent = await createDataFreshnessAgent();
    const { app, addEntrypoint } = await createAgentApp(agent);
    registerEntrypoints(addEntrypoint);

    const res = await app.request('/entrypoints/freshness/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { url: 'https://example.com' } }),
    });

    expect(res.status).toBe(402);
  });
});
