const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const TEMPO_LOCALNET_CHAIN_ID_HEX = '0x539';

export const TEMPO_IMAGE =
  'ghcr.io/tempoxyz/tempo@sha256:fd3912451658118f54625d122b37fd35e0dc2fe2192f99d9941f1a468dd4d97c';
export const TEMPO_SOURCE_REVISION = '0dcf32250f0ff29791b5940e30c9084232cd6d43';
const TEMPO_TEST_MNEMONIC =
  'test test test test test test test test test test test junk';
const TEMPO_TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const DEFAULT_RPC_URL = 'http://127.0.0.1:18545';
const READINESS_ATTEMPTS = 30;

type CommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

export type TempoLocalnetDependencies = {
  delay: (milliseconds: number) => Promise<void>;
  fetchJson: (url: URL) => Promise<unknown>;
  log: (message: string) => void;
  runChild: (
    command: string[],
    environment: Record<string, string>
  ) => Promise<number>;
  runDocker: (args: string[]) => Promise<CommandResult>;
};

export type TempoLocalnetOptions = {
  containerName?: string;
  dependencies?: TempoLocalnetDependencies;
  rpcUrl?: string;
};

export function assertSafeTempoRpcUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      'Tempo E2E test credentials require a loopback HTTP RPC URL'
    );
  }
  return url;
}

export function assertTempoLocalnetChainId(payload: unknown): void {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('result' in payload) ||
    typeof payload.result !== 'string'
  ) {
    throw new Error('invalid eth_chainId JSON-RPC response');
  }
  if (payload.result.toLowerCase() !== TEMPO_LOCALNET_CHAIN_ID_HEX) {
    throw new Error(
      `expected Tempo localnet chain ID 1337 (0x539), received ${payload.result}`
    );
  }
}

export function assertTempoSourceRevision(output: string): void {
  const revision = output.trim();
  if (revision !== TEMPO_SOURCE_REVISION) {
    throw new Error(
      `expected Tempo source revision ${TEMPO_SOURCE_REVISION}, received ${revision}`
    );
  }
}

function requireDockerSuccess(result: CommandResult, operation: string): void {
  if (result.exitCode !== 0) {
    const detail = redactTempoDiagnostics(
      result.stderr || result.stdout || 'no Docker output'
    );
    throw new Error(`${operation} failed: ${detail}`);
  }
}

async function waitForTempoLocalnet(
  dependencies: TempoLocalnetDependencies,
  rpcUrl: URL
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= READINESS_ATTEMPTS; attempt += 1) {
    let payload: unknown;
    try {
      payload = await dependencies.fetchJson(rpcUrl);
    } catch (error) {
      lastError = error;
      if (attempt < READINESS_ATTEMPTS) {
        await dependencies.delay(1_000);
      }
      continue;
    }

    assertTempoLocalnetChainId(payload);
    return;
  }

  const detail =
    lastError instanceof Error ? lastError.message : 'RPC did not respond';
  throw new Error(`Tempo localnet readiness timed out: ${detail}`);
}

async function collectTempoDiagnostics(
  dependencies: TempoLocalnetDependencies,
  containerName: string
): Promise<void> {
  const result = await dependencies.runDocker(['logs', containerName]);
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  if (output) {
    dependencies.log(redactTempoDiagnostics(output));
  }
}

export async function runTempoLocalnet(
  childCommand: string[],
  options: TempoLocalnetOptions = {}
): Promise<number> {
  if (childCommand.length === 0) {
    throw new Error(
      'usage: bun scripts/tempo-localnet.ts -- <E2E test command>'
    );
  }

  const dependencies = options.dependencies ?? defaultDependencies;
  const containerName =
    options.containerName ?? `lucid-tempo-e2e-${process.pid}`;
  const rpcUrl = assertSafeTempoRpcUrl(options.rpcUrl ?? DEFAULT_RPC_URL);
  let result: number | undefined;
  let failure: unknown;

  try {
    await dependencies.runDocker(['rm', '--force', containerName]);

    const pull = await dependencies.runDocker(['pull', TEMPO_IMAGE]);
    requireDockerSuccess(pull, 'pulling the pinned Tempo image');

    const inspection = await dependencies.runDocker([
      'image',
      'inspect',
      '--format',
      '{{ index .Config.Labels "org.opencontainers.image.revision" }}',
      TEMPO_IMAGE,
    ]);
    requireDockerSuccess(inspection, 'inspecting the pinned Tempo image');
    assertTempoSourceRevision(inspection.stdout);

    const start = await dependencies.runDocker(
      buildTempoDockerRunArgs({
        containerName,
        rpcUrl: rpcUrl.href,
      })
    );
    requireDockerSuccess(start, 'starting Tempo localnet');

    await waitForTempoLocalnet(dependencies, rpcUrl);
    dependencies.log(
      `Tempo localnet ready: chainId=1337 image=${TEMPO_IMAGE} revision=${TEMPO_SOURCE_REVISION}`
    );

    result = await dependencies.runChild(childCommand, {
      TEST_TEMPO_CHAIN_ID: '1337',
      TEST_TEMPO_RPC_URL: rpcUrl.href.replace(/\/$/u, ''),
    });
    if (result !== 0) {
      await collectTempoDiagnostics(dependencies, containerName);
    }
  } catch (error) {
    failure = error;
    await collectTempoDiagnostics(dependencies, containerName);
  }

  const cleanup = await dependencies.runDocker([
    'rm',
    '--force',
    containerName,
  ]);
  if (cleanup.exitCode !== 0 && failure === undefined) {
    failure = new Error(
      `removing Tempo localnet failed: ${redactTempoDiagnostics(
        cleanup.stderr || cleanup.stdout || 'no Docker output'
      )}`
    );
  }

  if (failure !== undefined) {
    throw failure;
  }
  return result ?? 1;
}

