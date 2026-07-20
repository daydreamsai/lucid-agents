import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dir, '..');
const examplesRoot = join(repoRoot, 'lucid-docs/examples');
const keepProject = Bun.env.DOCS_STABLE_KEEP === 'true';

async function run(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(command, {
    cwd,
    env: Bun.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `${command.join(' ')} failed in ${cwd}\n${stdout}\n${stderr}`
    );
  }
  if (stdout.trim()) console.log(stdout.trim());
}

const root = await mkdtemp(join(tmpdir(), 'lucid-docs-stable-'));
try {
  await run(
    [
      'bunx',
      '@lucid-agents/cli@2.5.0',
      'my-service',
      '--adapter=hono',
      '--template=blank',
      '--non-interactive',
      '--no-install',
    ],
    root
  );
  const project = join(root, 'my-service');
  const generatedManifest = JSON.parse(
    await readFile(join(project, 'package.json'), 'utf8')
  ) as Record<string, unknown>;
  const manifest = {
    ...generatedManifest,
    scripts: {
      ...((generatedManifest.scripts as Record<string, string> | undefined) ??
        {}),
      'type-check': 'tsc --noEmit',
      test: 'bun test paid-service.test.ts',
    },
    dependencies: {
      '@lucid-agents/core': '2.5.0',
      '@lucid-agents/hono': '0.9.6',
      '@lucid-agents/http': '1.10.2',
      '@lucid-agents/payments': '2.5.0',
      '@x402/core': '2.19.0',
      '@x402/evm': '2.19.0',
      '@x402/fetch': '2.19.0',
      viem: '2.44.4',
      zod: '4.1.12',
    },
    devDependencies: {
      '@types/bun': '1.2.21',
      typescript: '5.9.3',
    },
  };
  await writeFile(
    join(project, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  await writeFile(
    join(project, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ES2022',
          types: ['bun'],
          skipLibCheck: true,
        },
        include: ['*.ts', 'src/**/*.ts'],
      },
      null,
      2
    )}\n`
  );
  await cp(
    join(examplesRoot, 'buyer-client.ts'),
    join(project, 'buyer-client.ts')
  );
  await cp(join(examplesRoot, 'buyer.ts'), join(project, 'buyer.ts'));
  await cp(
    join(examplesRoot, 'paid-service.ts'),
    join(project, 'paid-service.ts')
  );
  await cp(
    join(examplesRoot, 'paid-service.test.ts'),
    join(project, 'paid-service.test.ts')
  );

  await run(['bun', 'install', '--no-cache'], project);
  await run(['bun', 'run', 'type-check'], project);
  await run(['bun', 'run', 'test'], project);

  const installed = JSON.parse(
    await readFile(
      join(project, 'node_modules/@lucid-agents/core/package.json'),
      'utf8'
    )
  ) as { version?: string };
  if (installed.version !== '2.5.0') {
    throw new Error(
      `Expected Stable core 2.5.0, received ${installed.version}`
    );
  }
  console.log(
    'Verified the documented paid loop against public Stable packages.'
  );
} finally {
  if (keepProject) {
    console.log(`Kept Stable quickstart project at ${root}`);
  } else {
    await rm(root, { recursive: true, force: true });
  }
}
