import { a2a } from '@lucid-agents/a2a';
import { analytics } from '@lucid-agents/analytics';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { scheduler } from '@lucid-agents/scheduler';
import { beforeAll, describe, expect, it, mock } from 'bun:test';

import { registerEntrypoints } from '../entrypoints';

// POST to an entrypoint via app.fetch — no network required
async function invoke(
  app: { fetch: (req: Request) => Response | Promise<Response> },
  key: string,
  input: Record<string, unknown>
) {
  const req = new Request(`http://localhost/entrypoints/${key}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  const res = await app.fetch(req);
  if (!res.ok)
    throw new Error(`invoke ${key} failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { output: Record<string, unknown> };
  return body;
}

let app: { fetch: (req: Request) => Response | Promise<Response> };

beforeAll(async () => {
  // Provide minimal env vars so paymentsFromEnv() returns a valid config.
  // withPayments validates payTo/facilitatorUrl/network even for free entrypoints
  // before it checks whether a price is set; these stubs satisfy the validator.
  process.env.PAYMENTS_RECEIVABLE_ADDRESS =
    process.env.PAYMENTS_RECEIVABLE_ADDRESS ??
    '0x0000000000000000000000000000000000000001';
  process.env.FACILITATOR_URL =
    process.env.FACILITATOR_URL ?? 'https://facilitator.example.com';
  process.env.NETWORK = process.env.NETWORK ?? 'base-sepolia';

  const agent = await createAgent({
    name: 'test-kitchen-sink',
    version: '1.0.0',
    description: 'test',
  })
    .use(http())
    .use(a2a())
    .use(analytics())
    .use(payments({ config: paymentsFromEnv() }))
    .use(scheduler())
    .build();

  const agentApp = await createAgentApp(agent);
  registerEntrypoints(agentApp.addEntrypoint, agent);
  app = agentApp.app;
});

describe('echo entrypoint', () => {
  it('returns the input text and a timestamp string', async () => {
    const result = await invoke(app, 'echo', { text: 'hello' });
    expect(result.output.text).toBe('hello');
    expect(typeof result.output.timestamp).toBe('string');
  });
});

describe('summarize entrypoint', () => {
  it('returns word count, char count, and preview', async () => {
    const result = await invoke(app, 'summarize', {
      text: 'The quick brown fox jumps over the lazy dog',
    });
    expect(result.output.wordCount).toBe(9);
    expect(result.output.charCount).toBe(43);
    expect(typeof result.output.preview).toBe('string');
  });
});

describe('analytics-report entrypoint', () => {
  it('returns payment summary fields as expected types', async () => {
    const result = await invoke(app, 'analytics-report', {});
    expect(typeof result.output.outgoingTotal).toBe('string');
    expect(typeof result.output.incomingTotal).toBe('string');
    expect(typeof result.output.netTotal).toBe('string');
    expect(typeof result.output.transactionCount).toBe('number');
  });
});

describe('scheduler-status entrypoint', () => {
  it('returns a jobs array and a present flag', async () => {
    const result = await invoke(app, 'scheduler-status', {});
    expect(Array.isArray(result.output.jobs)).toBe(true);
    expect(typeof result.output.present).toBe('boolean');
  });
});

describe('ask entrypoint', () => {
  it('calls the Anthropic API and returns the answer', async () => {
    // Build a fresh app so we can inject a mock Anthropic client
    const agent = await createAgent({
      name: 'test-ask',
      version: '1.0.0',
      description: 'test',
    })
      .use(http())
      .use(a2a())
      .use(analytics())
      .use(payments({ config: paymentsFromEnv() }))
      .use(scheduler())
      .build();

    const agentApp = await createAgentApp(agent);

    // Mock Anthropic client — no real API call
    const mockCreate = mock(async () => ({
      content: [{ type: 'text', text: 'Paris' }],
    }));
    const mockAnthropic = { messages: { create: mockCreate } };

    registerEntrypoints(agentApp.addEntrypoint, agent, {
      anthropic: mockAnthropic,
    });

    const result = await invoke(agentApp.app, 'ask', {
      question: 'What is the capital of France?',
    });

    // Answer came back
    expect(result.output.answer).toBe('Paris');

    // The mock was called exactly once
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // The question was forwarded to the LLM
    const callArgs = mockCreate.mock.calls[0][0] as {
      messages: Array<{ content: string }>;
    };
    expect(callArgs.messages[0].content).toContain(
      'What is the capital of France?'
    );
  });
});

describe('stream entrypoint', () => {
  it('responds with a streaming SSE response containing the prompt', async () => {
    const req = new Request('http://localhost/entrypoints/stream/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { prompt: 'hi' } }),
    });
    const res = await app.fetch(req);
    expect(res.ok).toBe(true);
    const text = await res.text();
    // The stream handler emits each character as a separate delta event, so
    // 'h' and 'i' appear individually in the JSON data fields — not concatenated.
    expect(text).toContain('event: delta');
    expect(text).toContain('"delta":"h"');
    expect(text).toContain('"delta":"i"');
    expect(text).toContain('event: run-end');
    expect(text).toContain('"status":"succeeded"');
  });
});
