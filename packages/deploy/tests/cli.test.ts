import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { runCli as executeDeployCli } from '../src/cli';
import { createDeployManifestJsonSchema } from '../src/manifest';

const tempPaths: string[] = [];
const servers: Array<ReturnType<typeof Bun.serve>> = [];

afterEach(async () => {
  while (servers.length > 0) {
    servers.pop()?.stop(true);
  }
  while (tempPaths.length > 0) {
    const path = tempPaths.pop();
    if (path) await rm(path, { recursive: true, force: true });
  }
});

async function createTempDir(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  tempPaths.push(path);
  return path;
}

async function writeProject(projectDir: string): Promise<void> {
  await writeFile(
    join(projectDir, 'lucid.deploy.json'),
    JSON.stringify(
      {
        version: 1,
        adapter: 'hono',
        provider: 'cloudflare',
        paths: {
          entrypoint: 'src/worker.ts',
          providerConfig: 'wrangler.jsonc',
          environmentFile: '.env',
        },
        environment: {
          allowlist: [
            'AGENT_NAME',
            'PAYMENTS_NETWORK',
            'PAYMENTS_FACILITATOR_AUTH',
            'IDENTITY_AUTO_REGISTER',
            'REGISTER_IDENTITY',
          ],
          secrets: ['PAYMENTS_FACILITATOR_AUTH'],
          signingKeys: [],
          mainnet: {
            PAYMENTS_NETWORK: ['base'],
          },
        },
      },
      null,
      2
    ) + '\n'
  );
  await writeFile(join(projectDir, 'wrangler.jsonc'), '{}\n');
  await mkdir(join(projectDir, 'src'));
  await writeFile(join(projectDir, 'src/worker.ts'), 'export default {};\n');
  await writeFile(
    join(projectDir, '.env'),
    [
      'AGENT_NAME=preview-agent',
      'PAYMENTS_NETWORK=base-sepolia',
      'PAYMENTS_FACILITATOR_AUTH=upload-secret-value',
      'UNLISTED_SECRET=never-upload-this',
      '',
    ].join('\n')
  );
}

async function writeFakeWrangler(binDir: string): Promise<string> {
  const executable = join(binDir, 'wrangler');
  await writeFile(
    executable,
    `#!/usr/bin/env bun
import { readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
if (args[0] === 'whoami') {
  if (process.env.WRANGLER_FAKE_AUTH_FAILURE === 'true') {
    console.error(process.env.WRANGLER_FAKE_FAILURE_DETAIL);
    process.exit(6);
  }
  console.log('Authenticated to Cloudflare');
  process.exit(0);
}

if (args[0] === 'secret' && args[1] === 'list') {
  console.log(process.env.WRANGLER_FAKE_REMOTE_SECRETS ?? '[]');
  process.exit(0);
}

if (args[0] === 'versions' && args[1] === 'upload') {
  const secretsIndex = args.indexOf('--secrets-file');
  const secrets = secretsIndex === -1
    ? {}
    : JSON.parse(await readFile(args[secretsIndex + 1], 'utf8'));
  await writeFile(
    process.env.WRANGLER_FAKE_CAPTURE_PATH,
    JSON.stringify({
      args,
      secrets,
      unlistedEnvironment: process.env.UNLISTED_SECRET ?? null,
    })
  );
  if (process.env.WRANGLER_FAKE_UPLOAD_FAILURE === 'true') {
    console.error(process.env.WRANGLER_FAKE_FAILURE_DETAIL);
    process.exit(7);
  }
  console.log('Uploaded Worker version');
  console.log(
    process.env.WRANGLER_FAKE_PROVIDER_OUTPUT ??
      ('Preview URL: ' + process.env.WRANGLER_FAKE_DEPLOY_URL)
  );
  process.exit(0);
}

console.error('Unexpected Wrangler command: ' + args.join(' '));
process.exit(9);
`
  );
  await chmod(executable, 0o755);
  return executable;
}

