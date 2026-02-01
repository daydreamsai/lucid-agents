import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Manifest = {
  name?: string;
  scripts?: Record<string, string>;
};

type PackageResult = {
  name: string;
  missing: string[];
};

const REQUIRED_SCRIPTS = [
  'build',
  'lint',
  'format',
  'format:check',
  'type-check',
  'test',
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const packagesDir = path.join(repoRoot, 'packages');

function collectPackages(): PackageResult[] {
  if (!existsSync(packagesDir)) return [];

  const entries = readdirSync(packagesDir, { withFileTypes: true });
  const results: PackageResult[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(packagesDir, entry.name);
    const manifestPath = path.join(dir, 'package.json');
    if (!existsSync(manifestPath)) continue;

    const manifest = JSON.parse(
      readFileSync(manifestPath, 'utf8')
    ) as Manifest;
    const name = manifest.name ?? path.basename(dir);
    const scripts = manifest.scripts ?? {};
    const missing = REQUIRED_SCRIPTS.filter(script => !scripts[script]);

    results.push({ name, missing });
  }

  return results;
}

const results = collectPackages();
const failures = results.filter(result => result.missing.length > 0);

if (failures.length > 0) {
  console.error('CI policy check failed:');
  for (const failure of failures) {
    console.error(`- ${failure.name}: missing ${failure.missing.join(', ')}`);
  }
  process.exit(1);
}

console.log('CI policy check passed.');
