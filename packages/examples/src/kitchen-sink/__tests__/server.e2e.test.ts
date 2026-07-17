import { describe, expect, it } from 'bun:test';

import { allocatePort, startTestProcess } from '../../testing/process-harness';

describe('kitchen-sink executable', () => {
  it('can be imported without starting servers', async () => {
    const moduleUrl = new URL('../index.ts', import.meta.url).href;
    const child = Bun.spawn(
      [
        'bun',
        '--eval',
        `await import(${JSON.stringify(moduleUrl)}); console.log('imported')`,
      ],
      { stdout: 'pipe', stderr: 'pipe' }
    );

    const exited = await Promise.race([
      child.exited.then(code => ({ code })),
      Bun.sleep(500).then(() => undefined),
    ]);
    if (!exited) {
      child.kill('SIGKILL');
      await child.exited;
    }

    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    expect(exited, stderr).toEqual({ code: 0 });
    expect(stdout).toContain('imported');
    expect(stdout).not.toContain('All capabilities running');
  });

  it('starts both agents on isolated ports and exposes health', async () => {
    const { startKitchenSink } = await import('../index');
    const running = await startKitchenSink({
      port: 0,
      clientPort: 0,
      runDemo: false,
      quiet: true,
    });

    try {
      expect(running.origin).not.toBe(running.clientOrigin);
      const response = await fetch(`${running.origin}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
    } finally {
      await running.close();
    }
  });

  it('boots the actual executable without running the demo in CI mode', async () => {
    const port = await allocatePort();
    const clientPort = await allocatePort();
    const entrypoint = new URL('../index.ts', import.meta.url);
    const process = await startTestProcess({
      command: ['bun', 'run', entrypoint.pathname],
      env: {
        PORT: String(port),
        CLIENT_PORT: String(clientPort),
        RUN_A2A_DEMO: 'false',
      },
      readyUrl: `http://127.0.0.1:${port}/health`,
    });

    try {
      expect((await fetch(`${process.origin}/health`)).status).toBe(200);
      await Bun.sleep(50);
      expect(process.output()).not.toContain('Sending A2A task');
    } finally {
      await process.stop();
    }
  });
});
