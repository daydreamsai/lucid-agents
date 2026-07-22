#!/usr/bin/env bun

import { resolve } from 'node:path';

import { buildSkillAssets } from './lucid-skill';

const repoRoot = resolve(import.meta.dir, '..');

await buildSkillAssets({
  releasesRoot: resolve(repoRoot, 'skill-releases/lucid-agents'),
  outputRoot: resolve(repoRoot, 'lucid-docs/public/skills/lucid-agents'),
});

console.log('Built Lucid Agents skill assets.');
