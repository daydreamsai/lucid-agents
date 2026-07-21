import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { UploadEnvironment } from './environment';
import { PREVIEW_SAFETY_VARIABLES } from './preview-policy';
import { redact } from './redaction';

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
};

type ProviderContext = {
  environment: NodeJS.ProcessEnv;
  sensitiveValues: ReadonlySet<string>;
  log: (message: string) => void;
  allowLocalPreview?: boolean;
};

const PROVIDER_EXECUTABLE = 'wrangler';
const PREVIEW_ALIAS = 'preview';
const MAX_COMMAND_OUTPUT = 1_000_000;
const ANSI_ESCAPE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  'gu'
);

export function registerProviderCredentialValues(
  environment: NodeJS.ProcessEnv,
  sensitiveValues: Set<string>
): void {
  for (const [name, value] of Object.entries(environment)) {
    if (
      value &&
      (name.startsWith('CLOUDFLARE_') || name.startsWith('WRANGLER_')) &&
      /(?:TOKEN|KEY|SECRET|PASSWORD|AUTH|CREDENTIAL)/u.test(name)
    ) {
      sensitiveValues.add(value);
      sensitiveValues.add(value.trim());
    }
  }
}

export async function verifyAuthentication(
  providerConfig: string,
  context: ProviderContext
): Promise<void> {
  const result = await runProvider(
    ['whoami', '--config', providerConfig],
    context.environment
  );
  if (result.exitCode !== 0) {
    const detail = redact(
      combineCommandOutput(result),
      context.sensitiveValues
    );
    throw new Error(
      'Cloudflare authentication failed. Run "bunx wrangler login" for interactive use or set CLOUDFLARE_API_TOKEN for CI.' +
        (detail ? ` Provider output: ${detail}` : '')
    );
  }
  context.log('Cloudflare authentication confirmed.');
}

export async function assertNoInheritedRemoteSecrets(params: {
  providerConfig: string;
  uploadedSecretNames: ReadonlySet<string>;
  context: ProviderContext;
}): Promise<void> {
  const result = await runProvider(
    ['secret', 'list', '--config', params.providerConfig, '--format', 'json'],
    params.context.environment
  );
  if (result.exitCode !== 0) {
    const detail = redact(
      combineCommandOutput(result),
      params.context.sensitiveValues
    );
    throw new Error(
      `Could not inspect existing Cloudflare secrets${detail ? `: ${detail}` : '.'}`
    );
  }

  const remoteSecretNames = parseRemoteSecretNames(result.stdout);
  const inherited = remoteSecretNames.filter(
    name => !params.uploadedSecretNames.has(name)
  );
  if (inherited.length > 0) {
    throw new Error(
      `Remote Worker secrets are not included in this upload: ${inherited.sort().join(', ')}. Set them locally or remove them from Cloudflare before deploying.`
    );
  }
}

export async function uploadPreview(params: {
  context: ProviderContext;
  paths: {
    entrypoint: string;
    providerConfig: string;
  };
  uploadEnvironment: UploadEnvironment;
}): Promise<string> {
  const secretFile = await writeSecretsFile(params.uploadEnvironment.secrets);
  try {
    const args = [
      'versions',
      'upload',
      params.paths.entrypoint,
      '--config',
      params.paths.providerConfig,
      '--preview-alias',
      PREVIEW_ALIAS,
      '--strict',
      '--keep-vars=false',
    ];
    for (const [name, value] of params.uploadEnvironment.plain) {
      args.push('--var', `${name}:${value}`);
    }
    for (const [name, value] of PREVIEW_SAFETY_VARIABLES) {
      args.push('--var', `${name}:${value}`);
    }
    if (secretFile) args.push('--secrets-file', secretFile.path);

    params.context.log('Uploading an isolated Cloudflare preview...');
    const result = await runProvider(args, params.context.environment);
    if (result.exitCode !== 0) {
      const detail = redact(
        combineCommandOutput(result),
        params.context.sensitiveValues
      );
      throw new Error(
        `Cloudflare preview upload failed${detail ? `: ${detail}` : '.'}`
      );
    }
    const output = `${result.stdout}\n${result.stderr}`;
    const previewUrl = extractPreviewUrl(
      output,
      params.context.allowLocalPreview === true
    );
    if (!previewUrl) {
      throw new Error(
        'Cloudflare preview upload succeeded but Wrangler did not return a preview URL.'
      );
    }
    return previewUrl;
  } finally {
    await secretFile?.cleanup();
  }
}

