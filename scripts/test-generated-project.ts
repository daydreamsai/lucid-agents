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

import type { ServiceUiPreset } from '@lucid-agents/types/http';

import {
  allocatePort,
  startTestProcess,
} from '../packages/examples/src/testing/process-harness';
import { configureServiceUiKitchenSinkProject } from './configure-service-ui-kitchen-sink';

const ADAPTERS = [
  'hono',
  'express',
  'tanstack-ui',
  'tanstack-headless',
  'next',
] as const;
type Adapter = (typeof ADAPTERS)[number];
const UI_ADAPTERS = ['hono', 'express', 'tanstack-ui', 'next'] as const;
const PRESETS = [
  'dossier',
  'folio',
  'console',
] as const satisfies readonly ServiceUiPreset[];
type UiAdapter = (typeof UI_ADAPTERS)[number];

type VerificationCase = {
  adapter: Adapter;
  preset?: ServiceUiPreset;
};

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
  verification: VerificationCase,
  root: string,
  packed: Map<string, string>
): Promise<void> {
  const { adapter, preset } = verification;
  const projectName = `generated-${adapter}${preset ? `-${preset}` : ''}`;
  const cliArguments = [
    'bun',
    join(repoRoot, 'packages/cli/dist/index.js'),
    projectName,
    `--adapter=${adapter}`,
    '--template=blank',
    '--non-interactive',
    '--no-install',
  ];
  if (preset) cliArguments.push(`--ui-preset=${preset}`);
  await run(cliArguments, root);
  const projectDir = join(root, projectName);
  try {
    if (preset && isUiAdapter(adapter)) {
      await configureServiceUiKitchenSinkProject(projectDir, adapter);
    }
    const serviceUiConfigPath = join(projectDir, 'service-ui.config.ts');
    if (preset) {
      const serviceUiConfig = await readFile(serviceUiConfigPath, 'utf8');
      if (!serviceUiConfig.includes(`preset: \"${preset}\"`)) {
        throw new Error(
          `${adapter} config did not preserve the ${preset} preset`
        );
      }
    } else if (await Bun.file(serviceUiConfigPath).exists()) {
      throw new Error(`${adapter} unexpectedly generated service UI config`);
    }

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
      const card = (await cardResponse.json()) as {
        name?: string;
        provider?: { organization?: string };
        capabilities?: { stateTransitionHistory?: boolean };
        securitySchemes?: Record<string, unknown>;
        payments?: Array<{ method?: string }>;
        registrations?: unknown[];
        skills?: unknown[];
        entrypoints?: Record<string, unknown>;
      };
      if (card.name !== projectName) {
        throw new Error(
          `${adapter} Agent Card identity was ${card.name ?? 'missing'}, expected ${projectName}`
        );
      }
      if (preset) {
        const paymentMethods = new Set(
          (card.payments ?? []).map(payment => payment.method)
        );
        if (
          card.provider?.organization !== 'Lucid Agents CI' ||
          card.capabilities?.stateTransitionHistory !== true ||
          !card.securitySchemes?.siwx ||
          !paymentMethods.has('x402') ||
          !paymentMethods.has('mpp') ||
          (card.registrations?.length ?? 0) < 1 ||
          (card.skills?.length ?? 0) < 7 ||
          Object.keys(card.entrypoints ?? {}).length < 6
        ) {
          throw new Error(
            `${adapter} ${preset} Agent Card did not preserve the kitchen-sink contract`
          );
        }
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
      if (preset) {
        if (!html.includes(`data-service-ui-preset=\"${preset}\"`)) {
          throw new Error(
            `${adapter} service page did not render the ${preset} preset marker`
          );
        }
        const expectedMode = 'directory';
        if (!html.includes(`data-service-ui-mode=\"${expectedMode}\"`)) {
          throw new Error(
            `${adapter} service page did not render in ${expectedMode} mode`
          );
        }
        if (
          (adapter === 'hono' || adapter === 'express') &&
          /<script(?:\s|>)/iu.test(html)
        ) {
          throw new Error(`${adapter} static service page included JavaScript`);
        }
        if (
          !html.includes('summarize') ||
          !html.includes('attest') ||
          !html.includes('Payment method') ||
          !html.includes('data-region="endpoints"') ||
          html.includes('Public Agent Card JSON')
        ) {
          throw new Error(
            `${adapter} ${preset} endpoint directory did not match the minimal UI contract`
          );
        }
      } else if (html.includes('data-service-ui-preset=')) {
        throw new Error(`${adapter} headless page rendered a storefront`);
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

function isUiAdapter(adapter: Adapter): adapter is UiAdapter {
  return UI_ADAPTERS.includes(adapter as UiAdapter);
}

function requestedCases(): VerificationCase[] {
  const requested = process.argv.slice(2);
  if (requested.length === 0 || requested[0] === 'all') {
    return [
      ...UI_ADAPTERS.flatMap(adapter =>
        PRESETS.map(preset => ({ adapter, preset }))
      ),
      { adapter: 'tanstack-headless' },
    ];
  }

  const adapter = requested[0] as Adapter;
  if (!ADAPTERS.includes(adapter)) {
    throw new Error(
      `Unknown adapter ${requested[0]}. Expected ${ADAPTERS.join(', ')}`
    );
  }
  if (!isUiAdapter(adapter)) {
    if (requested[1] && requested[1] !== 'none') {
      throw new Error(`${adapter} is headless and does not accept a preset`);
    }
    return [{ adapter }];
  }

  const requestedPreset = requested[1] ?? 'dossier';
  if (requestedPreset === 'all') {
    return PRESETS.map(preset => ({ adapter, preset }));
  }
  if (!PRESETS.includes(requestedPreset as ServiceUiPreset)) {
    throw new Error(
      `Unknown preset ${requestedPreset}. Expected ${PRESETS.join(', ')}`
    );
  }
  return [{ adapter, preset: requestedPreset as ServiceUiPreset }];
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'lucid-generated-e2e-'));
try {
  const archives = join(temporaryRoot, 'packs');
  await mkdir(archives);
  const packed = await packWorkspaces(archives);
  if (!packed.has('@lucid-agents/core')) {
    throw new Error('Packed workspace set did not include @lucid-agents/core');
  }
  for (const verification of requestedCases()) {
    await verifyAdapter(verification, temporaryRoot, packed);
    console.log(
      `verified generated ${verification.adapter}${verification.preset ? ` ${verification.preset}` : ''} project from packed workspaces`
    );
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
