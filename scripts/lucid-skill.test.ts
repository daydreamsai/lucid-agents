import { describe, expect, it } from 'bun:test';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  buildSkillAssets,
  inspectLucidProject,
  validateSkillDirectory,
} from './lucid-skill';
import { prepareLucidSkillEvalPackets } from './prepare-lucid-skill-evals';

const repoRoot = resolve(import.meta.dir, '..');

async function temporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writePackageJson(
  root: string,
  dependencies: Record<string, string>
): Promise<void> {
  await writeFile(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'fixture', dependencies }, null, 2)}\n`,
    'utf8'
  );
}

describe('Lucid skill project inspector', () => {
  it('classifies registry packages and detects the adapter', async () => {
    const root = await temporaryDirectory('lucid-skill-stable-');
    try {
      await writePackageJson(root, {
        '@lucid-agents/core': '4.1.0',
        '@lucid-agents/hono': '^1.0.1',
        '@lucid-agents/http': '3.0.0',
      });

      const inspection = await inspectLucidProject(root);

      expect(inspection.channel).toBe('stable');
      expect(inspection.adapters).toEqual(['hono']);
      expect(inspection.packages).toEqual([
        { name: '@lucid-agents/core', source: 'registry', version: '4.1.0' },
        { name: '@lucid-agents/hono', source: 'registry', version: '^1.0.1' },
        { name: '@lucid-agents/http', source: 'registry', version: '3.0.0' },
      ]);
      expect(inspection.blockingWarnings).toEqual([]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('blocks projects that mix local and registry Lucid packages', async () => {
    const root = await temporaryDirectory('lucid-skill-mixed-');
    try {
      await writePackageJson(root, {
        '@lucid-agents/core': 'workspace:*',
        '@lucid-agents/http': '3.0.0',
      });

      const inspection = await inspectLucidProject(root);

      expect(inspection.channel).toBe('mixed');
      expect(inspection.blockingWarnings).toEqual([
        'Lucid dependencies mix local/workspace and registry sources. Select one release channel before editing.',
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe('Lucid skill distribution', () => {
  it('validates the canonical skill and every released snapshot', async () => {
    const canonical = join(repoRoot, '.agents/skills/lucid-agents');
    const released = join(repoRoot, 'skill-releases/lucid-agents/1.0.0');

    expect(await validateSkillDirectory(canonical)).toEqual([]);
    expect(await validateSkillDirectory(released)).toEqual([]);
  });

  it('publishes a documented, cache-safe curl installation contract', async () => {
    const page = await readFile(
      join(repoRoot, 'lucid-docs/content/docs/start/agent-skill.mdx'),
      'utf8'
    );
    const navigation = JSON.parse(
      await readFile(
        join(repoRoot, 'lucid-docs/content/docs/start/meta.json'),
        'utf8'
      )
    ) as { pages: string[] };
    const headers = await readFile(
      join(repoRoot, 'lucid-docs/public/_headers'),
      'utf8'
    );

    expect(navigation.pages).toContain('agent-skill');
    expect(page).toContain(
      'https://docs.daydreams.systems/skills/lucid-agents/lucid-agents.tar.gz'
    );
    expect(page).toContain('shasum -a 256 -c lucid-agents.tar.gz.sha256');
    expect(headers).toContain('Access-Control-Allow-Origin: *');
    expect(headers).toContain(
      'Cache-Control: public, max-age=31536000, immutable'
    );
  });

  it('builds deterministic current and immutable release artifacts', async () => {
    const outputA = await temporaryDirectory('lucid-skill-assets-a-');
    const outputB = await temporaryDirectory('lucid-skill-assets-b-');
    try {
      const options = {
        releasesRoot: join(repoRoot, 'skill-releases/lucid-agents'),
        sourceCommit: '0123456789abcdef0123456789abcdef01234567',
      };
      await buildSkillAssets({ ...options, outputRoot: outputA });
      await buildSkillAssets({ ...options, outputRoot: outputB });

      const archiveName = 'lucid-agents.tar.gz';
      const archiveA = await readFile(join(outputA, '1.0.0', archiveName));
      const archiveB = await readFile(join(outputB, '1.0.0', archiveName));
      expect(archiveA.equals(archiveB)).toBe(true);

      const manifest = JSON.parse(
        await readFile(join(outputA, '1.0.0', 'manifest.json'), 'utf8')
      ) as {
        name: string;
        version: string;
        sourceCommit: string;
        archive: { sha256: string };
        files: Array<{ path: string }>;
      };
      expect(manifest.name).toBe('lucid-agents');
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.sourceCommit).toBe(options.sourceCommit);
      expect(manifest.archive.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(manifest.files.map(file => file.path)).toContain('SKILL.md');

      expect(
        await readFile(join(outputA, archiveName + '.sha256'), 'utf8')
      ).toBe(`${manifest.archive.sha256}  ${archiveName}\n`);
      expect(await readFile(join(outputA, 'SKILL.md'), 'utf8')).toBe(
        await readFile(join(outputA, '1.0.0', 'SKILL.md'), 'utf8')
      );

      const listing = Bun.spawnSync({
        cmd: ['tar', '-tzf', join(outputA, '1.0.0', archiveName)],
        stderr: 'pipe',
        stdout: 'pipe',
      });
      expect(listing.exitCode).toBe(0);
      expect(listing.stdout.toString()).toContain('lucid-agents/SKILL.md');
      expect(listing.stdout.toString()).not.toContain('../');
    } finally {
      await Promise.all([
        rm(outputA, { force: true, recursive: true }),
        rm(outputB, { force: true, recursive: true }),
      ]);
    }
  });

  it('rejects symbolic links in release snapshots', async () => {
    const releasesRoot = await temporaryDirectory('lucid-skill-unsafe-');
    const outputRoot = await temporaryDirectory('lucid-skill-unsafe-output-');
    try {
      const release = join(releasesRoot, '1.0.0');
      await mkdir(release, { recursive: true });
      await writeFile(
        join(releasesRoot, 'releases.json'),
        `${JSON.stringify({ current: '1.0.0', releases: { '1.0.0': { releasedAt: '2026-07-22' } } })}\n`
      );
      await writeFile(
        join(release, 'SKILL.md'),
        '---\nname: lucid-agents\ndescription: test\n---\n'
      );
      await symlink('/etc/passwd', join(release, 'unsafe'));

      expect(
        buildSkillAssets({
          outputRoot,
          releasesRoot,
          sourceCommit: '0123456789abcdef0123456789abcdef01234567',
        })
      ).rejects.toThrow('Symbolic links are not allowed in skill releases');
    } finally {
      await Promise.all([
        rm(releasesRoot, { force: true, recursive: true }),
        rm(outputRoot, { force: true, recursive: true }),
      ]);
    }
  });

  it('prepares version-matched behavioral eval packets across risk areas', async () => {
    const packets = await prepareLucidSkillEvalPackets(repoRoot);
    expect(packets).toHaveLength(8);
    expect(new Set(packets.map(packet => packet.case.category))).toEqual(
      new Set([
        'implementation',
        'safety',
        'architecture',
        'protocol',
        'operations',
        'ui',
        'deployment',
      ])
    );
    expect(packets.every(packet => packet.skill.version === '1.0.0')).toBe(
      true
    );
    expect(
      packets.every(packet => packet.skill.instructions.includes('mixed'))
    ).toBe(true);
  });
});
