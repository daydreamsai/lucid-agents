import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { ap2, AP2_EXTENSION_URI } from '@lucid-agents/ap2';
import { createAgentApp } from '@lucid-agents/hono';
import { describe, expect, it } from 'bun:test';

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
    const agent = await createAgent(meta)
      .use(http())
      .use(
        ap2({ roles: ['shopper'], description: 'Supports AP2 shopper role' })
      )
      .build();
    const { app } = await createAgentApp(agent);
    const card = await fetchCard(app);
    const extensions = card.capabilities?.extensions;
    expect(Array.isArray(extensions)).toBe(true);
    const ap2Extension = extensions.find(
      (ext: any) => ext?.uri === AP2_EXTENSION_URI
    );
    expect(ap2Extension).toBeDefined();
    expect(ap2Extension.description).toBe('Supports AP2 shopper role');
    expect(ap2Extension.required).toBe(false);
    expect(ap2Extension.params?.roles).toEqual(['shopper']);
  });

  it('requires explicit AP2 configuration - does not auto-detect payments', async () => {
    const { payments } = await import('@lucid-agents/payments');
    const agent = await createAgent(meta)
      .use(http())
      .use(
        payments({
          config: {
            payTo: '0xabc000000000000000000000000000000000c0de',
            facilitatorUrl: 'https://facilitator.local' as any,
            network: 'base-sepolia' as any,
            defaultPrice: '$0.01',
          },
        })
      )
      .build();
    // AP2 not explicitly added - should not appear in manifest
    const { app } = await createAgentApp(agent);
    const card = await fetchCard(app);
    const extensions = card.capabilities?.extensions;
    // AP2 extension should not be present without explicit configuration
    if (Array.isArray(extensions)) {
      const ap2Extension = extensions.find(
        (ext: any) => ext?.uri === AP2_EXTENSION_URI
      );
      expect(ap2Extension).toBeUndefined();
    } else {
      // extensions might be undefined/false, which is fine
      expect(extensions).toBeFalsy();
    }
  });

  it('respects explicit required flag override', async () => {
    const agent = await createAgent(meta)
      .use(http())
      .use(ap2({ roles: ['merchant', 'shopper'], required: false }))
      .build();
    const { app } = await createAgentApp(agent);
    const card = await fetchCard(app);
    const extensions = card.capabilities?.extensions;
    const ap2Extension = extensions.find(
      (ext: any) => ext?.uri === AP2_EXTENSION_URI
    );
    expect(ap2Extension.required).toBe(false);
    expect(ap2Extension.params?.roles).toEqual(['merchant', 'shopper']);
  });
});
