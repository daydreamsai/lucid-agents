import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export type DependencyBlock =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

export type PackageTarget =
  | string
  | null
  | PackageTarget[]
  | { [condition: string]: PackageTarget };

export type PackageManifest = {
  name?: string;
  version?: string;
  private?: boolean;
  main?: string;
  module?: string;
  types?: string;
  typings?: string;
  bin?: string | Record<string, string>;
  exports?: PackageTarget;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

export type ValidPackageManifest = PackageManifest & {
  name: string;
  version: string;
};

export type WorkspacePackage = {
  dir: string;
  manifestPath: string;
  manifest: ValidPackageManifest;
};

export type PackedArtifact = {
  name: string;
  version: string;
  files: ReadonlySet<string>;
};

const DEPENDENCY_BLOCKS: readonly DependencyBlock[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

type RootManifest = {
  workspaces?: string[] | { packages?: string[] };
};

function parseJsonObject(filePath: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Invalid JSON in workspace manifest ${filePath}: ${(error as Error).message}`
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Workspace manifest ${filePath} must contain a JSON object`
    );
  }
  return parsed as Record<string, unknown>;
}

function workspacePatterns(rootManifest: RootManifest): string[] {
  const workspaces = rootManifest.workspaces;
  const patterns = Array.isArray(workspaces)
    ? workspaces
    : workspaces?.packages;
  if (
    !Array.isArray(patterns) ||
    patterns.length === 0 ||
    patterns.some(pattern => typeof pattern !== 'string' || !pattern.trim())
  ) {
    throw new Error(
      'Root package.json must declare a non-empty workspaces package list'
    );
  }
  return patterns;
}

function segmentMatcher(segment: string): RegExp {
  let source = '^';
  for (const character of segment) {
    if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    }
  }
  return new RegExp(`${source}$`, 'u');
}

function expandWorkspacePattern(
  repoRoot: string,
  rawPattern: string
): string[] {
  const pattern = rawPattern.replaceAll('\\', '/').replace(/\/+$/u, '');
  if (
    !pattern ||
    path.posix.isAbsolute(pattern) ||
    pattern.split('/').some(segment => segment === '..')
  ) {
    throw new Error(`Unsafe workspace pattern "${rawPattern}"`);
  }
  if (pattern.includes('**') || pattern.startsWith('!')) {
    throw new Error(
      `Unsupported workspace pattern "${rawPattern}"; use explicit paths and single-segment * or ? wildcards`
    );
  }

  let candidates = [repoRoot];
  for (const segment of pattern.split('/').filter(Boolean)) {
    const matcher = segmentMatcher(segment);
    const next: string[] = [];
    for (const candidate of candidates) {
      if (!existsSync(candidate) || !statSync(candidate).isDirectory()) {
        continue;
      }
      for (const entry of readdirSync(candidate, { withFileTypes: true })) {
        if (entry.isDirectory() && matcher.test(entry.name)) {
          next.push(path.join(candidate, entry.name));
        }
      }
    }
    candidates = next;
  }

  if (candidates.length === 0) {
    throw new Error(`Workspace pattern "${rawPattern}" matched no directories`);
  }
  return candidates;
}

function validateManifest(
  manifestPath: string,
  raw: Record<string, unknown>
): ValidPackageManifest {
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    throw new Error(`Workspace manifest ${manifestPath} is missing a name`);
  }
  if (typeof raw.version !== 'string' || !raw.version.trim()) {
    throw new Error(`Workspace manifest ${manifestPath} is missing a version`);
  }
  if (raw.private !== undefined && typeof raw.private !== 'boolean') {
    throw new Error(
      `Workspace manifest ${manifestPath} has a non-boolean private field`
    );
  }
  return raw as ValidPackageManifest;
}

export function discoverWorkspacePackages(
  repoRoot: string
): WorkspacePackage[] {
  const rootManifestPath = path.join(repoRoot, 'package.json');
  if (!existsSync(rootManifestPath)) {
    throw new Error(`Root package.json not found at ${rootManifestPath}`);
  }
  const rootManifest = parseJsonObject(rootManifestPath) as RootManifest;
  const directories = new Set<string>();

  for (const pattern of workspacePatterns(rootManifest)) {
    for (const directory of expandWorkspacePattern(repoRoot, pattern)) {
      directories.add(path.resolve(directory));
    }
  }

  const packages = [...directories].sort().map(dir => {
    const manifestPath = path.join(dir, 'package.json');
    if (!existsSync(manifestPath)) {
      throw new Error(
        `Workspace directory ${dir} is missing its package.json manifest`
      );
    }
    const manifest = validateManifest(
      manifestPath,
      parseJsonObject(manifestPath)
    );
    return { dir, manifestPath, manifest };
  });

  const byName = new Map<string, string>();
  for (const workspace of packages) {
    const existing = byName.get(workspace.manifest.name);
    if (existing) {
      throw new Error(
        `Duplicate workspace package name "${workspace.manifest.name}" in ${existing} and ${workspace.manifestPath}`
      );
    }
    byName.set(workspace.manifest.name, workspace.manifestPath);
  }

  return packages;
}

