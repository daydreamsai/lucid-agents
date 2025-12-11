import { parentPort, workerData } from 'node:worker_threads';
import vm from 'node:vm';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';

interface WorkerData {
  code: string;
  input: unknown;
  timeoutMs: number;
  network?: {
    allowedHosts: string[];
    timeoutMs?: number;
  };
}

function matchesHost(hostname: string, allowedHost: string): boolean {
  if (allowedHost.startsWith('*.')) {
    const domain = allowedHost.slice(2);
    return hostname === domain || hostname.endsWith('.' + domain);
  }
  return hostname === allowedHost;
}

function createFetchProxy(allowedHosts: string[], timeoutMs: number) {
  if (typeof fetch !== 'function') return undefined;

  const allowAnyHost = allowedHosts.includes('*');

  return async function guardedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ) {
    // Robustly extract URL string from various input types
    let urlString: string;
    if (typeof input === 'string') {
      urlString = input;
    } else if (input instanceof URL) {
      urlString = input.toString();
    } else if (
      typeof input === 'object' &&
      input !== null &&
      'url' in input &&
      typeof (input as { url?: unknown }).url === 'string'
    ) {
      urlString = (input as { url: string }).url;
    } else {
      urlString = String(input);
    }

    // Parse URL with error handling
    let url: URL;
    try {
      url = new URL(urlString);
    } catch (err) {
      throw new Error(
        `Invalid URL: ${urlString}. ${err instanceof Error ? err.message : 'Failed to parse URL'}`
      );
    }

    // Check hostname against allowed hosts (wildcard check happens first)
    if (
      !allowAnyHost &&
      !allowedHosts.some(host => matchesHost(url.hostname, host))
    ) {
      throw new Error(`Host not allowed: ${url.hostname}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort('network-timeout'),
      timeoutMs
    );

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

async function run() {
  const { code, input, timeoutMs, network } = workerData as WorkerData;

  const sandbox: Record<string, unknown> = {
    input,
    console,
    setTimeout: undefined,
    setInterval: undefined,
  };

  if (network && network.allowedHosts?.length) {
    const netTimeout =
      typeof network.timeoutMs === 'number' ? network.timeoutMs : 1000;
    sandbox.fetch = createFetchProxy(network.allowedHosts, netTimeout);
  }

  const context = vm.createContext(sandbox, { name: 'js-handler-context' });

  try {
    const wrapped = `(async () => {\n${code}\n})()`;
    const script = new vm.Script(wrapped);
    const result = await Promise.race([
      script.runInContext(context, { timeout: timeoutMs }),
      setTimeoutPromise(timeoutMs, null, { ref: false }).then(() => {
        throw new Error('Execution timed out');
      }),
    ]);

    parentPort?.postMessage({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    parentPort?.postMessage({ ok: false, error: message });
  }
}

run();
