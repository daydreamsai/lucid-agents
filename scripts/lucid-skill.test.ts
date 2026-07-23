import { describe, expect, it, setDefaultTimeout } from 'bun:test';
import {
  cp,
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
  assertCleanSkillSource,
  buildSkillAssets,
  inspectLucidProject,
  validateSkillDirectory,
  validateSkillReleaseState,
} from './lucid-skill';
import { prepareLucidSkillEvalPackets } from './prepare-lucid-skill-evals';
import {
  type LucidSkillEvalResults,
  validateLucidSkillEvalResults,
} from './lucid-skill-eval-results';

const repoRoot = resolve(import.meta.dir, '..');
setDefaultTimeout(15_000);

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

      const bundled = Bun.spawnSync({
        cmd: [
          'node',
          join(
            repoRoot,
            '.agents/skills/lucid-agents/scripts/inspect-project.mjs'
          ),
          root,
        ],
      });
      expect(bundled.exitCode).toBe(0);
      expect(JSON.parse(bundled.stdout.toString())).toEqual(inspection);
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

      const bundled = Bun.spawnSync({
        cmd: [
          'node',
          join(
            repoRoot,
            '.agents/skills/lucid-agents/scripts/inspect-project.mjs'
          ),
          root,
        ],
      });
      expect(bundled.exitCode).toBe(0);
      expect(JSON.parse(bundled.stdout.toString())).toEqual(inspection);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('blocks ambiguous Git, tag, and npm alias dependency sources', async () => {
    for (const version of [
      'github:daydreamsai/lucid-agents',
      'latest',
      'npm:@lucid-agents/core@4.1.0',
    ]) {
      const root = await temporaryDirectory('lucid-skill-ambiguous-');
      try {
        await writePackageJson(root, {
          '@lucid-agents/core': '4.1.0',
          '@lucid-agents/http': version,
        });

        const inspection = await inspectLucidProject(root);
        expect(inspection.channel).toBe('unknown');
        expect(inspection.blockingWarnings).toEqual([
          'Lucid dependencies include unsupported or ambiguous sources. Pin registry versions or use one local/workspace channel before editing.',
        ]);

        const bundled = Bun.spawnSync({
          cmd: [
            'node',
            join(
              repoRoot,
              '.agents/skills/lucid-agents/scripts/inspect-project.mjs'
            ),
            root,
          ],
        });
        expect(bundled.exitCode).toBe(0);
        expect(JSON.parse(bundled.stdout.toString())).toEqual(inspection);
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    }
  });
});

