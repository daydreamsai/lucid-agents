#!/usr/bin/env bun

import { cp, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  assertCleanSkillSource,
  computeSkillTreeDigest,
  validateSkillDirectory,
} from './lucid-skill';
import { validateLucidSkillEvalResults } from './lucid-skill-eval-results';
import { prepareLucidSkillEvalPackets } from './prepare-lucid-skill-evals';

const repoRoot = resolve(import.meta.dir, '..');
const canonicalRoot = resolve(repoRoot, '.agents/skills/lucid-agents');
const releasesRoot = resolve(repoRoot, 'skill-releases/lucid-agents');
const version = (
  await readFile(resolve(canonicalRoot, 'VERSION'), 'utf8')
).trim();
const target = resolve(releasesRoot, version);
const releasedAt = new Date().toISOString().slice(0, 10);
const errors = await validateSkillDirectory(canonicalRoot);

if (errors.length > 0) {
  throw new Error(`Canonical skill is invalid:\n${errors.join('\n')}`);
}
const evalResultsPath = process.argv[2];
if (!evalResultsPath) {
  throw new Error(
    'A cross-model result file is required: bun run skill:release -- /absolute/path/to/results.json'
  );
}
const evalPackets = await prepareLucidSkillEvalPackets(repoRoot);
const evalResults: unknown = JSON.parse(
  await readFile(resolve(evalResultsPath), 'utf8')
);
const evalErrors = validateLucidSkillEvalResults(evalPackets, evalResults);
if (evalErrors.length > 0) {
  throw new Error(
    `Cross-model evaluation gate failed:\n${evalErrors.join('\n')}`
  );
}

let index: {
  current: string;
  releases: Record<
    string,
    {
      releasedAt: string;
      sourceCommit: string;
      treeSha256: string;
      evalSuiteSha256: string;
    }
  >;
};
try {
  index = JSON.parse(
    await readFile(resolve(releasesRoot, 'releases.json'), 'utf8')
  );
} catch {
  index = { current: version, releases: {} };
}
if (index.releases[version]) {
  throw new Error(`Skill release ${version} already exists and is immutable.`);
}
const sourceStatus = Bun.spawnSync({
  cmd: ['git', 'status', '--porcelain', '--', '.agents/skills/lucid-agents'],
  cwd: repoRoot,
});
if (sourceStatus.exitCode !== 0) {
  throw new Error('Unable to verify the canonical skill Git status.');
}
assertCleanSkillSource(sourceStatus.stdout.toString());
const sourceCommit = Bun.spawnSync({
  cmd: ['git', 'rev-parse', 'HEAD'],
  cwd: repoRoot,
})
  .stdout.toString()
  .trim();
if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) {
  throw new Error(
    'Unable to resolve the source commit for this skill release.'
  );
}
try {
  await lstat(target);
  throw new Error(
    `Skill release directory ${version} already exists and must not be overwritten.`
  );
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

await mkdir(releasesRoot, { recursive: true });
await cp(canonicalRoot, target, {
  errorOnExist: true,
  force: false,
  recursive: true,
});
index.current = version;
index.releases[version] = {
  releasedAt,
  sourceCommit,
  treeSha256: await computeSkillTreeDigest(target),
  evalSuiteSha256: evalPackets[0].evalSuiteSha256,
};
await writeFile(
  resolve(releasesRoot, 'releases.json'),
  `${JSON.stringify(index, null, 2)}\n`,
  'utf8'
);

console.log(`Created immutable Lucid Agents skill release ${version}.`);
