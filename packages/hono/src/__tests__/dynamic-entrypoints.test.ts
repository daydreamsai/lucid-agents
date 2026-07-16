import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { describe, expect, it } from 'bun:test';

import { createAgentApp } from '../app';

describe('dynamic entrypoint registration', () => {
  it('does not expose task routes without the A2A extension', async () => {
    const runtime = await createAgent({
      name: 'no-task-capability',
      version: '1.0.0',
    })
      .use(http())
      .build();
    const { app } = await createAgentApp(runtime);

    const response = await app.request('/tasks');
    const card = await (
      await app.request('/.well-known/agent-card.json')
    ).json();

    expect(response.status).toBe(404);
    expect(card.capabilities.stateTransitionHistory).toBe(false);
  });

  it('serves entrypoints added through the runtime after app creation', async () => {
    const runtime = await createAgent({ name: 'dynamic', version: '1.0.0' })
      .use(http())
      .build();
    const { app } = await createAgentApp(runtime);

    runtime.entrypoints.add({
      key: 'late',
      handler: async () => ({ output: { registered: true } }),
    });

    const response = await app.request(
      'http://localhost/entrypoints/late/invoke',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      }
    );
    expect(response.status).toBe(200);
  });

  it('runs extension lifecycle hooks through the single runtime registry', async () => {
    const runtime = await createAgent({
      name: 'dynamic-core-registration',
      version: '1.0.0',
    })
      .use(http())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
          },
        })
      )
      .build();
    const { app } = await createAgentApp(runtime);

    runtime.entrypoints.add({
      key: 'late-paid',
      price: '0.001',
      handler: async () => ({ output: { shouldNotRun: true } }),
    });
    expect(runtime.payments?.isActive).toBe(true);

    const response = await app.request(
      'http://localhost/entrypoints/late-paid/invoke',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      }
    );
    expect(response.status).toBe(503);
  });

  it('mounts every route below the configured base path', async () => {
    const runtime = await createAgent({
      name: 'hono-base-path',
      version: '1.0.0',
    })
      .use(http({ basePath: '/api/agent' }))
      .build();
    const { app } = await createAgentApp(runtime);

    expect((await app.request('/health')).status).toBe(404);
    expect((await app.request('/api/agent/health')).status).toBe(200);
  });
});
