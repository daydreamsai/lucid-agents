#!/usr/bin/env bun

import { resolve } from 'node:path';

import { validateSkillReleaseState } from './lucid-skill';

const repoRoot = resolve(import.meta.dir, '..');
const errors = await validateSkillReleaseState({
  canonicalRoot: resolve(repoRoot, '.agents/skills/lucid-agents'),
  releasesRoot: resolve(repoRoot, 'skill-releases/lucid-agents'),
  repoRoot,
  evalSuitePath: resolve(repoRoot, 'skill-evals/lucid-agents/evals.json'),
});

if (errors.length > 0) {
  console.error(errors.map(error => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log('Lucid Agents skill and releases are valid.');