async function runCli(
  projectDir: string,
  args: string[],
  env: Record<string, string>,
  interactive = false
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await executeDeployCli({
    args,
    cwd: projectDir,
    environment: {
      ...process.env,
      ...env,
    },
    interactive,
    log: message => stdout.push(message),
    warn: message => stderr.push(message),
    error: message => stderr.push(message),
    allowLocalPreview: true,
  });
  return {
    exitCode,
    stdout: stdout.length === 0 ? '' : `${stdout.join('\n')}\n`,
    stderr: stderr.length === 0 ? '' : `${stderr.join('\n')}\n`,
  };
}

describe('lucid-deploy executable', () => {
  test('publishes only the manifest schema and executable, not a JavaScript API', async () => {
    const packageJson = JSON.parse(
      await readFile(join(import.meta.dir, '..', 'package.json'), 'utf8')
    ) as {
      bin?: Record<string, string>;
      exports?: Record<string, string>;
    };
    expect(packageJson.bin).toEqual({ 'lucid-deploy': 'dist/cli.js' });
    expect(packageJson.exports).toEqual({
      './lucid.deploy.schema.json': './lucid.deploy.schema.json',
    });
  });

  test('keeps the published deployment schema generated from runtime validation', async () => {
    const published = JSON.parse(
      await readFile(
        join(import.meta.dir, '..', 'lucid.deploy.schema.json'),
        'utf8'
      )
    ) as Record<string, unknown>;
    expect(published).toEqual(createDeployManifestJsonSchema());
  });

  test('uploads an isolated Cloudflare preview and verifies its public contract', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    const binDir = await createTempDir('lucid-deploy-bin-');
    const capturePath = join(projectDir, 'provider-capture.json');
    const requestedPaths: string[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        requestedPaths.push(path);
        if (path === '/health') {
          return Response.json({ ok: true, version: '0.1.0' });
        }
        if (path === '/.well-known/agent-card.json') {
          return Response.json({ name: 'preview-agent', version: '0.1.0' });
        }
        if (path === '/') {
          return new Response('Lucid agent');
        }
        return new Response('Not found', { status: 404 });
      },
    });
    servers.push(server);
    await writeProject(projectDir);
    await writeFakeWrangler(binDir);

    const previewUrl = `http://127.0.0.1:${server.port}`;
    const result = await runCli(projectDir, ['--yes'], {
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
      WRANGLER_FAKE_CAPTURE_PATH: capturePath,
      WRANGLER_FAKE_DEPLOY_URL: previewUrl,
      UNLISTED_SECRET: 'never-upload-this',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Cloudflare authentication confirmed');
    expect(result.stdout).toContain('PAYMENTS_FACILITATOR_AUTH=<redacted>');
    expect(result.stdout).toContain(`Preview URL: ${previewUrl}`);
    expect(result.stdout).toContain('Verified /health');
    expect(result.stdout).toContain('Verified /.well-known/agent-card.json');
    expect(result.stdout).not.toContain('upload-secret-value');
    expect(result.stdout).not.toContain('never-upload-this');
    expect(result.stdout).not.toContain('provider-token-value');

    const capture = JSON.parse(await readFile(capturePath, 'utf8')) as {
      args: string[];
      secrets: Record<string, string>;
      unlistedEnvironment: string | null;
    };
    expect(capture.args.slice(0, 2)).toEqual(['versions', 'upload']);
    expect(capture.args).toContain('--preview-alias');
    expect(capture.args).toContain('preview');
    expect(capture.args).toContain('--strict');
    expect(capture.args).toContain('--keep-vars=false');
    expect(capture.args).toContain('AGENT_NAME:preview-agent');
    expect(capture.args).toContain('PAYMENTS_NETWORK:base-sepolia');
    expect(capture.args).toContain('IDENTITY_AUTO_REGISTER:false');
    expect(capture.args).toContain('REGISTER_IDENTITY:false');
    expect(capture.args.join(' ')).not.toContain('UNLISTED_SECRET');
    expect(capture.args.join(' ')).not.toContain('never-upload-this');
    expect(capture.secrets).toEqual({
      PAYMENTS_FACILITATOR_AUTH: 'upload-secret-value',
    });
    expect(capture.unlistedEnvironment).toBeNull();
    expect(requestedPaths).toEqual([
      '/',
      '/health',
      '/.well-known/agent-card.json',
    ]);
  });

  test('redacts provider tokens and Worker secrets from upload failures', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    const binDir = await createTempDir('lucid-deploy-bin-');
    await writeProject(projectDir);
    await writeFakeWrangler(binDir);

    const result = await runCli(projectDir, ['--yes'], {
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
      CLOUDFLARE_API_KEY: 'legacy-provider-key-value',
      WRANGLER_FAKE_CAPTURE_PATH: join(projectDir, 'provider-capture.json'),
      WRANGLER_FAKE_DEPLOY_URL: 'https://preview-agent.example.workers.dev',
      WRANGLER_FAKE_UPLOAD_FAILURE: 'true',
      WRANGLER_FAKE_FAILURE_DETAIL:
        'provider rejected upload-secret-value and provider-token-value',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'provider rejected <redacted> and <redacted>'
    );
    expect(result.stderr).not.toContain('upload-secret-value');
    expect(result.stderr).not.toContain('provider-token-value');
  });

  test('rejects inherited remote secrets before uploading a preview', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    const binDir = await createTempDir('lucid-deploy-bin-');
    const capturePath = join(projectDir, 'provider-capture.json');
    await writeProject(projectDir);
    await writeFakeWrangler(binDir);

    const result = await runCli(projectDir, ['--yes'], {
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
      WRANGLER_FAKE_CAPTURE_PATH: capturePath,
      WRANGLER_FAKE_REMOTE_SECRETS: JSON.stringify([
        { name: 'UNLISTED_REMOTE_SECRET', type: 'secret_text' },
      ]),
      WRANGLER_FAKE_UPLOAD_FAILURE: 'true',
      WRANGLER_FAKE_FAILURE_DETAIL: 'upload should not be attempted',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'Remote Worker secrets are not included in this upload: UNLISTED_REMOTE_SECRET'
    );
    await expect(readFile(capturePath, 'utf8')).rejects.toThrow();
  });

  test('returns actionable Cloudflare authentication failures', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    const binDir = await createTempDir('lucid-deploy-bin-');
    await writeProject(projectDir);
    await writeFakeWrangler(binDir);

    const result = await runCli(projectDir, ['--yes'], {
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
      CLOUDFLARE_API_KEY: 'legacy-provider-key-value',
      WRANGLER_FAKE_CAPTURE_PATH: join(projectDir, 'provider-capture.json'),
      WRANGLER_FAKE_DEPLOY_URL: 'https://preview-agent.example.workers.dev',
      WRANGLER_FAKE_AUTH_FAILURE: 'true',
      WRANGLER_FAKE_FAILURE_DETAIL:
        'permission denied for provider-token-value and legacy-provider-key-value',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Cloudflare authentication failed');
    expect(result.stderr).toContain('bunx wrangler login');
    expect(result.stderr).toContain('permission denied for <redacted>');
    expect(result.stderr).not.toContain('provider-token-value');
    expect(result.stderr).not.toContain('legacy-provider-key-value');
  });

  test('requires --yes and CLOUDFLARE_API_TOKEN together outside a TTY', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    await writeProject(projectDir);

    const withoutYes = await runCli(projectDir, [], {
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
    });
    const withoutToken = await runCli(projectDir, ['--yes'], {
      CLOUDFLARE_API_TOKEN: '',
    });

    expect(withoutYes.exitCode).toBe(1);
    expect(withoutToken.exitCode).toBe(1);
    expect(withoutYes.stderr).toContain(
      'requires both --yes and CLOUDFLARE_API_TOKEN'
    );
    expect(withoutToken.stderr).toContain(
      'requires both --yes and CLOUDFLARE_API_TOKEN'
    );
    expect(withoutYes.stderr).not.toContain('provider-token-value');
  });

  test('requires CI confirmation even when a pseudo-TTY is present', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    const binDir = await createTempDir('lucid-deploy-bin-');
    await writeProject(projectDir);
    await writeFakeWrangler(binDir);

    const result = await runCli(
      projectDir,
      [],
      {
        PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
        CI: 'true',
        WRANGLER_FAKE_AUTH_FAILURE: 'true',
        WRANGLER_FAKE_FAILURE_DETAIL: 'authentication should not be attempted',
      },
      true
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'requires both --yes and CLOUDFLARE_API_TOKEN'
    );
  });

  test('rejects unsupported deployment manifest versions before provider access', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    await writeProject(projectDir);
    const manifestPath = join(projectDir, 'lucid.deploy.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<
      string,
      unknown
    >;
    manifest.version = 2;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = await runCli(projectDir, ['--yes'], {
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('version must be 1');
    expect(result.stderr).not.toContain('provider-token-value');
  });

  test('rejects unknown manifest fields before provider access', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    await writeProject(projectDir);
    const manifestPath = join(projectDir, 'lucid.deploy.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<
      string,
      unknown
    >;
    manifest.unexpected = 'not-part-of-v1';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = await runCli(projectDir, ['--yes'], {
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unrecognized key');
  });

  test('ignores malformed environment entries that are not allowlisted', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    const binDir = await createTempDir('lucid-deploy-bin-');
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        return new URL(request.url).pathname === '/.well-known/agent-card.json'
          ? Response.json({ name: 'preview-agent', version: '0.1.0' })
          : new URL(request.url).pathname === '/health'
            ? Response.json({ ok: true, version: '0.1.0' })
            : new Response('ok');
      },
    });
    servers.push(server);
    await writeProject(projectDir);
    await writeFile(
      join(projectDir, '.env'),
      `${await readFile(join(projectDir, '.env'), 'utf8')}not an assignment\n`
    );
    await writeFakeWrangler(binDir);

    const result = await runCli(projectDir, ['--yes'], {
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
      WRANGLER_FAKE_CAPTURE_PATH: join(projectDir, 'provider-capture.json'),
      WRANGLER_FAKE_DEPLOY_URL: `http://127.0.0.1:${server.port}`,
    });

    expect(result.exitCode).toBe(0);
  });

  test('rejects signing keys that are not classified as secrets', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    await writeProject(projectDir);
    const manifestPath = join(projectDir, 'lucid.deploy.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      environment: {
        allowlist: string[];
        signingKeys: string[];
      };
    };
    manifest.environment.allowlist.push('UNSAFE_SIGNING_KEY');
    manifest.environment.signingKeys.push('UNSAFE_SIGNING_KEY');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = await runCli(projectDir, ['--yes'], {
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('signingKeys must also appear in secrets');
  });

  test('rejects provider-config variables outside the deployment manifest', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    await writeProject(projectDir);
    await writeFile(
      join(projectDir, 'wrangler.jsonc'),
      '{\n  // Wrangler variables bypass CLI allowlists\n  "vars": { "UNLISTED_SECRET": "leak" },\n}\n'
    );

    const result = await runCli(projectDir, ['--yes'], {
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('must not define vars');
    expect(result.stderr).not.toContain('leak');
  });

  test('rejects unsafe provider bindings that bypass the deployment manifest', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    await writeProject(projectDir);
    const configs = [
      {
        unsafe: {
          bindings: [
            { name: 'UNLISTED_SECRET', type: 'plain_text', value: 'leak' },
          ],
        },
      },
      {
        env: {
          preview: { unsafe: { metadata: { IDENTITY_AUTO_REGISTER: true } } },
        },
      },
    ];

    for (const config of configs) {
      await writeFile(
        join(projectDir, 'wrangler.jsonc'),
        JSON.stringify(config)
      );
      const result = await runCli(projectDir, ['--yes'], {
        CLOUDFLARE_API_TOKEN: 'provider-token-value',
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        'must not define unsafe.bindings or unsafe.metadata'
      );
      expect(result.stderr).not.toContain('leak');
      expect(result.stderr).not.toContain('IDENTITY_AUTO_REGISTER');
    }
  });

  test('rejects production and cleanup operations without touching Cloudflare', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    await writeProject(projectDir);

    const production = await runCli(projectDir, ['--prod', '--yes'], {
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
    });
    const cleanup = await runCli(projectDir, ['--destroy-preview', '--yes'], {
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
    });

    expect(production.exitCode).toBe(1);
    expect(production.stderr).toContain(
      'Production deployment is not supported'
    );
    expect(cleanup.exitCode).toBe(1);
    expect(cleanup.stderr).toContain('Preview cleanup is not supported');
  });

  test('extracts the preview URL from noisy ANSI-colored provider output', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    const binDir = await createTempDir('lucid-deploy-bin-');
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/.well-known/agent-card.json') {
          return Response.json({ name: 'preview-agent', version: '0.1.0' });
        }
        if (path === '/health') return Response.json({ ok: true });
        return new Response('ok');
      },
    });
    servers.push(server);
    await writeProject(projectDir);
    await writeFakeWrangler(binDir);
    const previewUrl = `http://127.0.0.1:${server.port}`;

    const result = await runCli(projectDir, ['--yes'], {
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
      WRANGLER_FAKE_CAPTURE_PATH: join(projectDir, 'provider-capture.json'),
      WRANGLER_FAKE_DEPLOY_URL: '',
      WRANGLER_FAKE_PROVIDER_OUTPUT:
        `Documentation: https://developers.cloudflare.com/workers/ ` +
        `\u001b[32mPreview URL: ${previewUrl},\u001b[0m`,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Preview URL: ${previewUrl}`);
  });

  test('reports the failing verification endpoint without exposing secrets', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    const binDir = await createTempDir('lucid-deploy-bin-');
    const requestedPaths: string[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        requestedPaths.push(path);
        if (path === '/health') {
          return new Response(
            'upstream rejected upload-secret-value and provider-token-value',
            { status: 503 }
          );
        }
        return new Response('ok');
      },
    });
    servers.push(server);
    await writeProject(projectDir);
    await writeFakeWrangler(binDir);

    const result = await runCli(projectDir, ['--yes'], {
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
      WRANGLER_FAKE_CAPTURE_PATH: join(projectDir, 'provider-capture.json'),
      WRANGLER_FAKE_DEPLOY_URL: `http://127.0.0.1:${server.port}`,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('verification failed for /health');
    expect(result.stderr).toContain('received 503');
    expect(result.stderr).toContain('<redacted>');
    expect(result.stderr).not.toContain('upload-secret-value');
    expect(result.stderr).not.toContain('provider-token-value');
    expect(requestedPaths).toEqual(['/', '/health', '/health', '/health']);
  });

  test('rejects redirects during public-origin verification', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    const binDir = await createTempDir('lucid-deploy-bin-');
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/') {
          return Response.redirect('https://example.com/', 302);
        }
        if (path === '/health') return Response.json({ ok: false });
        return Response.json({});
      },
    });
    servers.push(server);
    await writeProject(projectDir);
    await writeFakeWrangler(binDir);

    const result = await runCli(projectDir, ['--yes'], {
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
      WRANGLER_FAKE_CAPTURE_PATH: join(projectDir, 'provider-capture.json'),
      WRANGLER_FAKE_DEPLOY_URL: `http://127.0.0.1:${server.port}`,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('verification failed for /');
  });

  test('rejects invalid health and Agent Card payloads', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    const binDir = await createTempDir('lucid-deploy-bin-');
    let invalidPayload: 'health' | 'card' = 'health';
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/health') {
          return Response.json(
            invalidPayload === 'health' ? { ok: false } : { ok: true }
          );
        }
        if (path === '/.well-known/agent-card.json') {
          return Response.json(
            invalidPayload === 'card'
              ? {}
              : { name: 'preview-agent', version: '0.1.0' }
          );
        }
        return new Response('ok');
      },
    });
    servers.push(server);
    await writeProject(projectDir);
    await writeFakeWrangler(binDir);
    const environment = {
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
      WRANGLER_FAKE_CAPTURE_PATH: join(projectDir, 'provider-capture.json'),
      WRANGLER_FAKE_DEPLOY_URL: `http://127.0.0.1:${server.port}`,
    };

    const invalidHealth = await runCli(projectDir, ['--yes'], environment);
    invalidPayload = 'card';
    const invalidCard = await runCli(projectDir, ['--yes'], environment);

    expect(invalidHealth.exitCode).toBe(1);
    expect(invalidHealth.stderr).toContain('verification failed for /health');
    expect(invalidCard.exitCode).toBe(1);
    expect(invalidCard.stderr).toContain(
      'verification failed for /.well-known/agent-card.json'
    );
  });

  test('requires explicit --yes confirmation for mainnet and signing material in CI', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    const binDir = await createTempDir('lucid-deploy-bin-');
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/.well-known/agent-card.json') {
          return Response.json({ name: 'preview-agent', version: '0.1.0' });
        }
        if (path === '/health') return Response.json({ ok: true });
        return new Response('ok');
      },
    });
    servers.push(server);
    await writeProject(projectDir);
    const manifestPath = join(projectDir, 'lucid.deploy.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      environment: {
        allowlist: string[];
        secrets: string[];
        signingKeys: string[];
      };
    };
    manifest.environment.allowlist.push('DEVELOPER_WALLET_PRIVATE_KEY');
    manifest.environment.secrets.push('DEVELOPER_WALLET_PRIVATE_KEY');
    manifest.environment.signingKeys.push('DEVELOPER_WALLET_PRIVATE_KEY');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const environmentPath = join(projectDir, '.env');
    const environment = (await readFile(environmentPath, 'utf8')).replace(
      'PAYMENTS_NETWORK=base-sepolia',
      'PAYMENTS_NETWORK=base'
    );
    await writeFile(
      environmentPath,
      `${environment}DEVELOPER_WALLET_PRIVATE_KEY=signing-secret-value\n`
    );
    await writeFakeWrangler(binDir);

    const result = await runCli(projectDir, ['--yes'], {
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      CLOUDFLARE_API_TOKEN: 'provider-token-value',
      WRANGLER_FAKE_CAPTURE_PATH: join(projectDir, 'provider-capture.json'),
      WRANGLER_FAKE_DEPLOY_URL: `http://127.0.0.1:${server.port}`,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Sensitive deployment detected');
    expect(result.stderr).toContain('private signing material');
    expect(result.stderr).toContain('mainnet configuration');
    expect(result.stderr).toContain('confirmed by --yes');
    expect(result.stderr).not.toContain('signing-secret-value');
  });

  test('requires confirmation for normalized mainnet values', async () => {
    const projectDir = await createTempDir('lucid-deploy-project-');
    const binDir = await createTempDir('lucid-deploy-bin-');
    await writeProject(projectDir);
    await writeFakeWrangler(binDir);
    const manifestPath = join(projectDir, 'lucid.deploy.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      environment: { mainnet: Record<string, string[]> };
    };
    manifest.environment.mainnet.PAYMENTS_NETWORK?.push('solana-mainnet');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const stderr: string[] = [];

    const exitCode = await executeDeployCli({
      args: [],
      cwd: projectDir,
      environment: {
        ...process.env,
        CI: undefined,
        PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
        PAYMENTS_NETWORK: ' solana-mainnet ',
        WRANGLER_FAKE_AUTH_FAILURE: 'true',
        WRANGLER_FAKE_FAILURE_DETAIL: 'authentication should not be attempted',
      },
      interactive: true,
      log: () => undefined,
      warn: message => stderr.push(message),
      error: message => stderr.push(message),
      confirm: async () => false,
    });

    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Deployment cancelled');
    expect(stderr.join('\n')).not.toContain(
      'authentication should not be attempted'
    );
  });
});
