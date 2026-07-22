#!/usr/bin/env bun

import { cp, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { validateSkillDirectory } from './lucid-skill';

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

let index: {
  current: string;
  releases: Record<string, { releasedAt: string; sourceCommit: string }>;
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
const sourceCommit = Bun.spawnSync({ cmd: ['git', 'rev-parse', 'HEAD'] })
  .stdout.toString()
  .trim();
if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) {
  throw new Error(
    'Unable to resolve the source commit for this skill release.'
  );
}
index.releases[version] = { releasedAt, sourceCommit };
await writeFile(
  resolve(releasesRoot, 'releases.json'),
  `${JSON.stringify(index, null, 2)}\n`,
  'utf8'
);

console.log(`Created immutable Lucid Agents skill release ${version}.`);
