export type TestProcess = {
  origin: string;
  output(): string;
  exited(): boolean;
  stop(): Promise<void>;
};

export type StartTestProcessOptions = {
  command: string[];
  readyUrl: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
};

const POLL_INTERVAL_MS = 20;
const DEFAULT_TIMEOUT_MS = 10_000;

/** Ask the operating system for an available loopback TCP port. */
export async function allocatePort(): Promise<number> {
  const probe = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response(null, { status: 204 }),
  });
  const port = probe.port;
  probe.stop(true);
  if (port === undefined) throw new Error('Bun did not allocate a TCP port');
  return port;
}

async function capture(
  stream: ReadableStream<Uint8Array> | number | undefined,
  append: (text: string) => void
): Promise<void> {
  if (!stream || typeof stream === 'number') return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    let isDone = false;
    while (!isDone) {
      const { done, value } = await reader.read();
      isDone = done;
      if (value) append(decoder.decode(value, { stream: true }));
    }
    append(decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

async function waitForReady(
  child: Bun.Subprocess,
  readyUrl: string,
  timeoutMs: number,
  output: () => string
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = 'no response';

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Test process exited with code ${child.exitCode} before ${readyUrl} became ready.\n${output()}`
      );
    }
    try {
      const response = await fetch(readyUrl, {
        signal: AbortSignal.timeout(250),
      });
      if (response.ok) return;
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await Bun.sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${readyUrl} (${lastFailure}).\n${output()}`
  );
}

/** Spawn a process, wait for its HTTP readiness endpoint, and capture diagnostics. */
export async function startTestProcess({
  command,
  readyUrl,
  cwd,
  env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: StartTestProcessOptions): Promise<TestProcess> {
  const chunks: string[] = [];
  const child = Bun.spawn(command, {
    cwd,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const append = (text: string) => chunks.push(text);
  const captureOutput = Promise.all([
    capture(child.stdout, append),
    capture(child.stderr, append),
  ]);
  const output = () => chunks.join('');

  const stop = async (): Promise<void> => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      const graceful = await Promise.race([
        child.exited.then(() => true),
        Bun.sleep(1_000).then(() => false),
      ]);
      if (!graceful && child.exitCode === null) {
        child.kill('SIGKILL');
        await child.exited;
      }
    }
    await captureOutput;
  };

  try {
    await waitForReady(child, readyUrl, timeoutMs, output);
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    origin: new URL(readyUrl).origin,
    output,
    exited: () => child.exitCode !== null,
    stop,
  };
}
