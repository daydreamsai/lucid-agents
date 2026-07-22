#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
    instructions: string;
  };
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
  const evals = JSON.parse(
    await readFile(resolve(root, 'skill-evals/lucid-agents/evals.json'), 'utf8')
  ) as {
    schemaVersion: number;
    skill: string;
    skillVersion: string;
    cases: EvalCase[];
  };
  const instructions = await readFile(
    resolve(root, '.agents/skills/lucid-agents/SKILL.md'),
    'utf8'
  );
  const version = (
    await readFile(resolve(root, '.agents/skills/lucid-agents/VERSION'), 'utf8')
  ).trim();
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
    skill: { name: 'lucid-agents', version, instructions },
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
