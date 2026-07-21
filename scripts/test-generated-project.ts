import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  allocatePort,
  startTestProcess,
} from '../packages/examples/src/testing/process-harness';

const ADAPTERS = [
  'hono',
  'express',
  'tanstack-ui',
  'tanstack-headless',
  'next',
] as const;
type Adapter = (typeof ADAPTERS)[number];

const repoRoot = resolve(import.meta.dir, '..');
const preserveGeneratedProjects = Bun.env.GENERATED_PROJECT_KEEP === 'true';

async function run(
  command: string[],
  cwd: string,
  env: Record<string, string> = {}
): Promise<void> {
  const process = Bun.spawn(command, {
    cwd,
    env: { ...Bun.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `${command.join(' ')} failed in ${cwd}\n${stdout}\n${stderr}`
    );
  }
}

async function packWorkspaces(
  destination: string
): Promise<Map<string, string>> {
  const packagesDir = join(repoRoot, 'packages');
  const packed = new Map<string, string>();
  for (const directory of await readdir(packagesDir)) {
    const packageDir = join(packagesDir, directory);
    let manifest: { name?: string; private?: boolean };
    try {
      manifest = JSON.parse(
        await readFile(join(packageDir, 'package.json'), 'utf8')
      ) as { name?: string; private?: boolean };
    } catch {
      continue;
    }
    if (
      manifest.private ||
      !manifest.name?.startsWith('@lucid-agents/') ||
      manifest.name === '@lucid-agents/cli'
    ) {
      continue;
    }
    await run(
      ['bun', 'pm', 'pack', '--destination', destination, '--quiet'],
      packageDir
    );
  }

  for (const archive of await readdir(destination)) {
    if (!archive.endsWith('.tgz')) continue;
    const name = archive
      .replace(/^lucid-agents-/, '@lucid-agents/')
      .replace(/-\d+\.\d+\.\d+(?:-[^.]+)?\.tgz$/, '');
    packed.set(name, join(destination, archive));
  }
  return packed;
}

async function usePackedWorkspaces(
  projectDir: string,
  packed: Map<string, string>
): Promise<void> {
  const path = join(projectDir, 'package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    overrides?: Record<string, string>;
  };
  const overrides: Record<string, string> = {};
  for (const [name, archive] of packed) {
    const value = `file:${archive}`;
    overrides[name] = value;
    if (manifest.dependencies?.[name]) manifest.dependencies[name] = value;
    if (manifest.devDependencies?.[name])
      manifest.devDependencies[name] = value;
  }
  manifest.overrides = { ...manifest.overrides, ...overrides };
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function verifyAdapter(
  adapter: Adapter,
  root: string,
  packed: Map<string, string>
): Promise<void> {
  const projectName = `generated-${adapter}`;
  await run(
    [
      'bun',
      join(repoRoot, 'packages/cli/dist/index.js'),
      projectName,
      `--adapter=${adapter}`,
      '--template=blank',
      '--non-interactive',
      '--no-install',
    ],
    root
  );
  const projectDir = join(root, projectName);
  try {
    await usePackedWorkspaces(projectDir, packed);
    await run(['bun', 'install', '--no-cache'], projectDir);
    await run(['bun', 'run', 'type-check'], projectDir);
    await run(['bun', 'run', 'build'], projectDir);
    if (adapter === 'hono') {
      await run(['bun', 'run', 'deploy', '--', '--help'], projectDir);
      await run(
        [
          'bunx',
          'wrangler',
          'versions',
          'upload',
          '--dry-run',
          '--config',
          'wrangler.jsonc',
          '--preview-alias',
          'preview',
          '--strict',
          '--keep-vars=false',
          '--var',
          'IDENTITY_AUTO_REGISTER:false',
          '--var',
          'REGISTER_IDENTITY:false',
        ],
        projectDir,
        { CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' }
      );
    }

    const port = await allocatePort();
    const healthPath =
      adapter === 'hono' || adapter === 'express'
        ? '/health'
        : '/api/agent/health';
    const process = await startTestProcess({
      command: ['bun', 'run', 'start'],
      cwd: projectDir,
      env: { PORT: String(port) },
      readyUrl: `http://127.0.0.1:${port}${healthPath}`,
      timeoutMs: 30_000,
    });
    try {
      const health = await fetch(`${process.origin}${healthPath}`);
      if (!health.ok) {
        throw new Error(`${adapter} health returned ${health.status}`);
      }
      const body = (await health.json()) as { ok?: boolean };
      if (body.ok !== true)
        throw new Error(`${adapter} health payload was invalid`);

      const cardResponse = await fetch(
        `${process.origin}/.well-known/agent-card.json`
      );
      if (!cardResponse.ok) {
        throw new Error(
          `${adapter} Agent Card returned ${cardResponse.status}`
        );
      }
      const card = (await cardResponse.json()) as { name?: string };
      if (card.name !== projectName) {
        throw new Error(
          `${adapter} Agent Card identity was ${card.name ?? 'missing'}, expected ${projectName}`
        );
      }

      const home = await fetch(process.origin);
      if (!home.ok) {
        const responseBody = await home.text();
        throw new Error(
          `${adapter} service page returned ${home.status}\n${responseBody}\n${process.output()}`
        );
      }
      const html = await home.text();
      if (!html.includes(card.name)) {
        throw new Error(
          `${adapter} service page did not render the public agent identity`
        );
      }
    } finally {
      await process.stop();
    }
  } finally {
    if (!preserveGeneratedProjects) {
      await rm(projectDir, { recursive: true, force: true });
    }
  }
}

function requestedAdapters(): Adapter[] {
  const requested = process.argv.slice(2);
  if (requested.length === 0 || requested.includes('all')) return [...ADAPTERS];
  for (const value of requested) {
    if (!ADAPTERS.includes(value as Adapter)) {
      throw new Error(
        `Unknown adapter ${value}. Expected ${ADAPTERS.join(', ')}`
      );
    }
  }
  return requested as Adapter[];
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'lucid-generated-e2e-'));
try {
  const archives = join(temporaryRoot, 'packs');
  await mkdir(archives);
  const packed = await packWorkspaces(archives);
  if (!packed.has('@lucid-agents/core')) {
    throw new Error('Packed workspace set did not include @lucid-agents/core');
  }
  for (const adapter of requestedAdapters()) {
    await verifyAdapter(adapter, temporaryRoot, packed);
    console.log(`verified generated ${adapter} project from packed workspaces`);
  }
} finally {
  if (preserveGeneratedProjects) {
    const rootFile = Bun.env.GENERATED_PROJECT_ROOT_FILE;
    if (rootFile) await writeFile(rootFile, `${temporaryRoot}\n`);
    console.log(`kept generated projects at ${temporaryRoot}`);
  } else {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
