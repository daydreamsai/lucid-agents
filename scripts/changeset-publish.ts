import { readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  describeNpmAccessFailure,
  describeNpmPublishFailure,
  getPackageScope,
  partitionPublishArgs,
} from './changeset-publish-utils';
import {
  assertExactPublicArtifactSet,
  assertNoUnresolvedDependencyProtocols,
  assertPackedManifestTargets,
  discoverWorkspacePackages,
  parseNpmPackDryRun,
} from './release-artifacts';
import type {
  DependencyBlock,
  PackageManifest,
  WorkspacePackage,
} from './release-artifacts';

type Backup = {
  path: string;
  contents: string;
};

type ExecResult = {
  code: number;
  output: string;
  stdout: string;
  stderr: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const rootPkgPath = path.join(repoRoot, 'package.json');
if (!existsSync(rootPkgPath)) {
  throw new Error('package.json not found at repository root');
}

const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8')) as {
  workspaces?: { catalog?: Record<string, string> };
};

const catalogVersions = rootPkg.workspaces?.catalog ?? {};
const packages = discoverWorkspacePackages(repoRoot);
const packagesByName = new Map<string, WorkspacePackage>();
for (const pkg of packages) {
  packagesByName.set(pkg.manifest.name, pkg);
}

function needsSanitise(manifest: PackageManifest): boolean {
  const blocks: DependencyBlock[] = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];
  return blocks.some(block => {
    const record = manifest[block];
    if (!record) return false;
    return Object.values(record).some(
      value =>
        typeof value === 'string' &&
        (value.startsWith('workspace:') || value === 'catalog:')
    );
  });
}

function deriveWorkspaceRange(raw: string, version: string): string {
  const remainder = raw.slice('workspace:'.length).trim();
  if (!remainder || remainder === '*') return `^${version}`;
  if (remainder === '^') return `^${version}`;
  if (remainder === '~') return `~${version}`;
  if (remainder.startsWith('^') || remainder.startsWith('~')) {
    return `${remainder[0]}${version}`;
  }
  if (/^(>=|<=|>|<|=)/.test(remainder)) {
    return `${remainder}${version}`;
  }
  if (/^[0-9]/.test(remainder)) {
    return remainder;
  }
  return `^${version}`;
}

function sanitiseManifest(info: WorkspacePackage): {
  changed: boolean;
  next: WorkspacePackage['manifest'];
} {
  const blocks: DependencyBlock[] = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];
  const next = JSON.parse(
    JSON.stringify(info.manifest)
  ) as WorkspacePackage['manifest'];
  let changed = false;

  for (const block of blocks) {
    const record = next[block];
    if (!record) continue;
    for (const [dep, value] of Object.entries(record)) {
      if (typeof value !== 'string') continue;
      if (value.startsWith('workspace:')) {
        const target = packagesByName.get(dep);
        if (!target) {
          throw new Error(
            `Unable to resolve workspace dependency \"${dep}\" for package \"${info.manifest.name}\"`
          );
        }
        const normalized = deriveWorkspaceRange(value, target.manifest.version);
        if (normalized !== value) {
          record[dep] = normalized;
          changed = true;
        }
      } else if (value === 'catalog:') {
        const catalogVersion = catalogVersions[dep];
        if (!catalogVersion) {
          throw new Error(
            `Missing catalog version for \"${dep}\" (referenced by ${info.manifest.name})`
          );
        }
        record[dep] = catalogVersion;
        changed = true;
      }
    }
  }

  return { changed, next };
}

