#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { validateLucidSkillEvalResults } from './lucid-skill-eval-results';
import { prepareLucidSkillEvalPackets } from './prepare-lucid-skill-evals';

const resultsPath = process.argv[2];
if (!resultsPath) {
  throw new Error(
    'Usage: bun run skill:eval:validate -- /absolute/path/to/results.json'
  );
}
const repoRoot = resolve(import.meta.dir, '..');
const packets = await prepareLucidSkillEvalPackets(repoRoot);
const results: unknown = JSON.parse(
  await readFile(resolve(resultsPath), 'utf8')
);
const errors = validateLucidSkillEvalResults(packets, results);
if (errors.length > 0) {
  console.error(errors.map(error => `- ${error}`).join('\n'));
  process.exit(1);
}
console.log('Lucid skill cross-model evaluation gate passed.');
