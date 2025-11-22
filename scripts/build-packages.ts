import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Manifest = {
  name?: string;
  scripts?: Record<string, string>;
};

type PackageInfo = {
  dir: string;
  manifest: Manifest;
  name: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const packagesDir = path.join(repoRoot, 'packages');

function collectPackages(): PackageInfo[] {
  if (!existsSync(packagesDir)) return [];

  const entries = readdirSync(packagesDir, { withFileTypes: true });
  const results: PackageInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(packagesDir, entry.name);
    const manifestPath = path.join(dir, 'package.json');
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(
        readFileSync(manifestPath, 'utf8')
      ) as Manifest;
      const name = manifest.name ?? path.basename(dir);
      results.push({ dir, manifest, name });
    } catch (err) {
      console.warn(`Skipping ${entry.name}: ${(err as Error).message}`);
    }
  }

  return results;
}

async function exec(argv: string[], cwd: string) {
  const proc = Bun.spawn(argv, {
    cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${argv.join(' ')} exited with code ${code}`);
  }
}

async function cleanPackages() {
  const packages = collectPackages();

  for (const { manifest, dir, name } of packages) {
    const cleanScript = manifest.scripts?.clean;

    if (!cleanScript) {
      continue;
    }

    console.log(`Cleaning ${name}...`);
    await exec(['bun', 'run', 'clean'], dir);
  }
}

async function buildPackages() {
  const packages = collectPackages();

  if (!packages.length) {
    console.warn('No packages found in packages/ – skipping build step.');
    return;
  }

  // Build order: base packages → extensions → core → adapters → CLI
  // Extensions (wallet, payments, identity, a2a, ap2, http) only depend on types.
  // Core depends on all extensions, so extensions must build first.
  const preferredOrder = [
    // Base layer - no internal dependencies
    '@lucid-agents/types',

    // Extensions - only depend on types
    '@lucid-agents/wallet', // Depends on types
    '@lucid-agents/payments', // Depends on types only
    '@lucid-agents/identity', // Depends on types only
    '@lucid-agents/a2a', // Depends on types only
    '@lucid-agents/ap2', // Depends on types only
    '@lucid-agents/http', // Depends on types only

    // Core - depends on all extensions
    '@lucid-agents/core', // Depends on payments, identity, a2a, ap2, types, wallet

    // Adapters - depend on core and extensions
    '@lucid-agents/hono', // Depends on core, payments, types
    '@lucid-agents/express', // Depends on core, payments, types
    '@lucid-agents/tanstack', // Depends on core, payments, types

    // CLI - no dependencies on other packages
    '@lucid-agents/cli',
  ];

  const packagesByName = new Map(packages.map(pkg => [pkg.name, pkg]));
  const orderedBuildList: PackageInfo[] = [];

  for (const name of preferredOrder) {
    const pkg = packagesByName.get(name);
    if (pkg) {
      orderedBuildList.push(pkg);
      packagesByName.delete(name);
    }
  }

  // Append any remaining packages that weren't explicitly ordered.
  orderedBuildList.push(...packagesByName.values());

  for (const { manifest, dir, name } of orderedBuildList) {
    const buildScript = manifest.scripts?.build;

    if (!buildScript) {
      console.log(`Skipping ${name}: no build script defined.`);
      continue;
    }

    console.log(`Building ${name}...`);
    await exec(['bun', 'run', 'build'], dir);
  }
}

const shouldClean =
  process.argv.includes('--clean') || process.argv.includes('-c');

if (shouldClean) {
  await cleanPackages();
}

await buildPackages().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
