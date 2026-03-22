import { createAgentApp } from '@lucid-agents/hono';
import { describe, expect, it } from 'bun:test';
import { createGeoDemandAgent } from '../agent';
import { registerEntrypoints } from '../entrypoints';

describe('pulse entrypoint', () => {
  it('should return a 402 for a priced endpoint without payment', async () => {
    const agent = await createGeoDemandAgent();
    const { app, addEntrypoint } = await createAgentApp(agent);
    registerEntrypoints(addEntrypoint);

    const res = await app.request('/entrypoints/pulse/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { latitude: 37.77, longitude: -122.41 } }),
    });

    expect(res.status).toBe(402);
  });
});