async function runProcess(
  command: string[],
  options: { capture: boolean; environment?: Record<string, string> }
): Promise<CommandResult> {
  const subprocess = Bun.spawn(command, {
    env: { ...process.env, ...options.environment },
    stderr: options.capture ? 'pipe' : 'inherit',
    stdout: options.capture ? 'pipe' : 'inherit',
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    options.capture
      ? new Response(subprocess.stdout).text()
      : Promise.resolve(''),
    options.capture
      ? new Response(subprocess.stderr).text()
      : Promise.resolve(''),
  ]);
  return { exitCode, stderr, stdout };
}

const defaultDependencies: TempoLocalnetDependencies = {
  delay: milliseconds =>
    new Promise(resolve => {
      setTimeout(resolve, milliseconds);
    }),
  fetchJson: async url => {
    const response = await fetch(url, {
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) {
      throw new Error(`Tempo RPC returned HTTP ${response.status}`);
    }
    return response.json();
  },
  log: message => console.error(message),
  runChild: async (command, environment) =>
    (
      await runProcess(command, {
        capture: false,
        environment,
      })
    ).exitCode,
  runDocker: args => runProcess(['docker', ...args], { capture: true }),
};

if (import.meta.main) {
  const separator = process.argv.indexOf('--');
  const childCommand =
    separator === -1
      ? process.argv.slice(2)
      : process.argv.slice(separator + 1);

  try {
    const exitCode = await runTempoLocalnet(childCommand, {
      containerName: process.env.TEMPO_E2E_CONTAINER_NAME,
      rpcUrl: process.env.TEST_TEMPO_RPC_URL,
    });
    process.exitCode = exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(redactTempoDiagnostics(message));
    process.exitCode = 1;
  }
}

export function buildTempoDockerRunArgs(options: {
  containerName: string;
  rpcUrl: string;
}): string[] {
  const rpcUrl = assertSafeTempoRpcUrl(options.rpcUrl);
  if (!rpcUrl.port) {
    throw new Error('Tempo localnet RPC URL must include an explicit port');
  }

  return [
    'run',
    '--detach',
    '--name',
    options.containerName,
    '--publish',
    `127.0.0.1:${rpcUrl.port}:54515`,
    TEMPO_IMAGE,
    'node',
    '--authrpc.port',
    '54545',
    '--datadir',
    '/tmp/lucid-tempo-e2e',
    '--dev',
    '--dev.block-time',
    '200ms',
    '--dev.mnemonic',
    TEMPO_TEST_MNEMONIC,
    '--engine.disable-precompile-cache',
    '--engine.legacy-state-root',
    '--faucet.address',
    '0x20c0000000000000000000000000000000000000',
    '0x20c0000000000000000000000000000000000001',
    '0x20c0000000000000000000000000000000000002',
    '0x20c0000000000000000000000000000000000003',
    '--faucet.amount',
    '1000000000000',
    '--faucet.enabled',
    '--faucet.private-key',
    TEMPO_TEST_PRIVATE_KEY,
    '--http.addr',
    '0.0.0.0',
    '--http.api',
    'all',
    '--http.corsdomain',
    '*',
    '--http.port',
    '54515',
    '--port',
    '54525',
    '--ws.port',
    '54535',
  ];
}

export function redactTempoDiagnostics(input: string): string {
  return input
    .replaceAll(TEMPO_TEST_MNEMONIC, '[REDACTED]')
    .replaceAll(TEMPO_TEST_PRIVATE_KEY, '[REDACTED]')
    .replace(
      /("(?:authorization|payment-credential|credential|signature|rawTransaction|raw_transaction|privateKey)"\s*:\s*)"(?:\\.|[^"\\])*"/giu,
      '$1"[REDACTED]"'
    )
    .replace(
      /^(\s*(?:authorization|payment-credential)\s*:\s*).*$/gimu,
      '$1[REDACTED]'
    )
    .replace(
      /^(\s*(?:signature|rawTransaction|raw_transaction|privateKey)\s*[:=]\s*).*$/gimu,
      '$1[REDACTED]'
    );
}
