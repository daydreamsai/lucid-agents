import { a2a } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp as createExpressApp } from '@lucid-agents/express';
import { createAgentApp as createHonoApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { createTanStackRuntime } from '@lucid-agents/tanstack';
import type { A2ARuntime } from '@lucid-agents/types/a2a';
import type { AgentRuntime } from '@lucid-agents/types/core';
import type {
  AgentHttpRoute,
  AgentHttpRuntime,
} from '@lucid-agents/types/http';
import { describe, expect, it } from 'bun:test';

type ContractRuntime = AgentRuntime<{
  http: AgentHttpRuntime;
  a2a: A2ARuntime;
}>;

type AdapterHarness = {
  request(path: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
};

async function createContractRuntime(name: string): Promise<ContractRuntime> {
  return createAgent({ name, version: '1.0.0' })
    .use(http({ basePath: '/api/agent' }))
    .use(a2a())
    .addEntrypoint({
      key: 'echo',
      handler: async ({ input }) => ({ output: input }),
    })
    .addEntrypoint({
      key: 'stream',
      stream: async ({ input }, emit) => {
        await emit({ kind: 'delta', delta: String(input) });
        return { output: input };
      },
    })
    .addEntrypoint({
      key: 'slow',
      handler: async ({ input }) => {
        await Bun.sleep(100);
        return { output: input };
      },
    })
    .build();
}

function matchRoute(
  routes: readonly AgentHttpRoute[],
  method: string,
  pathname: string
): { route: AgentHttpRoute; params: Record<string, string> } | undefined {
  for (const route of routes) {
    if (route.method !== method) continue;
    const expected = route.path.split('/');
    const actual = pathname.split('/');
    if (expected.length !== actual.length) continue;
    const params: Record<string, string> = {};
    let matches = true;
    for (let index = 0; index < expected.length; index += 1) {
      const segment = expected[index]!;
      if (segment.startsWith(':')) {
        params[segment.slice(1)] = decodeURIComponent(actual[index]!);
      } else if (segment !== actual[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return { route, params };
  }
  return undefined;
}

async function createHonoHarness(): Promise<AdapterHarness> {
  const runtime = await createContractRuntime('hono-contract');
  const { app } = await createHonoApp(runtime);
  return {
    request: (path, init) =>
      Promise.resolve(app.request(`http://agent.test${path}`, init)),
    close: async () => runtime.close(),
  };
}

async function createExpressHarness(): Promise<AdapterHarness> {
  const runtime = await createContractRuntime('express-contract');
  const { app } = await createExpressApp(runtime);
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Express did not bind an ephemeral TCP port');
  }
  return {
    request: (path, init) =>
      fetch(`http://127.0.0.1:${address.port}${path}`, init),
    close: async () => {
      await runtime.close();
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    },
  };
}

async function createTanStackHarness(): Promise<AdapterHarness> {
  const runtime = await createContractRuntime('tanstack-contract');
  const tanstack = await createTanStackRuntime(runtime);
  return {
    request: async (path, init) => {
      const request = new Request(`http://agent.test${path}`, init);
      const matched = matchRoute(
        tanstack.routes,
        request.method.toUpperCase(),
        new URL(request.url).pathname
      );
      return matched
        ? matched.route.handle(request, matched.params)
        : new Response('Not Found', { status: 404 });
    },
    close: async () => runtime.close(),
  };
}

const adapters = [
  ['Hono', createHonoHarness],
  ['Express', createExpressHarness],
  ['TanStack', createTanStackHarness],
] as const;

describe.each(adapters)('%s adapter contract', (_name, createHarness) => {
  it('binds every canonical route and preserves success and error behavior', async () => {
    const harness = await createHarness();
    try {
      expect((await harness.request('/health')).status).toBe(404);

      const health = await harness.request('/api/agent/health');
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ ok: true, version: '1.0.0' });

      const card = await harness.request(
        '/api/agent/.well-known/agent-card.json'
      );
      expect(card.status).toBe(200);
      const cardPayload = (await card.json()) as {
        name: string;
        url: string;
        skills: Array<{ id: string }>;
      };
      expect(new URL(cardPayload.url).pathname).toBe('/api/agent/');
      expect(cardPayload.skills).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'echo' })])
      );

      const legacyCard = await harness.request(
        '/api/agent/.well-known/agent.json'
      );
      expect(legacyCard.status).toBe(200);
      expect(await legacyCard.json()).toMatchObject({ name: cardPayload.name });

      const entrypoints = await harness.request('/api/agent/entrypoints');
      expect(entrypoints.status).toBe(200);
      expect(await entrypoints.json()).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({ key: 'echo' }),
          expect.objectContaining({ key: 'stream' }),
        ]),
      });

      const landing = await harness.request('/api/agent/');
      expect(landing.status).toBe(200);
      expect(landing.headers.get('content-type')).toContain('text/html');

      const favicon = await harness.request('/api/agent/favicon.svg');
      expect(favicon.status).toBe(200);
      expect(favicon.headers.get('content-type')).toContain('image/svg+xml');

      const oasf = await harness.request(
        '/api/agent/.well-known/oasf-record.json'
      );
      expect(oasf.status).toBe(404);

      const invoked = await harness.request(
        '/api/agent/entrypoints/echo/invoke',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: { text: 'hello' } }),
        }
      );
      expect(invoked.status).toBe(200);
      expect(await invoked.json()).toMatchObject({
        status: 'succeeded',
        output: { text: 'hello' },
      });

      const missingEntrypoint = await harness.request(
        '/api/agent/entrypoints/missing/invoke',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: {} }),
        }
      );
      expect(missingEntrypoint.status).toBe(404);

      const stream = await harness.request(
        '/api/agent/entrypoints/stream/stream',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: { text: 'streamed' } }),
        }
      );
      expect(stream.status).toBe(200);
      expect(stream.headers.get('content-type')).toContain('text/event-stream');
      expect(await stream.text()).toContain('event: run-end');

      const task = await harness.request('/api/agent/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          skillId: 'slow',
          message: { role: 'user', content: { text: '{"text":"task"}' } },
        }),
      });
      expect(task.status).toBe(200);
      const access = (await task.json()) as {
        taskId: string;
        accessToken: string;
      };
      expect(typeof access.taskId).toBe('string');
      expect(typeof access.accessToken).toBe('string');
      if (!access.accessToken || access.accessToken.length < 20) {
        throw new Error(
          `Invalid task access response: ${JSON.stringify(access)}`
        );
      }
      const taskHeaders = { 'Task-Access-Token': access.accessToken };

      const listed = await harness.request(
        '/api/agent/tasks?limit=50&offset=0',
        { headers: taskHeaders }
      );
      if (!listed.ok) {
        throw new Error(
          `Task listing failed for token ${JSON.stringify(access.accessToken)} (${access.accessToken.length}): ${await listed.clone().text()}`
        );
      }
      expect(listed.status).toBe(200);
      expect(await listed.json()).toMatchObject({
        tasks: [expect.objectContaining({ taskId: access.taskId })],
      });

      const fetched = await harness.request(
        `/api/agent/tasks/${access.taskId}`,
        { headers: taskHeaders }
      );
      expect(fetched.status).toBe(200);
      expect(await fetched.json()).toMatchObject({ taskId: access.taskId });

      const cancelled = await harness.request(
        `/api/agent/tasks/${access.taskId}/cancel`,
        { method: 'POST', headers: taskHeaders }
      );
      expect(cancelled.status).toBe(200);
      expect(await cancelled.json()).toMatchObject({ status: 'cancelled' });

      const subscribed = await harness.request(
        `/api/agent/tasks/${access.taskId}/subscribe`,
        { headers: taskHeaders }
      );
      expect(subscribed.status).toBe(200);
      expect(subscribed.headers.get('content-type')).toContain(
        'text/event-stream'
      );
      expect(await subscribed.text()).toContain('event: statusUpdate');

      const denied = await harness.request(`/api/agent/tasks/${access.taskId}`);
      expect(denied.status).toBe(401);
    } finally {
      await harness.close();
    }
  });
});
