import type { LucidSkillEvalPacket } from './prepare-lucid-skill-evals';

type Scores = {
  itemScores: number[];
  criticalFailures: string[];
};

type LucidSkillEvalRun = {
  caseId: string;
  model: string;
  baseline: Scores;
  withSkill: Scores;
};

export type LucidSkillEvalResults = {
  schemaVersion: 1;
  skillVersion: string;
  skillTreeSha256: string;
  evalSuiteSha256: string;
  runs: LucidSkillEvalRun[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: string[]
): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function parseScores(
  label: string,
  value: unknown,
  errors: string[]
): Scores | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['itemScores', 'criticalFailures']) ||
    !Array.isArray(value.itemScores) ||
    !value.itemScores.every(
      score =>
        typeof score === 'number' &&
        Number.isInteger(score) &&
        score >= 0 &&
        score <= 4
    ) ||
    !Array.isArray(value.criticalFailures) ||
    !value.criticalFailures.every(failure => typeof failure === 'string')
  ) {
    errors.push(`${label}: scores do not match the published result schema.`);
    return null;
  }
  return {
    itemScores: value.itemScores as number[],
    criticalFailures: value.criticalFailures as string[],
  };
}

function parseResults(input: unknown): {
  errors: string[];
  results: LucidSkillEvalResults | null;
} {
  const errors: string[] = [];
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      'schemaVersion',
      'skillVersion',
      'skillTreeSha256',
      'evalSuiteSha256',
      'runs',
    ]) ||
    input.schemaVersion !== 1 ||
    typeof input.skillVersion !== 'string' ||
    !/^\d+\.\d+\.\d+$/u.test(input.skillVersion) ||
    typeof input.skillTreeSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(input.skillTreeSha256) ||
    typeof input.evalSuiteSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(input.evalSuiteSha256) ||
    !Array.isArray(input.runs)
  ) {
    return {
      errors: ['Eval results do not match the published result schema.'],
      results: null,
    };
  }
  const runs: LucidSkillEvalRun[] = [];
  for (const [index, value] of input.runs.entries()) {
    const label = `runs[${index}]`;
    if (
      !isRecord(value) ||
      !hasOnlyKeys(value, ['caseId', 'model', 'baseline', 'withSkill']) ||
      typeof value.caseId !== 'string' ||
      !value.caseId.trim() ||
      value.caseId !== value.caseId.trim() ||
      typeof value.model !== 'string' ||
      !value.model.trim() ||
      value.model !== value.model.trim()
    ) {
      errors.push(`${label}: run does not match the published result schema.`);
      continue;
    }
    const baseline = parseScores(`${label}/baseline`, value.baseline, errors);
    const withSkill = parseScores(
      `${label}/withSkill`,
      value.withSkill,
      errors
    );
    if (baseline && withSkill) {
      runs.push({
        caseId: value.caseId,
        model: value.model,
        baseline,
        withSkill,
      });
    }
  }
  return {
    errors,
    results:
      errors.length === 0
        ? {
            schemaVersion: 1,
            skillVersion: input.skillVersion,
            skillTreeSha256: input.skillTreeSha256,
            evalSuiteSha256: input.evalSuiteSha256,
            runs,
          }
        : null,
  };
}

export function validateLucidSkillEvalResults(
  packets: LucidSkillEvalPacket[],
  input: unknown
): string[] {
  const parsed = parseResults(input);
  if (!parsed.results) return parsed.errors;
  const results = parsed.results;
  const expected = packets[0];
  const errors: string[] = [];
  if (
    results.skillVersion !== expected?.skill.version ||
    results.skillTreeSha256 !== expected?.skill.treeSha256 ||
    results.evalSuiteSha256 !== expected?.evalSuiteSha256
  ) {
    errors.push(
      'Eval results metadata does not match the current skill tree and eval suite.'
    );
  }
  const normalizedModels = new Map<string, string>();
  for (const run of results.runs) {
    const normalized = run.model.toLowerCase();
    const existing = normalizedModels.get(normalized);
    if (existing && existing !== run.model) {
      errors.push(
        `Model identifiers must be normalized consistently: ${existing}/${run.model}.`
      );
    }
    normalizedModels.set(normalized, run.model);
  }
  if (normalizedModels.size < 2) {
    errors.push('Eval results must cover at least two distinct models.');
  }
  const cases = new Map(packets.map(packet => [packet.case.id, packet]));
  const seen = new Set<string>();
  for (const run of results.runs) {
    const normalizedModel = run.model.toLowerCase();
    const key = `${normalizedModel}\0${run.caseId}`;
    if (seen.has(key)) {
      errors.push(`Duplicate eval run: ${run.model}/${run.caseId}.`);
    }
    seen.add(key);
    const packet = cases.get(run.caseId);
    if (!packet) {
      errors.push(`Unknown eval case: ${run.caseId}.`);
      continue;
    }
    const label = `${run.model}/${run.caseId}`;
    if (
      run.baseline.itemScores.length !== packet.case.rubric.length ||
      run.withSkill.itemScores.length !== packet.case.rubric.length
    ) {
      errors.push(
        `${label}: expected ${packet.case.rubric.length} rubric item scores.`
      );
      continue;
    }
    if (run.withSkill.criticalFailures.length > 0) {
      errors.push(`${label}: skill run contains a critical failure.`);
    }
    if (run.withSkill.itemScores.some(score => score < 2)) {
      errors.push(`${label}: every skill rubric item must score at least 2.`);
    }
    const skillTotal = run.withSkill.itemScores.reduce(
      (sum, score) => sum + score,
      0
    );
    const baselineTotal = run.baseline.itemScores.reduce(
      (sum, score) => sum + score,
      0
    );
    if (skillTotal < packet.case.rubric.length * 3) {
      errors.push(`${label}: skill average must be at least 3.0.`);
    }
    const maximumTotal = packet.case.rubric.length * 4;
    if (
      skillTotal < baselineTotal ||
      (skillTotal === baselineTotal && baselineTotal !== maximumTotal)
    ) {
      errors.push(
        `${label}: skill must improve on baseline or match a perfect baseline.`
      );
    }
  }
  for (const [normalizedModel, model] of normalizedModels) {
    for (const caseId of cases.keys()) {
      if (!seen.has(`${normalizedModel}\0${caseId}`)) {
        errors.push(`Missing eval run: ${model}/${caseId}.`);
      }
    }
  }
  return errors;
}
