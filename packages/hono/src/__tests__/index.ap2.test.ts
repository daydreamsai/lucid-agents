import { createAgentApp } from '@lucid-agents/hono';
import { describe, expect, it } from 'bun:test';

import { AP2_EXTENSION_URI } from '@lucid-agents/core';

describe('createAgentApp AP2 extension', () => {
  const meta = {
    name: 'Test Agent',
    version: '0.1.0',
    description: 'Test agent for AP2',
  };

  const fetchCard = async (app: ReturnType<typeof createAgentApp>['app']) => {
    const res = await app.request('http://agent/.well-known/agent-card.json');
    expect(res.status).toBe(200);
    return (await res.json()) as any;
  };

  it('emits AP2 extension when explicit config provided', async () => {
    const { app } = createAgentApp(meta, {
      ap2: { roles: ['shopper'], description: 'Supports AP2 shopper role' },
    });
    const card = await fetchCard(app);
    const extensions = card.capabilities?.extensions;
    expect(Array.isArray(extensions)).toBe(true);
    const ap2 = extensions.find((ext: any) => ext?.uri === AP2_EXTENSION_URI);
    expect(ap2).toBeDefined();
    expect(ap2.description).toBe('Supports AP2 shopper role');
    expect(ap2.required).toBe(false);
    expect(ap2.params?.roles).toEqual(['shopper']);
  });

  it('defaults to merchant role when payments enabled without explicit config', async () => {
    const { app } = createAgentApp(meta, {
      payments: {
        payTo: '0xabc000000000000000000000000000000000c0de',
        facilitatorUrl: 'https://facilitator.local' as any,
        network: 'base-sepolia' as any,
        defaultPrice: '$0.01',
      },
    });
    const card = await fetchCard(app);
    const extensions = card.capabilities?.extensions;
    expect(Array.isArray(extensions)).toBe(true);
    const ap2 = extensions.find((ext: any) => ext?.uri === AP2_EXTENSION_URI);
    expect(ap2).toBeDefined();
    expect(ap2.required).toBe(true);
    expect(ap2.params?.roles).toEqual(['merchant']);
  });

  it('respects explicit required flag override', async () => {
    const { app } = createAgentApp(meta, {
      ap2: { roles: ['merchant', 'shopper'], required: false },
    });
    const card = await fetchCard(app);
    const extensions = card.capabilities?.extensions;
    const ap2 = extensions.find((ext: any) => ext?.uri === AP2_EXTENSION_URI);
    expect(ap2.required).toBe(false);
    expect(ap2.params?.roles).toEqual(['merchant', 'shopper']);
  });
});
