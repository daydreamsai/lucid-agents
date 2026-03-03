/**
 * Tests for hono-streaming.ts
 *
 * Unit/contract tests — all calls go via app.fetch(), no real network.
 */

import { beforeAll, describe, expect, it } from 'bun:test';

import { createStreamingAgent } from '../hono-streaming';

type App = { fetch: (req: Request) => Response | Promise<Response> };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function stream(
  app: App,
  key: string,
  input: Record<string, unknown>
): Promise<{ res: Response; text: string }> {
  const req = new Request(`http://localhost/entrypoints/${key}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  const res = await app.fetch(req);
  const text = await res.text();
  return { res, text };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let app: App;

beforeAll(async () => {
  const result = await createStreamingAgent();
  app = result.app;
});

// ── char-stream ───────────────────────────────────────────────────────────────

describe('char-stream entrypoint', () => {
  it('responds with 200 and SSE content-type', async () => {
    const { res } = await stream(app, 'char-stream', { text: 'hi' });
    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('emits a delta event for each character', async () => {
    const { text } = await stream(app, 'char-stream', { text: 'ab' });
    expect(text).toContain('event: delta');
    expect(text).toContain('"delta":"a"');
    expect(text).toContain('"delta":"b"');
  });

  it('emits run-end with succeeded status', async () => {
    const { text } = await stream(app, 'char-stream', { text: 'z' });
    expect(text).toContain('event: run-end');
    expect(text).toContain('"status":"succeeded"');
  });
});

// ── count-stream ──────────────────────────────────────────────────────────────

describe('count-stream entrypoint', () => {
  it('emits countdown deltas', async () => {
    const { res, text } = await stream(app, 'count-stream', { from: 3 });
    expect(res.ok).toBe(true);
    expect(text).toContain('3…');
    expect(text).toContain('2…');
    expect(text).toContain('1…');
  });

  it('emits final liftoff message', async () => {
    const { text } = await stream(app, 'count-stream', { from: 2 });
    expect(text).toContain('Liftoff');
  });

  it('emits run-end at the end', async () => {
    const { text } = await stream(app, 'count-stream', { from: 1 });
    expect(text).toContain('event: run-end');
    expect(text).toContain('"status":"succeeded"');
  });
});

// ── word-stream ───────────────────────────────────────────────────────────────

describe('word-stream entrypoint', () => {
  it('emits a delta for each word', async () => {
    const { text } = await stream(app, 'word-stream', {
      text: 'hello world foo',
    });
    expect(text).toContain('hello');
    expect(text).toContain('world');
    expect(text).toContain('foo');
  });

  it('emits run-end with succeeded status', async () => {
    const { text } = await stream(app, 'word-stream', { text: 'test' });
    expect(text).toContain('event: run-end');
    expect(text).toContain('"status":"succeeded"');
  });

  it('returns correct wordCount in output', async () => {
    const { text } = await stream(app, 'word-stream', {
      text: 'one two three four',
    });
    expect(text).toContain('"wordCount":4');
  });

  it('returns wordCount=0 for empty string input', async () => {
    const { text } = await stream(app, 'word-stream', { text: '' });
    expect(text).toContain('"wordCount":0');
  });
});
