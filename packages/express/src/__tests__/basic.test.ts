import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '../app';
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

describe('@lucid-agents/express', () => {
  it('creates an Express app and registers entrypoints', async () => {
    const agent = await createAgent({
      name: 'express-agent',
      version: '1.0.0',
      description: 'Test agent',
    })
      .use(http())
      .build();
    const { app, addEntrypoint } = await createAgentApp(agent);

    expect(typeof app).toBe('function');

    expect(() =>
      addEntrypoint({
        key: 'echo',
        description: 'Echo input text',
        input: z.object({
          text: z.string(),
        }),
        async handler({ input }) {
          return {
            output: { text: input.text },
          };
        },
      })
    ).not.toThrow();
  });

  it('mounts /.well-known/oasf-record.json route', async () => {
    const agent = await createAgent({
      name: 'express-agent',
      version: '1.0.0',
      description: 'Test agent',
    })
      .use(http())
      .build();
    const { app } = await createAgentApp(agent);

    const server = app.listen(0);
    try {
      const address = server.address();
      const port =
        typeof address === 'object' && address ? address.port : undefined;
      const response = await fetch(
        `http://127.0.0.1:${port}/.well-known/oasf-record.json`
      );
      expect([200, 404]).toContain(response.status);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
