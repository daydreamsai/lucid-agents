import { createAgentApp } from '@lucid-agents/hono';
import { describe, expect, it } from 'bun:test';
import { createSanctionsScreeningAgent } from '../agent';
import { registerEntrypoints } from '../entrypoints';

describe('screen entrypoint', () => {
  let app: ReturnType<typeof createAgentApp>['app'];

  it('should return a clean screening result for a safe entity', async () => {
    const agent = await createSanctionsScreeningAgent();
    const agentApp = await createAgentApp(agent);
    registerEntrypoints(agentApp.addEntrypoint);
    app = agentApp.app;

    const res = await app.request('/entrypoints/screen/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { name: 'Alice Smith' } }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.output.isSanctioned).toBe(false);
    expect(json.output.isPEP).toBe(false);
  });

  it('should return a sanctioned result for a known bad actor', async () => {
    // Note: The logic is deterministic, so we find a name that hashes to a sanctioned result
    const agent = await createSanctionsScreeningAgent();
    const agentApp = await createAgentApp(agent);
    registerEntrypoints(agentApp.addEntrypoint);
    app = agentApp.app;

    const res = await app.request('/entrypoints/screen/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { name: 'badactor' } }), // This name will hash to a sanctioned result
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.output.isSanctioned).toBe(true);
    expect(json.output.matchConfidence).toBeGreaterThan(0);
  });
});
