import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

type RuntimeCompatibility = 'portable' | 'node' | 'tooling' | 'examples';
type PackageManifest = {
  name?: string;
  main?: string;
  exports?: Record<
    string,
    | string
    | {
        import?: string;
        default?: string;
      }
  >;
  lucidAgents?: {
    runtime?: RuntimeCompatibility;
    nodeExports?: string[];
    bundlerExports?: string[];
  };
};

const repoRoot = resolve(import.meta.dir, '..');
const packagesRoot = resolve(repoRoot, 'packages');

function importTarget(
  value: string | { import?: string; default?: string } | undefined
): string | undefined {
  if (typeof value === 'string') return value;
  return value?.import ?? value?.default;
}

function portableExportEntries(
  manifest: PackageManifest
): Array<{ exportName: string; target: string }> {
  const nodeExports = new Set(manifest.lucidAgents?.nodeExports ?? []);
  const bundlerExports = new Set(manifest.lucidAgents?.bundlerExports ?? []);
  const excludedExports = new Set([...nodeExports, ...bundlerExports]);
  const declaredExports = Object.entries(manifest.exports ?? {}).filter(
    ([exportName]) => exportName !== './package.json'
  );
  for (const exportName of excludedExports) {
    if (!manifest.exports?.[exportName]) {
      throw new Error(
        `${manifest.name ?? 'Package'} declares unknown platform export ${exportName}`
      );
    }
  }
  if (declaredExports.length === 0) {
    return manifest.main ? [{ exportName: '.', target: manifest.main }] : [];
  }
  return declaredExports.flatMap(([exportName, value]) => {
    if (excludedExports.has(exportName)) return [];
    const target = importTarget(value);
    if (!target) {
      throw new Error(
        `${manifest.name ?? 'Package'} export ${exportName} has no import target`
      );
    }
    return [{ exportName, target }];
  });
}

const packageDirs = readdirSync(packagesRoot, { withFileTypes: true }).filter(
  entry => entry.isDirectory()
);
const portableEntries: Array<{ name: string; path: string }> = [];

for (const packageDir of packageDirs) {
  const manifestPath = resolve(packagesRoot, packageDir.name, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8')
  ) as PackageManifest;
  const compatibility = manifest.lucidAgents?.runtime;
  if (!compatibility) {
    throw new Error(
      `${manifest.name ?? packageDir.name} must declare lucidAgents.runtime`
    );
  }
  if (compatibility !== 'portable') continue;
  const entries = portableExportEntries(manifest);
  if (entries.length === 0) {
    throw new Error(
      `${manifest.name ?? packageDir.name} has no portable entry`
    );
  }
  for (const entry of entries) {
    const entryPath = resolve(packagesRoot, packageDir.name, entry.target);
    if (!existsSync(entryPath)) {
      throw new Error(
        `${manifest.name ?? packageDir.name} portable export ${entry.exportName} does not exist: ${entry.target}`
      );
    }
    portableEntries.push({
      name: `${manifest.name ?? packageDir.name}${entry.exportName === '.' ? '' : entry.exportName.slice(1)}`,
      path: entryPath,
    });
  }
}

const forbiddenSpecifier = /^(?:bun:|node:|pg(?:\/|$)|stripe$)/u;
const staticImport =
  /(?:import\s+(?:[^"'()]*?\s+from\s+)?|export\s+[^"']*?\s+from\s+)["']([^"']+)["']/gu;

for (const entry of portableEntries) {
  const source = readFileSync(entry.path, 'utf8');
  for (const match of source.matchAll(staticImport)) {
    const specifier = match[1];
    if (specifier && forbiddenSpecifier.test(specifier)) {
      throw new Error(
        `${entry.name} contains server-only static import ${specifier}`
      );
    }
  }
}

const imports = portableEntries
  .map(
    entry =>
      `try { await import(${JSON.stringify(entry.path)}); } ` +
      `catch (error) { console.error(${JSON.stringify(`Portable import failed for ${entry.name}`)}); throw error; }`
  )
  .join('\n');
const script = `
// Materialize Node's lazy Web API globals before removing Node-only globals.
// The packages are tested against the Web APIs themselves; Node's internal
// undici implementation happens to allocate Buffer while its getters load.
void globalThis.Headers;
void globalThis.Request;
void globalThis.Response;
void globalThis.FormData;
void globalThis.Blob;
delete globalThis.Buffer;
Object.defineProperty(globalThis, 'process', {
  value: undefined,
  configurable: true,
});
${imports}
`;
const child = Bun.spawn(['node', '--input-type=module', '--eval', script], {
  cwd: repoRoot,
  stdout: 'inherit',
  stderr: 'inherit',
});
const exitCode = await child.exited;
if (exitCode !== 0) {
  throw new Error(`Node portability import failed with exit code ${exitCode}`);
}

console.log(
  `Verified ${portableEntries.length} portable public entr${
    portableEntries.length === 1 ? 'y' : 'ies'
  } without server-only globals.`
);
