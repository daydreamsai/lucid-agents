import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Manifest = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export type PackageInfo = {
  dir: string;
  manifest: Manifest;
  name: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const packagesDir = path.join(repoRoot, 'packages');

export function collectPackages(): PackageInfo[] {
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

/**
 * Derive build order from workspace package manifests. Only published runtime
 * dependencies participate: dev dependencies intentionally do not, because
 * cross-package test fixtures form cycles (for example core <-> adapters).
 */
export function orderPackagesForBuild(
  packages: readonly PackageInfo[]
): PackageInfo[] {
  const byName = new Map(packages.map(pkg => [pkg.name, pkg]));
  const outgoing = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const { name } of packages) {
    outgoing.set(name, new Set());
    indegree.set(name, 0);
  }

  for (const pkg of packages) {
    const dependencies = {
      ...pkg.manifest.dependencies,
      ...pkg.manifest.optionalDependencies,
      ...pkg.manifest.peerDependencies,
    };
    for (const dependency of Object.keys(dependencies)) {
      if (!byName.has(dependency) || dependency === pkg.name) continue;
      const dependents = outgoing.get(dependency)!;
      if (dependents.has(pkg.name)) continue;
      dependents.add(pkg.name);
      indegree.set(pkg.name, (indegree.get(pkg.name) ?? 0) + 1);
    }
  }

  const ready = packages
    .map(pkg => pkg.name)
    .filter(name => indegree.get(name) === 0)
    .sort();
  const ordered: PackageInfo[] = [];

  while (ready.length > 0) {
    const name = ready.shift()!;
    ordered.push(byName.get(name)!);
    for (const dependent of outgoing.get(name) ?? []) {
      const degree = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, degree);
      if (degree === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }

  if (ordered.length !== packages.length) {
    const cyclic = packages
      .map(pkg => pkg.name)
      .filter(name => (indegree.get(name) ?? 0) > 0)
      .sort();
    throw new Error(`Workspace dependency cycle: ${cyclic.join(' -> ')}`);
  }

  return ordered;
}

async function buildPackages() {
  const packages = collectPackages();

  if (!packages.length) {
    console.warn('No packages found in packages/ – skipping build step.');
    return;
  }

  const orderedBuildList = orderPackagesForBuild(packages);

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

if (import.meta.main) {
  const shouldClean =
    process.argv.includes('--clean') || process.argv.includes('-c');

  if (shouldClean) {
    await cleanPackages();
  }

  await buildPackages().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
