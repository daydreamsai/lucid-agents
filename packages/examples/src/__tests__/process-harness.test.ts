import { describe, expect, it } from 'bun:test';

import { allocatePort, startTestProcess } from '../testing/process-harness';

describe('process E2E harness', () => {
  it('boots a child HTTP process, waits for readiness, and stops it', async () => {
    const port = await allocatePort();
    const fixture = new URL('./fixtures/http-server.ts', import.meta.url);
    const process = await startTestProcess({
      command: ['bun', 'run', fixture.pathname],
      env: { PORT: String(port) },
      readyUrl: `http://127.0.0.1:${port}/health`,
    });

    try {
      const response = await fetch(`${process.origin}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(process.output()).toContain(`listening:${port}`);
    } finally {
      await process.stop();
    }

    expect(process.exited()).toBe(true);
  });

  it('reports child output when readiness times out', async () => {
    const port = await allocatePort();
    const fixture = new URL('./fixtures/http-server.ts', import.meta.url);

    await expect(
      startTestProcess({
        command: ['bun', 'run', fixture.pathname],
        env: { PORT: String(port), HEALTH_STATUS: '503' },
        readyUrl: `http://127.0.0.1:${port}/health`,
        timeoutMs: 250,
      })
    ).rejects.toThrow(`listening:${port}`);
  });
});