function writeManifestWithBackup(
  pathToFile: string,
  manifest: PackageManifest,
  backups: Backup[]
) {
  const original = readFileSync(pathToFile, 'utf8');
  backups.push({ path: pathToFile, contents: original });
  writeFileSync(pathToFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

function restoreBackups(backups: Backup[]) {
  for (const backup of backups) {
    writeFileSync(backup.path, backup.contents, 'utf8');
  }
}

async function verifyNpmPublishAccess() {
  if (process.env.LUCID_SKIP_NPM_PUBLISH_PREFLIGHT === '1') {
    console.log(
      'Skipping npm publish preflight via LUCID_SKIP_NPM_PUBLISH_PREFLIGHT=1'
    );
    return;
  }

  const publicPackages = packages
    .filter(pkg => !pkg.manifest.private && pkg.manifest.name)
    .sort((a, b) =>
      (a.manifest.name ?? '').localeCompare(b.manifest.name ?? '')
    );
  const scopes = new Set<string>();

  for (const pkg of publicPackages) {
    const scope = pkg.manifest.name
      ? getPackageScope(pkg.manifest.name)
      : undefined;
    if (scope) scopes.add(scope);
  }

  if (!scopes.size) return;

  const auth = await exec(['npm', 'whoami'], { allowFailure: true });
  if (auth.code !== 0) {
    const scope = scopes.values().next().value ?? 'the configured npm scope';
    const message =
      describeNpmAccessFailure({ output: auth.output, scope }) ??
      `npm publish preflight failed before publishing ${scope} packages.`;
    throw new Error(message);
  }

  for (const scope of scopes) {
    const probe = await findPublishedPackageForScope(publicPackages, scope);
    if (!probe) {
      console.warn(
        `Skipping npm collaborator preflight for ${scope}: no existing published package found to probe.`
      );
      continue;
    }

    const access = await exec(
      ['npm', 'access', 'list', 'collaborators', probe, '--json'],
      { allowFailure: true }
    );
    if (access.code !== 0) {
      const message =
        describeNpmAccessFailure({
          output: access.output,
          packageName: probe,
          scope,
        }) ??
        `npm publish preflight failed while checking collaborator access for ${probe}.`;
      throw new Error(message);
    }
  }
}

async function findPublishedPackageForScope(
  candidates: WorkspacePackage[],
  scope: string
): Promise<string | undefined> {
  for (const pkg of candidates) {
    const name = pkg.manifest.name;
    if (!name || getPackageScope(name) !== scope) continue;
    const view = await exec(['npm', 'view', name, 'version', '--json'], {
      allowFailure: true,
    });
    if (view.code === 0) return name;
  }
  return undefined;
}

async function verifyPackageArtifacts(options: { simulatePublish: boolean }) {
  const publicPackages = packages
    .filter(pkg => !pkg.manifest.private)
    .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  const artifacts = [];

  for (const pkg of publicPackages) {
    const packed = await exec(['npm', 'pack', '--dry-run', '--json', pkg.dir], {
      allowFailure: true,
      quiet: true,
    });
    if (packed.code !== 0) {
      throw new Error(
        `npm pack --dry-run failed for ${pkg.manifest.name ?? pkg.dir}\n${packed.output}`
      );
    }
    const artifact = parseNpmPackDryRun(packed.stdout, pkg.manifest.name);
    if (
      artifact.name !== pkg.manifest.name ||
      artifact.version !== pkg.manifest.version
    ) {
      throw new Error(
        `npm pack --dry-run identity mismatch for ${pkg.manifest.name}@${pkg.manifest.version}: packed ${artifact.name}@${artifact.version}`
      );
    }
    assertPackedManifestTargets(pkg.manifest, artifact.files);
    artifacts.push(artifact);

    if (options.simulatePublish) {
      const simulatedPublish = await exec(
        ['npm', 'publish', '--dry-run', '--json', pkg.dir],
        {
          allowFailure: true,
          quiet: true,
        }
      );
      if (simulatedPublish.code !== 0) {
        throw new Error(
          `npm publish --dry-run failed for ${pkg.manifest.name ?? pkg.dir}\n${simulatedPublish.output}`
        );
      }
    }
  }
  assertExactPublicArtifactSet(packages, artifacts);

  console.log(
    options.simulatePublish
      ? `Release dry run packed and simulated publishing ${publicPackages.length} package artifacts without publishing.`
      : `Verified ${publicPackages.length} exact package artifacts for live publication.`
  );
}

async function runPublish() {
  const parsedArgs = partitionPublishArgs(process.argv.slice(2));
  if (!parsedArgs.dryRun && !parsedArgs.preflightOnly) {
    await verifyLivePublishAuthority();
  }

  const backups: Backup[] = [];
  const sanitisedPackages: string[] = [];

  try {
    for (const pkg of packages) {
      if (!needsSanitise(pkg.manifest)) continue;
      const { changed, next } = sanitiseManifest(pkg);
      if (!changed) continue;
      writeManifestWithBackup(pkg.manifestPath, next, backups);
      pkg.manifest = next;
      sanitisedPackages.push(pkg.manifest.name);
    }

    for (const pkg of packages) {
      assertNoUnresolvedDependencyProtocols(pkg.manifest);
    }

    if (sanitisedPackages.length) {
      console.log(
        'Sanitised workspace/catalog dependencies for:',
        sanitisedPackages.join(', ')
      );
    } else {
      console.log(
        'No workspace or catalog dependencies required sanitisation.'
      );
    }

    if (parsedArgs.dryRun) {
      await verifyPackageArtifacts({ simulatePublish: true });
      return;
    }

    await verifyNpmPublishAccess();
    if (parsedArgs.preflightOnly) {
      console.log('npm publish preflight succeeded.');
      return;
    }

    const extraArgs = parsedArgs.passthroughArgs;
    await verifyPackageArtifacts({ simulatePublish: false });
    await verifyLivePublishAuthority();
    const publish = await exec(
      ['bun', 'x', 'changeset', 'publish', ...extraArgs],
      {
        allowFailure: true,
      }
    );
    if (publish.code !== 0) {
      const scope = packages
        .map(pkg => pkg.manifest.name)
        .find((name): name is string => Boolean(name))
        ?.match(/^@[^/]+/)?.[0];
      const message =
        scope && describeNpmPublishFailure({ output: publish.output, scope });
      if (message) {
        throw new Error(
          `${message}\n\nbun x changeset publish exited with code ${publish.code}`
        );
      }
      throw new Error(
        `bun x changeset publish exited with code ${publish.code}`
      );
    }
  } finally {
    if (backups.length) {
      restoreBackups(backups);
      console.log(
        'Restored workspace dependency manifest values after publish.'
      );
    }
  }
}

async function verifyLivePublishAuthority(): Promise<void> {
  const verification = await exec(
    ['bun', 'run', 'scripts/release-policy.ts', 'verify-publish'],
    { allowFailure: true }
  );
  if (verification.code !== 0) {
    throw new Error(
      'Live publication requires the exact current master commit, its successful required CI gate, and release-workflow attestation.'
    );
  }
}

async function exec(
  argv: string[],
  opts: { allowFailure?: boolean; quiet?: boolean } = {}
): Promise<ExecResult> {
  const proc = Bun.spawn(argv, {
    cwd: repoRoot,
    stdin: 'inherit',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, code] = await Promise.all([
    proc.stdout ? new Response(proc.stdout).text() : '',
    proc.stderr ? new Response(proc.stderr).text() : '',
    proc.exited,
  ]);

  if (!opts.quiet && stdout) process.stdout.write(stdout);
  if (!opts.quiet && stderr) process.stderr.write(stderr);

  const output = [stdout, stderr].filter(Boolean).join('\n');
  if (code !== 0 && !opts.allowFailure) {
    throw new Error(`${argv.join(' ')} exited with code ${code}`);
  }

  return { code, output, stdout, stderr };
}

await runPublish().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
