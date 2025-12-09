import { describe, it, expect, beforeEach } from 'bun:test';
import { createHonoRuntime } from '../app';
import { createMemoryAgentStore } from '../store/memory';
import type { AgentStore } from '../store/types';

describe('Debug OpenAPI', () => {
  // TODO: Fix zod 4 compatibility with @hono/zod-openapi
  it.skip('debug /doc endpoint', async () => {
    const store = createMemoryAgentStore();
    const app = createHonoRuntime({ store });

    const res = await app.request('/doc');
    console.log('Status:', res.status);

    if (res.status !== 200) {
      const text = await res.text();
      console.log('Error response:', text);
    } else {
      const json = await res.json();
      console.log('OpenAPI version:', json.openapi);
    }

    expect(res.status).toBe(200);
  });
});
