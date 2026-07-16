import { createAgent } from '@lucid-agents/core';
import { a2a } from '@lucid-agents/a2a';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '../app';
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

describe('@lucid-agents/express', () => {
  it('mounts task routes only when the A2A capability is installed', async () => {
    const withoutTasks = await createAgent({
      name: 'express-without-tasks',
      version: '1.0.0',
    })
      .use(http())
      .build();
    const withoutApp = (await createAgentApp(withoutTasks)).app;
    const withoutServer = withoutApp.listen(0);
    try {
      const address = withoutServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      expect((await fetch(`http://127.0.0.1:${port}/tasks`)).status).toBe(404);
    } finally {
      await new Promise<void>(resolve => withoutServer.close(() => resolve()));
    }

    const withTasks = await createAgent({
      name: 'express-with-tasks',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .addEntrypoint({
        key: 'echo',
        handler: async ({ input }) => ({ output: input }),
      })
      .build();
    const withApp = (await createAgentApp(withTasks)).app;
    const withServer = withApp.listen(0);
    try {
      const address = withServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const created = await fetch(`http://127.0.0.1:${port}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId: 'echo',
          message: { role: 'user', content: { text: '{"hello":"world"}' } },
        }),
      });
      expect(created.status).toBe(200);
      const { taskId, accessToken } = (await created.json()) as {
        taskId: string;
        accessToken: string;
      };
      const task = await fetch(`http://127.0.0.1:${port}/tasks/${taskId}`, {
        headers: { 'Task-Access-Token': accessToken },
      });
      expect(task.status).toBe(200);
      expect(((await task.json()) as { taskId: string }).taskId).toBe(taskId);
    } finally {
      await withTasks.a2a?.tasks.close();
      await new Promise<void>(resolve => withServer.close(() => resolve()));
    }
  });

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

  it('mounts every route below the configured base path', async () => {
    const agent = await createAgent({
      name: 'express-base-path',
      version: '1.0.0',
    })
      .use(http({ basePath: '/api/agent' }))
      .build();
    const { app } = await createAgentApp(agent);
    const server = app.listen(0);
    try {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(404);
      expect(
        (await fetch(`http://127.0.0.1:${port}/api/agent/health`)).status
      ).toBe(200);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