export function assertNoUnresolvedDependencyProtocols(
  manifest: PackageManifest
): void {
  for (const block of DEPENDENCY_BLOCKS) {
    for (const [dependency, range] of Object.entries(manifest[block] ?? {})) {
      if (
        typeof range === 'string' &&
        (range.startsWith('workspace:') || range.startsWith('catalog:'))
      ) {
        throw new Error(
          `Package ${manifest.name ?? '<unnamed>'} still has unresolved ${block}.${dependency} range "${range}"`
        );
      }
    }
  }
}

type PackJsonFile = { path?: unknown };
type PackJsonEntry = {
  name?: unknown;
  version?: unknown;
  files?: unknown;
};

export function parseNpmPackDryRun(
  output: string,
  expectedPackageName: string
): PackedArtifact {
  let raw: unknown;
  try {
    raw = JSON.parse(output);
  } catch (error) {
    throw new Error(
      `npm pack --dry-run returned invalid JSON for ${expectedPackageName}: ${(error as Error).message}`
    );
  }
  if (!Array.isArray(raw) || raw.length !== 1) {
    throw new Error(
      `npm pack --dry-run must return exactly one artifact for ${expectedPackageName}`
    );
  }
  const entry = raw[0] as PackJsonEntry;
  if (
    typeof entry.name !== 'string' ||
    typeof entry.version !== 'string' ||
    !Array.isArray(entry.files)
  ) {
    throw new Error(
      `npm pack --dry-run returned an incomplete artifact for ${expectedPackageName}`
    );
  }

  const files = new Set<string>();
  for (const file of entry.files as PackJsonFile[]) {
    if (!file || typeof file.path !== 'string' || !file.path.trim()) {
      throw new Error(
        `npm pack --dry-run returned an invalid file entry for ${expectedPackageName}`
      );
    }
    files.add(normalizePackageTarget(file.path));
  }
  return { name: entry.name, version: entry.version, files };
}

function normalizePackageTarget(target: string): string {
  return target.replace(/^\.\/+/u, '').replace(/^package\//u, '');
}

function targetMatchesPackedFile(
  target: string,
  files: ReadonlySet<string>
): boolean {
  const normalized = normalizePackageTarget(target);
  if (!normalized || normalized.startsWith('../') || path.isAbsolute(target)) {
    return false;
  }
  if (!normalized.includes('*')) return files.has(normalized);

  const expression = new RegExp(
    `^${normalized
      .split('*')
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
      .join('[^/]+')}$`,
    'u'
  );
  return [...files].some(file => expression.test(file));
}

function collectExportTargets(
  value: PackageTarget | undefined,
  output: string[]
): void {
  if (typeof value === 'string') {
    output.push(value);
    return;
  }
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectExportTargets(item, output);
    return;
  }
  for (const item of Object.values(value)) {
    collectExportTargets(item, output);
  }
}

export function assertPackedManifestTargets(
  manifest: PackageManifest,
  files: ReadonlySet<string>
): void {
  const targets: Array<{ field: string; target: string }> = [];
  for (const field of ['main', 'module', 'types', 'typings'] as const) {
    const target = manifest[field];
    if (target) targets.push({ field, target });
  }

  if (typeof manifest.bin === 'string') {
    targets.push({ field: 'bin', target: manifest.bin });
  } else if (manifest.bin) {
    for (const [command, target] of Object.entries(manifest.bin)) {
      targets.push({ field: `bin.${command}`, target });
    }
  }

  const exportTargets: string[] = [];
  collectExportTargets(manifest.exports, exportTargets);
  for (const target of exportTargets) {
    targets.push({ field: 'exports', target });
  }

  for (const { field, target } of targets) {
    if (!targetMatchesPackedFile(target, files)) {
      throw new Error(
        `Packed artifact for ${manifest.name ?? '<unnamed>'} is missing ${field} target "${target}"`
      );
    }
  }
}

export function assertExactPublicArtifactSet(
  workspaces: readonly WorkspacePackage[],
  artifacts: readonly PackedArtifact[]
): void {
  const expected = new Map(
    workspaces
      .filter(workspace => !workspace.manifest.private)
      .map(workspace => [workspace.manifest.name, workspace.manifest.version])
  );
  const actual = new Map<string, string>();

  for (const artifact of artifacts) {
    if (actual.has(artifact.name)) {
      throw new Error(`Duplicate packed artifact for ${artifact.name}`);
    }
    actual.set(artifact.name, artifact.version);
  }

  const missing = [...expected.keys()].filter(name => !actual.has(name));
  const unexpected = [...actual.keys()].filter(name => !expected.has(name));
  const versionMismatches = [...expected].flatMap(([name, version]) => {
    const packedVersion = actual.get(name);
    return packedVersion && packedVersion !== version
      ? [`${name}: expected ${version}, packed ${packedVersion}`]
      : [];
  });

  if (missing.length || unexpected.length || versionMismatches.length) {
    throw new Error(
      [
        missing.length ? `missing: ${missing.sort().join(', ')}` : '',
        unexpected.length ? `unexpected: ${unexpected.sort().join(', ')}` : '',
        versionMismatches.length
          ? `version mismatch: ${versionMismatches.sort().join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('; ')
        .replace(/^/u, 'Packed artifact set does not match public workspaces: ')
    );
  }
}
