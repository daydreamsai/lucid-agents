import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import type { TestProcess } from '../../testing/process-harness';
import { allocatePort, startTestProcess } from '../../testing/process-harness';

let process: TestProcess;

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${process.origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const port = await allocatePort();
  const clientPort = await allocatePort();
  const entrypoint = new URL('../index.ts', import.meta.url);
  process = await startTestProcess({
    command: ['bun', 'run', entrypoint.pathname],
    env: {
      PORT: String(port),
      CLIENT_PORT: String(clientPort),
      RUN_A2A_DEMO: 'false',
      QUIET: 'true',
    },
    readyUrl: `http://127.0.0.1:${port}/health`,
  });
});

afterAll(async () => process?.stop());

describe('kitchen-sink process E2E', () => {
  it('serves discovery from the actual executable', async () => {
    const [cardResponse, entrypointsResponse] = await Promise.all([
      fetch(`${process.origin}/.well-known/agent-card.json`),
      fetch(`${process.origin}/entrypoints`),
    ]);
    expect(cardResponse.status).toBe(200);
    expect(entrypointsResponse.status).toBe(200);

    const card = (await cardResponse.json()) as {
      name: string;
      skills: Array<{ id: string }>;
      capabilities?: { extensions?: Array<{ uri?: string }> };
    };
    expect(card.name).toBe('kitchen-sink-agent');
    expect(card.skills.map(skill => skill.id)).toContain('echo');
    expect(
      card.capabilities?.extensions?.some(item => item.uri?.includes('ap2'))
    ).toBe(true);
  });

  it('invokes the real echo entrypoint and validates input', async () => {
    const response = await post('/entrypoints/echo/invoke', {
      input: { text: 'from-process' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'succeeded',
      output: { text: 'from-process' },
    });

    const invalid = await post('/entrypoints/echo/invoke', {
      input: { text: 42 },
    });
    expect(invalid.status).toBe(400);
  });

  it('streams SSE envelopes over TCP', async () => {
    const response = await post('/entrypoints/stream/stream', {
      input: { prompt: 'e2e' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(body).toContain('event: delta');
    expect(body).toContain('"delta":"e"');
    expect(body).toContain('event: run-end');
  });

  it('creates, reads, lists, and subscribes to an owned A2A task', async () => {
    const created = await post('/tasks', {
      skillId: 'echo',
      message: {
        role: 'user',
        content: { text: JSON.stringify({ text: 'task-e2e' }) },
      },
    });
    expect(created.status).toBe(200);
    const access = (await created.json()) as {
      taskId: string;
      accessToken: string;
    };
    const headers = { 'Task-Access-Token': access.accessToken };

    let task:
      | { status: string; result?: { output?: { text?: string } } }
      | undefined;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await fetch(`${process.origin}/tasks/${access.taskId}`, {
        headers,
      });
      task = (await response.json()) as typeof task;
      if (task?.status === 'completed') break;
      await Bun.sleep(10);
    }
    expect(task).toMatchObject({
      status: 'completed',
      result: { output: { text: 'task-e2e' } },
    });

    const listed = await fetch(`${process.origin}/tasks`, { headers });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      tasks: [expect.objectContaining({ taskId: access.taskId })],
    });

    const subscribed = await fetch(
      `${process.origin}/tasks/${access.taskId}/subscribe`,
      { headers }
    );
    expect(subscribed.status).toBe(200);
    expect(await subscribed.text()).toContain('event: resultUpdate');

    const denied = await fetch(`${process.origin}/tasks/${access.taskId}`, {
      headers: { 'Task-Access-Token': 'wrong-access-token-000000000000' },
    });
    expect(denied.status).toBe(404);
  });
});