describe('Lucid skill distribution', () => {
  it('validates the canonical skill and every released snapshot', async () => {
    const canonical = join(repoRoot, '.agents/skills/lucid-agents');
    const released = join(repoRoot, 'skill-releases/lucid-agents/1.0.1');

    expect(await validateSkillDirectory(canonical)).toEqual([]);
    expect(await validateSkillDirectory(released)).toEqual([]);
  });

  it('publishes a documented, cache-safe curl installation contract', async () => {
    const installCommand =
      'curl -fsSL https://docs.daydreams.systems/skills/lucid-agents/install.sh | sh';
    const page = await readFile(
      join(repoRoot, 'lucid-docs/content/docs/start/agent-skill.mdx'),
      'utf8'
    );
    const homepage = await readFile(
      join(repoRoot, 'lucid-docs/src/routes/index.tsx'),
      'utf8'
    );
    const readme = await readFile(join(repoRoot, 'README.md'), 'utf8');
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
    expect(page).toContain(installCommand);
    expect(homepage).toContain(installCommand);
    expect(readme).toContain(installCommand);
    expect(page).toContain('shasum -a 256 -c lucid-agents.tar.gz.sha256');
    expect(page).toContain('set -eu');
    expect(page).toContain('.agents/skills/.lucid-agents-backup.$$');
    expect(headers).toContain('Access-Control-Allow-Origin: *');
    expect(headers).toContain(
      'Cache-Control: public, max-age=31536000, immutable'
    );

    const checksumRoot = await temporaryDirectory('lucid-skill-checksum-');
    try {
      await writeFile(join(checksumRoot, 'lucid-agents.tar.gz'), 'tampered');
      await writeFile(
        join(checksumRoot, 'lucid-agents.tar.gz.sha256'),
        `${'0'.repeat(64)}  lucid-agents.tar.gz\n`
      );
      const result = Bun.spawnSync({
        cmd: [
          'bash',
          '-c',
          'set -eu\ncd "$1"\nshasum -a 256 -c lucid-agents.tar.gz.sha256\ntouch inspector-ran',
          '_',
          checksumRoot,
        ],
      });
      expect(result.exitCode).not.toBe(0);
      expect(await Bun.file(join(checksumRoot, 'inspector-ran')).exists()).toBe(
        false
      );
    } finally {
      await rm(checksumRoot, { force: true, recursive: true });
    }
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
      const archiveA = await readFile(join(outputA, '1.0.2', archiveName));
      const archiveB = await readFile(join(outputB, '1.0.2', archiveName));
      expect(archiveA.equals(archiveB)).toBe(true);

      const manifest = JSON.parse(
        await readFile(join(outputA, '1.0.2', 'manifest.json'), 'utf8')
      ) as {
        name: string;
        version: string;
        sourceCommit: string;
        archive: { sha256: string };
        files: Array<{ path: string }>;
      };
      expect(manifest.name).toBe('lucid-agents');
      expect(manifest.version).toBe('1.0.2');
      expect(manifest.sourceCommit).toBe(options.sourceCommit);
      expect(manifest.archive.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(manifest.files.map(file => file.path)).toContain('SKILL.md');

      expect(
        await readFile(join(outputA, archiveName + '.sha256'), 'utf8')
      ).toBe(`${manifest.archive.sha256}  ${archiveName}\n`);
      expect(await readFile(join(outputA, 'SKILL.md'), 'utf8')).toBe(
        await readFile(join(outputA, '1.0.2', 'SKILL.md'), 'utf8')
      );
      const installer = await readFile(
        join(outputA, '1.0.2', 'install.sh'),
        'utf8'
      );
      expect(installer).toBe(
        await readFile(join(outputB, '1.0.2', 'install.sh'), 'utf8')
      );
      expect(installer).toBe(
        await readFile(join(outputA, 'install.sh'), 'utf8')
      );
      expect(installer).toContain(
        "lucid_skill_base='https://docs.daydreams.systems/skills/lucid-agents/1.0.2'"
      );
      expect(installer).toContain('shasum -a 256 -c');
      expect(installer).toContain('sha256sum -c');
      const installerSyntax = Bun.spawnSync({
        cmd: ['sh', '-n', join(outputA, '1.0.2', 'install.sh')],
      });
      expect(installerSyntax.exitCode).toBe(0);

      const listing = Bun.spawnSync({
        cmd: ['tar', '-tzf', join(outputA, '1.0.2', archiveName)],
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

  it('detects mutation of a historical immutable snapshot', async () => {
    const releasesRoot = await temporaryDirectory('lucid-skill-history-');
    try {
      await cp(join(repoRoot, 'skill-releases/lucid-agents'), releasesRoot, {
        recursive: true,
      });
      await writeFile(
        join(releasesRoot, '1.0.0', 'references', 'mpp.md'),
        '\nmutated\n',
        { flag: 'a' }
      );

      const errors = await validateSkillReleaseState({
        canonicalRoot: join(repoRoot, '.agents/skills/lucid-agents'),
        releasesRoot,
      });
      expect(errors).toContain(
        '1.0.0: immutable snapshot does not match treeSha256.'
      );
    } finally {
      await rm(releasesRoot, { force: true, recursive: true });
    }
  });

  it('rejects release provenance from a dirty canonical source', () => {
    expect(() =>
      assertCleanSkillSource(' M .agents/skills/lucid-agents/SKILL.md')
    ).toThrow('Commit canonical Lucid skill changes before cutting a release');
    expect(() => assertCleanSkillSource('')).not.toThrow();
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
    expect(packets.every(packet => packet.skill.version === '1.0.2')).toBe(
      true
    );
    expect(
      packets.every(packet => packet.skill.instructions.includes('mixed'))
    ).toBe(true);
    expect(
      packets.every(
        packet =>
          packet.skill.resources['references/mpp.md']?.includes('MPP') &&
          packet.skill.resources['scripts/inspect-project.mjs']?.includes(
            'inspectProject'
          )
      )
    ).toBe(true);

    const results: LucidSkillEvalResults = {
      schemaVersion: 1,
      skillVersion: '1.0.2',
      skillTreeSha256: packets[0].skill.treeSha256,
      evalSuiteSha256: packets[0].evalSuiteSha256,
      runs: ['model-a', 'model-b'].flatMap(model =>
        packets.map(packet => ({
          caseId: packet.case.id,
          model,
          baseline: {
            itemScores: packet.case.rubric.map(() => 2),
            criticalFailures: [],
          },
          withSkill: {
            itemScores: packet.case.rubric.map(() => 3),
            criticalFailures: [],
          },
        }))
      ),
    };
    expect(validateLucidSkillEvalResults(packets, results)).toEqual([]);
    results.runs[0].withSkill.criticalFailures.push('unsafe side effect');
    expect(validateLucidSkillEvalResults(packets, results)).toContain(
      'model-a/stable-hono-paid-entrypoint: skill run contains a critical failure.'
    );
    results.runs[0].withSkill.criticalFailures.length = 0;
    results.runs[0].model = ' ';
    expect(validateLucidSkillEvalResults(packets, results)).toContain(
      'runs[0]: run does not match the published result schema.'
    );
    results.runs[0].model = 'model-a';
    results.skillTreeSha256 = '0'.repeat(64);
    expect(validateLucidSkillEvalResults(packets, results)).toContain(
      'Eval results metadata does not match the current skill tree and eval suite.'
    );
  });
});
