import { createApp } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '../app';
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

describe('@lucid-agents/express', () => {
  it('creates an Express app and registers entrypoints', () => {
    const runtime = createApp({
      name: 'express-agent',
      version: '1.0.0',
      description: 'Test agent',
    })
      .use(http())
      .build();
    const { app, addEntrypoint } = createAgentApp(runtime);

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
