#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { computeSkillTreeDigest } from './lucid-skill';

type EvalCase = {
  id: string;
  category: string;
  prompt: string;
  projectEvidence: Record<string, unknown>;
  rubric: string[];
  criticalFailures: string[];
};

export type LucidSkillEvalPacket = {
  schemaVersion: 1;
  skill: {
    name: 'lucid-agents';
    version: string;
    treeSha256: string;
    instructions: string;
    resources: Record<string, string>;
  };
  evalSuiteSha256: string;
  case: EvalCase;
  evaluator: {
    scale: [number, number];
    instructions: string;
  };
};

export async function prepareLucidSkillEvalPackets(
  repoRoot: string
): Promise<LucidSkillEvalPacket[]> {
  const root = resolve(repoRoot);
  const evalSource = await readFile(
    resolve(root, 'skill-evals/lucid-agents/evals.json'),
    'utf8'
  );
  const evals = JSON.parse(evalSource) as {
    schemaVersion: number;
    skill: string;
    skillVersion: string;
    cases: EvalCase[];
  };
  const skillRoot = resolve(root, '.agents/skills/lucid-agents');
  const resources: Record<string, string> = {};
  async function loadResources(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await loadResources(path);
      else if (entry.isFile()) {
        resources[relative(skillRoot, path).split(sep).join('/')] =
          await readFile(path, 'utf8');
      }
    }
  }
  await loadResources(skillRoot);
  const instructions = resources['SKILL.md'];
  const version = resources.VERSION.trim();
  const treeSha256 = await computeSkillTreeDigest(skillRoot);
  const evalSuiteSha256 = createHash('sha256').update(evalSource).digest('hex');
  if (
    evals.schemaVersion !== 1 ||
    evals.skill !== 'lucid-agents' ||
    evals.skillVersion !== version
  ) {
    throw new Error(
      'Lucid skill eval metadata does not match the skill release.'
    );
  }
  const ids = new Set<string>();
  for (const evalCase of evals.cases) {
    if (ids.has(evalCase.id))
      throw new Error(`Duplicate eval id: ${evalCase.id}`);
    ids.add(evalCase.id);
    if (
      !evalCase.prompt ||
      evalCase.rubric.length === 0 ||
      evalCase.criticalFailures.length === 0
    ) {
      throw new Error(`Incomplete eval case: ${evalCase.id}`);
    }
  }
  return evals.cases.map(evalCase => ({
    schemaVersion: 1,
    skill: {
      name: 'lucid-agents',
      version,
      treeSha256,
      instructions,
      resources,
    },
    evalSuiteSha256,
    case: evalCase,
    evaluator: {
      scale: [0, 4],
      instructions:
        'Score each rubric item from 0 to 4 using only the response and project evidence. Mark the run failed if any critical failure is present. Return structured JSON with item scores, critical failures, rationale, and total.',
    },
  }));
}

if (import.meta.main) {
  const repoRoot = resolve(import.meta.dir, '..');
  for (const packet of await prepareLucidSkillEvalPackets(repoRoot)) {
    console.log(JSON.stringify(packet));
  }
}
