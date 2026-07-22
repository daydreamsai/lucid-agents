import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, join, relative, resolve, sep } from 'node:path';

export type LucidDependencySource =
  | 'registry'
  | 'workspace'
  | 'link'
  | 'file'
  | 'other';

export type LucidProjectInspection = {
  projectRoot: string;
  channel: 'stable' | 'next' | 'mixed' | 'unknown';
  packages: Array<{
    name: string;
    source: LucidDependencySource;
    version: string;
  }>;
  adapters: string[];
  extensions: string[];
  serviceUiConfig: string | null;
  blockingWarnings: string[];
};

type ReleaseIndex = {
  current: string;
  releases: Record<
    string,
    {
      releasedAt: string;
      sourceCommit?: string;
      treeSha256?: string;
      evalSuiteSha256?: string;
    }
  >;
};

type SkillFile = {
  absolutePath: string;
  path: string;
  bytes: Buffer;
};

const adapterPackages = new Map([
  ['@lucid-agents/express', 'express'],
  ['@lucid-agents/hono', 'hono'],
  ['@lucid-agents/tanstack', 'tanstack'],
]);

const nonExtensionPackages = new Set([
  '@lucid-agents/api-sdk',
  '@lucid-agents/cli',
  '@lucid-agents/core',
  '@lucid-agents/deploy',
  '@lucid-agents/express',
  '@lucid-agents/hono',
  '@lucid-agents/tanstack',
  '@lucid-agents/types',
]);

function dependencySource(version: string): LucidDependencySource {
  if (version.startsWith('workspace:')) return 'workspace';
  if (version.startsWith('link:')) return 'link';
  if (version.startsWith('file:')) return 'file';
  if (/^(?:\^|~|>=?|<=?|=)?\d/u.test(version)) return 'registry';
  return 'other';
}

