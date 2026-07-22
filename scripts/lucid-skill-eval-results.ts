import type { LucidSkillEvalPacket } from './prepare-lucid-skill-evals';

type Scores = {
  itemScores: number[];
  criticalFailures: string[];
};

export type LucidSkillEvalResults = {
  schemaVersion: 1;
  skillVersion: string;
  runs: Array<{
    caseId: string;
    model: string;
    baseline: Scores;
    withSkill: Scores;
  }>;
};

function validateScores(
  label: string,
  scores: Scores,
  itemCount: number,
  errors: string[]
): boolean {
  if (!scores || !Array.isArray(scores.itemScores)) {
    errors.push(`${label}: itemScores must be an array.`);
    return false;
  }
  if (!Array.isArray(scores.criticalFailures)) {
    errors.push(`${label}: criticalFailures must be an array.`);
    return false;
  }
  if (scores.itemScores.length !== itemCount) {
    errors.push(`${label}: expected ${itemCount} rubric item scores.`);
  }
  if (
    scores.itemScores.some(
      score => !Number.isInteger(score) || score < 0 || score > 4
    )
  ) {
    errors.push(`${label}: item scores must be integers from 0 through 4.`);
  }
  return true;
}

export function validateLucidSkillEvalResults(
  packets: LucidSkillEvalPacket[],
  results: LucidSkillEvalResults
): string[] {
  const errors: string[] = [];
  const version = packets[0]?.skill.version;
  if (results.schemaVersion !== 1 || results.skillVersion !== version) {
    errors.push(
      'Eval results metadata does not match the current skill release.'
    );
  }
  if (!Array.isArray(results.runs)) {
    return [...errors, 'Eval results runs must be an array.'];
  }
  const models = new Set(results.runs.map(run => run.model));
  if (models.size < 2)
    errors.push('Eval results must cover at least two models.');
  const cases = new Map(packets.map(packet => [packet.case.id, packet]));
  const seen = new Set<string>();
  for (const run of results.runs) {
    const key = `${run.model}\0${run.caseId}`;
    if (seen.has(key))
      errors.push(`Duplicate eval run: ${run.model}/${run.caseId}.`);
    seen.add(key);
    const packet = cases.get(run.caseId);
    if (!packet) {
      errors.push(`Unknown eval case: ${run.caseId}.`);
      continue;
    }
    const label = `${run.model}/${run.caseId}`;
    const validBaseline = validateScores(
      `${label}/baseline`,
      run.baseline,
      packet.case.rubric.length,
      errors
    );
    const validSkill = validateScores(
      `${label}/withSkill`,
      run.withSkill,
      packet.case.rubric.length,
      errors
    );
    if (!validBaseline || !validSkill) continue;
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
    const minimumTotal = packet.case.rubric.length * 3;
    if (skillTotal < minimumTotal) {
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
  for (const model of models) {
    for (const caseId of cases.keys()) {
      if (!seen.has(`${model}\0${caseId}`)) {
        errors.push(`Missing eval run: ${model}/${caseId}.`);
      }
    }
  }
  return errors;
}