async function writeSecretsFile(
  secrets: Map<string, string>
): Promise<{ path: string; cleanup: () => Promise<void> } | undefined> {
  if (secrets.size === 0) return undefined;
  const directory = await mkdtemp(join(tmpdir(), 'lucid-deploy-secrets-'));
  const path = join(directory, 'secrets.json');
  try {
    await writeFile(path, `${JSON.stringify(Object.fromEntries(secrets))}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    path,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

function parseRemoteSecretNames(output: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch {
    throw new Error('Cloudflare returned an invalid remote secret list.');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      entry =>
        !entry ||
        typeof entry !== 'object' ||
        typeof (entry as { name?: unknown }).name !== 'string'
    )
  ) {
    throw new Error('Cloudflare returned an invalid remote secret list.');
  }
  return parsed.map(entry => (entry as { name: string }).name);
}

async function runProvider(
  args: string[],
  sourceEnvironment: NodeJS.ProcessEnv
): Promise<CommandResult> {
  const directory = await mkdtemp(join(tmpdir(), 'lucid-deploy-provider-'));
  try {
    return await runProviderInDirectory(args, directory, sourceEnvironment);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runProviderInDirectory(
  args: string[],
  directory: string,
  sourceEnvironment: NodeJS.ProcessEnv
): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(PROVIDER_EXECUTABLE, args, {
      cwd: directory,
      env: providerProcessEnvironment(sourceEnvironment),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let truncated = false;
    child.stdout.on('data', (chunk: Buffer) => {
      const appended = appendCommandOutput(stdout, chunk.toString());
      stdout = appended.output;
      truncated ||= appended.truncated;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const appended = appendCommandOutput(stderr, chunk.toString());
      stderr = appended.output;
      truncated ||= appended.truncated;
    });
    child.on('error', error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(
          new Error(
            'Wrangler is not installed. Run "bun install" in the generated project.'
          )
        );
        return;
      }
      reject(error);
    });
    child.on('close', code => {
      resolvePromise({ exitCode: code ?? 1, stdout, stderr, truncated });
    });
  });
}

function providerProcessEnvironment(
  source: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const exactNames = new Set([
    'APPDATA',
    'BUN_INSTALL',
    'CI',
    'COLORTERM',
    'COMSPEC',
    'FORCE_COLOR',
    'HOME',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'LANG',
    'LOCALAPPDATA',
    'LOGNAME',
    'NODE_EXTRA_CA_CERTS',
    'NO_COLOR',
    'NO_PROXY',
    'PATH',
    'PATHEXT',
    'SHELL',
    'SSL_CERT_DIR',
    'SSL_CERT_FILE',
    'SYSTEMROOT',
    'SystemRoot',
    'TEMP',
    'TERM',
    'TMP',
    'TMPDIR',
    'TZ',
    'USER',
    'USERPROFILE',
    'WINDIR',
    'XDG_CACHE_HOME',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'http_proxy',
    'https_proxy',
    'no_proxy',
  ]);
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(source)) {
    if (
      value !== undefined &&
      (exactNames.has(name) ||
        name.startsWith('CLOUDFLARE_') ||
        name.startsWith('WRANGLER_') ||
        name.startsWith('LC_'))
    ) {
      environment[name] = value;
    }
  }
  environment.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
  return environment;
}

function appendCommandOutput(
  current: string,
  chunk: string
): { output: string; truncated: boolean } {
  const combined = `${current}${chunk}`;
  return {
    output: combined.slice(0, MAX_COMMAND_OUTPUT),
    truncated: combined.length > MAX_COMMAND_OUTPUT,
  };
}

function combineCommandOutput(result: CommandResult): string {
  if (result.truncated) {
    return 'Provider output exceeded the safe display limit and was omitted.';
  }
  return [result.stdout.trim(), result.stderr.trim()]
    .filter(Boolean)
    .join('\n');
}

function extractPreviewUrl(
  output: string,
  allowLocalPreview: boolean
): string | undefined {
  const withoutAnsi = output.replace(ANSI_ESCAPE, '');
  const candidates = withoutAnsi.match(/https?:\/\/[^\s"'<>]+/gu) ?? [];
  const urls = candidates.flatMap(candidate => {
    const cleaned = candidate.replace(/[),.;\]}]+$/gu, '');
    try {
      return [new URL(cleaned)];
    } catch {
      return [];
    }
  });
  const selected =
    [...urls].reverse().find(url => url.hostname.endsWith('.workers.dev')) ??
    (allowLocalPreview
      ? [...urls].reverse().find(url => isLocalHostname(url.hostname))
      : undefined);
  if (!selected) return undefined;
  if (selected.username || selected.password) return undefined;
  if (selected.protocol !== 'https:' && !isLocalHostname(selected.hostname)) {
    return undefined;
  }
  return selected.href.replace(/\/$/u, '');
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}
