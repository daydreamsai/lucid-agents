import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '../app';
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

describe('@lucid-agents/express', () => {
  it('creates an Express app and registers entrypoints', async () => {
    const agent = createAgent({
      name: 'express-agent',
      version: '1.0.0',
      description: 'Test agent',
    })
      .use(http());
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
});