export async function inspectLucidProject(
  projectRoot: string
): Promise<LucidProjectInspection> {
  const root = resolve(projectRoot);
  const packageJson = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8')
  ) as Record<string, unknown>;
  const dependencies = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ].reduce<Record<string, string>>((all, key) => {
    const group = packageJson[key];
    if (group && typeof group === 'object') {
      for (const [name, value] of Object.entries(group)) {
        if (typeof value === 'string') all[name] = value;
      }
    }
    return all;
  }, {});

  const packages = Object.entries(dependencies)
    .filter(([name]) => name.startsWith('@lucid-agents/'))
    .map(([name, version]) => ({
      name,
      source: dependencySource(version),
      version,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const hasRegistry = packages.some(item => item.source === 'registry');
  const hasLocal = packages.some(item =>
    ['workspace', 'link', 'file'].includes(item.source)
  );
  const hasAmbiguous = packages.some(item => item.source === 'other');
  const channel =
    packages.length === 0
      ? 'unknown'
      : hasAmbiguous
        ? 'unknown'
        : hasRegistry && hasLocal
          ? 'mixed'
          : hasLocal
            ? 'next'
            : hasRegistry
              ? 'stable'
              : 'unknown';
  const blockingWarnings = hasAmbiguous
    ? [
        'Lucid dependencies include unsupported or ambiguous sources. Pin registry versions or use one local/workspace channel before editing.',
      ]
    : channel === 'mixed'
      ? [
          'Lucid dependencies mix local/workspace and registry sources. Select one release channel before editing.',
        ]
      : [];
  const adapters = packages
    .map(item => adapterPackages.get(item.name))
    .filter((value): value is string => Boolean(value))
    .sort();
  const extensions = packages
    .filter(item => !nonExtensionPackages.has(item.name))
    .map(item => item.name.slice('@lucid-agents/'.length))
    .sort();
  let serviceUiConfig: string | null = null;
  for (const name of ['service-ui.config.ts', 'service-ui.config.js']) {
    try {
      const candidate = join(root, name);
      if ((await lstat(candidate)).isFile()) {
        serviceUiConfig = candidate;
        break;
      }
    } catch {
      // Optional project file.
    }
  }

  return {
    projectRoot: root,
    channel,
    packages,
    adapters,
    extensions,
    serviceUiConfig,
    blockingWarnings,
  };
}

function parseFrontmatter(source: string): Record<string, string> | null {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(source);
  if (!match) return null;
  const values: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    values[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/gu, '');
  }
  return values;
}

async function collectSkillFiles(root: string): Promise<SkillFile[]> {
  const files: SkillFile[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Symbolic links are not allowed in skill releases: ${absolutePath}`
        );
      }
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        const path = relative(root, absolutePath).split(sep).join('/');
        files.push({ absolutePath, path, bytes: await readFile(absolutePath) });
      }
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function validateSkillDirectory(root: string): Promise<string[]> {
  const errors: string[] = [];
  const skillRoot = resolve(root);
  let files: SkillFile[] = [];
  try {
    files = await collectSkillFiles(skillRoot);
  } catch (error) {
    return [(error as Error).message];
  }
  const skillFile = files.find(file => file.path === 'SKILL.md');
  if (!skillFile) return ['SKILL.md is required.'];
  const source = skillFile.bytes.toString('utf8');
  const frontmatter = parseFrontmatter(source);
  if (!frontmatter) return ['SKILL.md must begin with YAML frontmatter.'];
  const keys = Object.keys(frontmatter).sort();
  if (keys.join(',') !== 'description,name') {
    errors.push('SKILL.md frontmatter must contain only name and description.');
  }
  if (frontmatter.name !== 'lucid-agents') {
    errors.push('Skill name must be lucid-agents.');
  }
  if (!frontmatter.description || frontmatter.description.length > 1024) {
    errors.push('Skill description must be between 1 and 1024 characters.');
  }
  if (source.split('\n').length > 500) {
    errors.push('SKILL.md must not exceed 500 lines.');
  }
  const links = source.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu);
  for (const match of links) {
    const target = match[1].split('#')[0];
    if (!target || /^(?:https?:|mailto:)/u.test(target)) continue;
    const resolvedTarget = resolve(skillRoot, target);
    if (!resolvedTarget.startsWith(`${skillRoot}${sep}`)) {
      errors.push(`Reference escapes the skill directory: ${target}`);
      continue;
    }
    try {
      if (!(await lstat(resolvedTarget)).isFile()) {
        errors.push(`Referenced path is not a file: ${target}`);
      }
    } catch {
      errors.push(`Referenced file does not exist: ${target}`);
    }
  }
  return errors;
}

function comparableFiles(files: SkillFile[]): Array<{
  path: string;
  sha256: string;
}> {
  return files.map(file => ({ path: file.path, sha256: sha256(file.bytes) }));
}

function treeDigest(files: SkillFile[]): string {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(sha256(file.bytes));
    hash.update('\n');
  }
  return hash.digest('hex');
}

export async function computeSkillTreeDigest(root: string): Promise<string> {
  return treeDigest(await collectSkillFiles(resolve(root)));
}

async function computeCommittedSkillTreeDigest(
  repoRoot: string,
  sourceCommit: string
): Promise<string> {
  const prefix = '.agents/skills/lucid-agents/';
  const listing = Bun.spawnSync({
    cmd: [
      'git',
      'ls-tree',
      '-r',
      '--name-only',
      sourceCommit,
      '--',
      '.agents/skills/lucid-agents',
    ],
    cwd: repoRoot,
  });
  if (listing.exitCode !== 0) {
    throw new Error(`Unable to read skill source commit ${sourceCommit}.`);
  }
  const paths = listing.stdout.toString().trim().split('\n').filter(Boolean);
  const files: SkillFile[] = [];
  for (const gitPath of paths) {
    const content = Bun.spawnSync({
      cmd: ['git', 'show', `${sourceCommit}:${gitPath}`],
      cwd: repoRoot,
    });
    if (content.exitCode !== 0 || !gitPath.startsWith(prefix)) {
      throw new Error(
        `Unable to read ${gitPath} from skill source commit ${sourceCommit}.`
      );
    }
    files.push({
      absolutePath: gitPath,
      path: gitPath.slice(prefix.length),
      bytes: Buffer.from(content.stdout),
    });
  }
  return treeDigest(files.sort((a, b) => a.path.localeCompare(b.path)));
}

export function assertCleanSkillSource(statusOutput: string): void {
  if (statusOutput.trim()) {
    throw new Error(
      'Commit canonical Lucid skill changes before cutting a release so sourceCommit contains the released bytes.'
    );
  }
}

export async function validateSkillReleaseState(options: {
  canonicalRoot: string;
  releasesRoot: string;
  repoRoot?: string;
  evalSuitePath?: string;
}): Promise<string[]> {
  const errors = await validateSkillDirectory(options.canonicalRoot);
  const index = JSON.parse(
    await readFile(join(options.releasesRoot, 'releases.json'), 'utf8')
  ) as ReleaseIndex;
  const version = (
    await readFile(join(options.canonicalRoot, 'VERSION'), 'utf8')
  ).trim();
  if (options.evalSuitePath && index.releases[index.current]) {
    const evalSuiteSha256 = sha256(await readFile(options.evalSuitePath));
    if (index.releases[index.current].evalSuiteSha256 !== evalSuiteSha256) {
      errors.push(
        'Current eval suite differs from the digest recorded by the current release.'
      );
    }
  }
  if (version !== index.current) {
    errors.push(
      `Canonical VERSION ${version} does not match current release ${index.current}.`
    );
  }
  for (const release of Object.keys(index.releases).sort()) {
    if (!/^\d+\.\d+\.\d+$/u.test(release)) {
      errors.push(
        `${release}: release directory must use semantic versioning.`
      );
    }
    if (!/^[a-f0-9]{40}$/u.test(index.releases[release].sourceCommit ?? '')) {
      errors.push(`${release}: sourceCommit must be a full lowercase Git SHA.`);
    }
    const releaseRoot = join(options.releasesRoot, release);
    const expectedTree = index.releases[release].treeSha256;
    if (!/^[a-f0-9]{64}$/u.test(expectedTree ?? '')) {
      errors.push(`${release}: treeSha256 must be a lowercase SHA-256 digest.`);
    } else if ((await computeSkillTreeDigest(releaseRoot)) !== expectedTree) {
      errors.push(`${release}: immutable snapshot does not match treeSha256.`);
    }
    if (
      !/^[a-f0-9]{64}$/u.test(index.releases[release].evalSuiteSha256 ?? '')
    ) {
      errors.push(
        `${release}: evalSuiteSha256 must be a lowercase SHA-256 digest.`
      );
    }
    if (options.repoRoot && index.releases[release].sourceCommit) {
      try {
        const committedTree = await computeCommittedSkillTreeDigest(
          options.repoRoot,
          index.releases[release].sourceCommit
        );
        if (committedTree !== expectedTree) {
          errors.push(
            `${release}: sourceCommit does not contain the recorded immutable snapshot.`
          );
        }
      } catch (error) {
        errors.push(`${release}: ${(error as Error).message}`);
      }
    }
    errors.push(
      ...(await validateSkillDirectory(releaseRoot)).map(
        error => `${release}: ${error}`
      )
    );
  }
  if (index.releases[index.current]) {
    const canonical = comparableFiles(
      await collectSkillFiles(resolve(options.canonicalRoot))
    );
    const released = comparableFiles(
      await collectSkillFiles(
        join(resolve(options.releasesRoot), index.current)
      )
    );
    if (JSON.stringify(canonical) !== JSON.stringify(released)) {
      errors.push(
        'Canonical skill differs from the current immutable snapshot. Cut a new skill release.'
      );
    }
  }
  return errors;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeOctal(
  header: Buffer,
  value: number,
  offset: number,
  length: number
): void {
  const text = value.toString(8).padStart(length - 1, '0') + '\0';
  header.write(text, offset, length, 'ascii');
}

function createTar(files: SkillFile[]): Buffer {
  const records: Buffer[] = [];
  for (const file of files) {
    const name = `lucid-agents/${file.path}`;
    if (Buffer.byteLength(name) > 100) {
      throw new Error(
        `Skill path is too long for the release archive: ${name}`
      );
    }
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf8');
    writeOctal(header, 0o644, 100, 8);
    writeOctal(header, 0, 108, 8);
    writeOctal(header, 0, 116, 8);
    writeOctal(header, file.bytes.length, 124, 12);
    writeOctal(header, 0, 136, 12);
    header.fill(0x20, 148, 156);
    header.write('0', 156, 1, 'ascii');
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    const checksumText = checksum.toString(8).padStart(6, '0') + '\0 ';
    header.write(checksumText, 148, 8, 'ascii');
    records.push(header, file.bytes);
    const padding = (512 - (file.bytes.length % 512)) % 512;
    if (padding > 0) records.push(Buffer.alloc(padding));
  }
  records.push(Buffer.alloc(1024));
  return Buffer.concat(records);
}

async function copyCurrentAliases(
  versionRoot: string,
  outputRoot: string,
  names: string[]
): Promise<void> {
  await Promise.all(
    names.map(async name => {
      await writeFile(
        join(outputRoot, name),
        await readFile(join(versionRoot, name))
      );
    })
  );
}

function renderSkillInstaller(version: string): string {
  if (!/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error(`Invalid Lucid skill version: ${version}`);
  }

  return [
    '#!/bin/sh',
    'set -eu',
    '',
    `lucid_skill_version='${version}'`,
    `lucid_skill_base='https://docs.daydreams.systems/skills/lucid-agents/${version}'`,
    "lucid_skill_stage=''",
    "lucid_skill_backup=''",
    'lucid_skill_cleanup() {',
    '  lucid_skill_status=$?',
    '  trap - EXIT HUP INT TERM',
    '  if [ -n "$lucid_skill_backup" ] && [ -e "$lucid_skill_backup" ] && [ ! -e .agents/skills/lucid-agents ]; then',
    '    mv "$lucid_skill_backup" .agents/skills/lucid-agents',
    '  fi',
    '  if [ -n "$lucid_skill_stage" ]; then',
    '    rm -rf "$lucid_skill_stage"',
    '  fi',
    '  exit "$lucid_skill_status"',
    '}',
    'trap lucid_skill_cleanup EXIT',
    "trap 'exit 129' HUP",
    "trap 'exit 130' INT",
    "trap 'exit 143' TERM",
    '',
    'for lucid_skill_command in curl tar node mktemp; do',
    '  if ! command -v "$lucid_skill_command" >/dev/null 2>&1; then',
    '    printf \'Lucid Agents skill installer requires %s.\\n\' "$lucid_skill_command" >&2',
    '    exit 1',
    '  fi',
    'done',
    'if [ ! -f package.json ]; then',
    "  printf 'Run the Lucid Agents skill installer from a project root containing package.json.\\n' >&2",
    '  exit 1',
    'fi',
    '',
    'mkdir -p .agents/skills',
    'lucid_skill_stage="$(mktemp -d .agents/skills/.lucid-agents-install.XXXXXX)"',
    'lucid_skill_backup=".agents/skills/.lucid-agents-backup.$$"',
    'test ! -e "$lucid_skill_backup"',
    'curl -fsSLo "$lucid_skill_stage/lucid-agents.tar.gz" "$lucid_skill_base/lucid-agents.tar.gz"',
    'curl -fsSLo "$lucid_skill_stage/lucid-agents.tar.gz.sha256" "$lucid_skill_base/lucid-agents.tar.gz.sha256"',
    'if command -v shasum >/dev/null 2>&1; then',
    '  (cd "$lucid_skill_stage" && shasum -a 256 -c lucid-agents.tar.gz.sha256)',
    'elif command -v sha256sum >/dev/null 2>&1; then',
    '  (cd "$lucid_skill_stage" && sha256sum -c lucid-agents.tar.gz.sha256)',
    'else',
    "  printf 'Lucid Agents skill installer requires shasum or sha256sum.\\n' >&2",
    '  exit 1',
    'fi',
    'mkdir "$lucid_skill_stage/extracted"',
    'tar -xzf "$lucid_skill_stage/lucid-agents.tar.gz" -C "$lucid_skill_stage/extracted"',
    'test "$(cat "$lucid_skill_stage/extracted/lucid-agents/VERSION")" = "$lucid_skill_version"',
    'node "$lucid_skill_stage/extracted/lucid-agents/scripts/inspect-project.mjs" .',
    'if [ -e .agents/skills/lucid-agents ]; then',
    '  mv .agents/skills/lucid-agents "$lucid_skill_backup"',
    'fi',
    'mv "$lucid_skill_stage/extracted/lucid-agents" .agents/skills/lucid-agents',
    'rm -rf "$lucid_skill_backup"',
    'rm -rf "$lucid_skill_stage"',
    "lucid_skill_stage=''",
    'trap - EXIT HUP INT TERM',
    'printf \'Installed Lucid Agents skill %s in .agents/skills/lucid-agents.\\n\' "$lucid_skill_version"',
    '',
  ].join('\n');
}

export async function buildSkillAssets(options: {
  releasesRoot: string;
  outputRoot: string;
  sourceCommit?: string;
}): Promise<void> {
  const releasesRoot = resolve(options.releasesRoot);
  const outputRoot = resolve(options.outputRoot);
  const releaseIndex = JSON.parse(
    await readFile(join(releasesRoot, 'releases.json'), 'utf8')
  ) as ReleaseIndex;
  if (!releaseIndex.releases[releaseIndex.current]) {
    throw new Error('Current skill release is missing from releases.json.');
  }

  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(outputRoot, { recursive: true });
  for (const version of Object.keys(releaseIndex.releases).sort()) {
    const sourceCommit =
      options.sourceCommit ?? releaseIndex.releases[version].sourceCommit;
    if (!sourceCommit || !/^[a-f0-9]{40}$/u.test(sourceCommit)) {
      throw new Error(
        `Skill release ${version} must record a 40-character lowercase sourceCommit.`
      );
    }
    const skillRoot = join(releasesRoot, version);
    const files = await collectSkillFiles(skillRoot);
    if (treeDigest(files) !== releaseIndex.releases[version].treeSha256) {
      throw new Error(
        `Immutable Lucid skill release ${version} does not match its recorded treeSha256.`
      );
    }
    const validationErrors = await validateSkillDirectory(skillRoot);
    if (validationErrors.length > 0) {
      throw new Error(
        `Invalid Lucid skill release ${version}:\n${validationErrors.join('\n')}`
      );
    }
    const archive = gzipSync(createTar(files), { level: 9, mtime: 0 } as never);
    const archiveHash = sha256(archive);
    const installer = renderSkillInstaller(version);
    const versionRoot = join(outputRoot, version);
    await mkdir(versionRoot, { recursive: true });
    const manifest = {
      schemaVersion: 1,
      name: 'lucid-agents',
      version,
      releasedAt: releaseIndex.releases[version].releasedAt,
      sourceCommit,
      evalSuiteSha256: releaseIndex.releases[version].evalSuiteSha256,
      archive: {
        file: 'lucid-agents.tar.gz',
        size: archive.length,
        sha256: archiveHash,
      },
      files: files.map(file => ({
        path: file.path,
        size: file.bytes.length,
        sha256: sha256(file.bytes),
      })),
    };
    await Promise.all([
      writeFile(join(versionRoot, 'lucid-agents.tar.gz'), archive),
      writeFile(
        join(versionRoot, 'lucid-agents.tar.gz.sha256'),
        `${archiveHash}  lucid-agents.tar.gz\n`
      ),
      writeFile(
        join(versionRoot, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`
      ),
      writeFile(join(versionRoot, 'install.sh'), installer),
      ...files.map(async file => {
        const target = join(versionRoot, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.bytes);
      }),
    ]);
  }

  const currentRoot = join(outputRoot, releaseIndex.current);
  await copyCurrentAliases(currentRoot, outputRoot, [
    'lucid-agents.tar.gz',
    'lucid-agents.tar.gz.sha256',
    'manifest.json',
    'SKILL.md',
    'install.sh',
  ]);
  const currentFiles = await collectSkillFiles(
    join(releasesRoot, releaseIndex.current)
  );
  await Promise.all(
    currentFiles.map(async file => {
      const target = join(outputRoot, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.bytes);
    })
  );
}
