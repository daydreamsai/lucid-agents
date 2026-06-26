import { createAgentApp } from '@lucid-agents/hono';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createSanctionsScreeningAgent } from '../agent';
import { registerEntrypoints } from '../entrypoints';

describe('screen entrypoint', () => {
  const originalAddress = process.env.PAYMENTS_RECEIVABLE_ADDRESS;
  const originalUrl = process.env.FACILITATOR_URL;

  afterAll(() => {
    if (originalAddress !== undefined) process.env.PAYMENTS_RECEIVABLE_ADDRESS = originalAddress;
    if (originalUrl !== undefined) process.env.FACILITATOR_URL = originalUrl;
  });

  beforeAll(async () => {
    delete process.env.PAYMENTS_RECEIVABLE_ADDRESS;
    delete process.env.FACILITATOR_URL;
    
    const agent = await createSanctionsScreeningAgent();
    const agentApp = await createAgentApp(agent);
    registerEntrypoints(agentApp.addEntrypoint);
    app = agentApp.app;
  });

  let app: Awaited<ReturnType<typeof createAgentApp>>['app'];

  // Helper to match the deterministic hash logic in the entrypoint
  function getDeterministicResult(entity: string) {
    let hash = 0;
    for (let i = 0; i < entity.length; i++) {
      hash = (hash << 5) - hash + entity.charCodeAt(i);
      hash |= 0;
    }
    const isSanctioned = (Math.abs(hash) % 100) < 5;
    const isPEP = !isSanctioned && (Math.abs(hash) % 10) === 0;
    return { isSanctioned, isPEP };
  }



  it('should return a clean screening result for a safe entity', async () => {
    const res = await app.request('/entrypoints/screen/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { name: 'Alice Smith' } }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    
    const expected = getDeterministicResult('Alice Smith');
    expect(json.output.isSanctioned).toBe(expected.isSanctioned);
    expect(json.output.isPEP).toBe(expected.isPEP);
  });

  it('should return a sanctioned result for a known bad actor', async () => {
    // Find an input that is guaranteed to produce a sanctioned result
    let badActor = 'test';
    let i = 0;
    while(getDeterministicResult(badActor).isSanctioned === false && i < 1000) {
      badActor = `test${i++}`;
    }
    if (!getDeterministicResult(badActor).isSanctioned) {
      throw new Error('Could not find a deterministically-sanctioned test fixture within 1000 iterations');
    }

    const res = await app.request('/entrypoints/screen/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { name: badActor } }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.output.isSanctioned).toBe(true);
    expect(json.output.matchConfidence).toBeGreaterThan(0);
  });

  it('should throw an error if no input is provided', async () => {
    const res = await app.request('/entrypoints/screen/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    });
    expect(res.status).toBe(500);
  });
});
