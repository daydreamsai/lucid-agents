import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

export const REQUIRED_CI_JOB_IDS = [
  'static_checks',
  'tests',
  'examples_e2e',
  'generated_projects',
  'browser_smoke',
  'runtime_compatibility',
  'skill_integrity',
  'docs',
] as const;

export const REQUIRED_CI_GATE_NAME = 'Required release verification';

type RequiredJobId = (typeof REQUIRED_CI_JOB_IDS)[number];

type CiNeeds = Partial<Record<RequiredJobId, { result?: string }>>;

export type ReleaseContext = {
  triggerRef: string;
  checkedOutSha: string;
  masterSha: string;
  ciRun: {
    workflowName: string;
    event: string;
    headBranch: string;
    headSha: string;
    status: string;
    conclusion: string | null;
    requiredGateConclusion: string | null;
  };
};

type GitHubWorkflowRun = {
  id: number;
  name: string;
  event: string;
  head_branch: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
};

type GitHubJob = {
  name: string;
  conclusion: string | null;
};

export class ReleasePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleasePolicyError';
  }
}

export function assertRequiredCiResults(results: CiNeeds): void {
  const failures = REQUIRED_CI_JOB_IDS.flatMap(id => {
    const result = results[id]?.result ?? 'missing';
    return result === 'success' ? [] : [`${id}=${result}`];
  });

  if (failures.length > 0) {
    throw new ReleasePolicyError(
      `Required CI jobs did not succeed: ${failures.join(', ')}`
    );
  }
}

export function assertReleaseContext(context: ReleaseContext): void {
  if (context.triggerRef !== 'refs/heads/master') {
    throw new ReleasePolicyError(
      `Releases must be triggered from refs/heads/master; received ${context.triggerRef}`
    );
  }

  if (context.checkedOutSha !== context.masterSha) {
    throw new ReleasePolicyError(
      'Checked out commit does not match the current master commit'
    );
  }

  const run = context.ciRun;
  if (
    run.workflowName !== 'CI' ||
    run.event !== 'push' ||
    run.headBranch !== 'master'
  ) {
    throw new ReleasePolicyError(
      'CI attestation must be the CI push workflow for master'
    );
  }

  if (run.headSha !== context.checkedOutSha) {
    throw new ReleasePolicyError(
      'CI attestation does not match the checked out master commit'
    );
  }

  if (run.status !== 'completed' || run.conclusion !== 'success') {
    throw new ReleasePolicyError(
      `CI attestation did not succeed: status=${run.status}, conclusion=${run.conclusion ?? 'none'}`
    );
  }

  if (run.requiredGateConclusion !== 'success') {
    throw new ReleasePolicyError(
      `Required release verification gate did not succeed: ${run.requiredGateConclusion ?? 'missing'}`
    );
  }
}

export function assertVerifiedCheckout(
  expectedSha: string,
  actualSha: string
): void {
  if (actualSha !== expectedSha) {
    throw new ReleasePolicyError(
      `Local checkout does not match the verified source commit: expected ${expectedSha}, found ${actualSha}`
    );
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ReleasePolicyError(`${name} is required`);
  }
  return value;
}

async function githubJson<T>(path: string): Promise<T> {
  const repository = requiredEnvironment('GITHUB_REPOSITORY');
  const token = requiredEnvironment('GITHUB_TOKEN');
  const response = await fetch(
    `https://api.github.com/repos/${repository}${path}`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    throw new ReleasePolicyError(
      `GitHub API request failed (${response.status}) for ${path}`
    );
  }

  return (await response.json()) as T;
}

async function resolveCiRun(checkedOutSha: string): Promise<GitHubWorkflowRun> {
  const attestedRunId = process.env.VERIFIED_CI_RUN_ID?.trim();
  if (attestedRunId) {
    return githubJson<GitHubWorkflowRun>(
      `/actions/runs/${encodeURIComponent(attestedRunId)}`
    );
  }

  const response = await githubJson<{ workflow_runs: GitHubWorkflowRun[] }>(
    '/actions/workflows/ci.yml/runs?branch=master&event=push&status=completed&per_page=100'
  );
  const run = response.workflow_runs.find(
    candidate => candidate.head_sha === checkedOutSha
  );
  if (!run) {
    throw new ReleasePolicyError(
      `No completed CI run attests master commit ${checkedOutSha}`
    );
  }
  return run;
}

async function requiredGateConclusion(runId: number): Promise<string | null> {
  const response = await githubJson<{ jobs: GitHubJob[] }>(
    `/actions/runs/${runId}/jobs?filter=latest&per_page=100`
  );
  return (
    response.jobs.find(job => job.name === REQUIRED_CI_GATE_NAME)?.conclusion ??
    null
  );
}

async function resolveMasterSha(): Promise<string> {
  const branch = await githubJson<{ commit: { sha: string } }>(
    '/branches/master'
  );
  return branch.commit.sha;
}

function resolveHeadSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new ReleasePolicyError('Unable to resolve the local git HEAD');
  }
}

async function verifyRelease(): Promise<void> {
  const declaredSourceSha = requiredEnvironment('RELEASE_SOURCE_SHA');
  const checkedOutSha = resolveHeadSha();
  assertVerifiedCheckout(declaredSourceSha, checkedOutSha);
  const triggerRef = requiredEnvironment('RELEASE_TRIGGER_REF');
  const masterSha = await resolveMasterSha();
  const run = await resolveCiRun(checkedOutSha);
  const gateConclusion = await requiredGateConclusion(run.id);

  assertReleaseContext({
    triggerRef,
    checkedOutSha,
    masterSha,
    ciRun: {
      workflowName: run.name,
      event: run.event,
      headBranch: run.head_branch,
      headSha: run.head_sha,
      status: run.status,
      conclusion: run.conclusion,
      requiredGateConclusion: gateConclusion,
    },
  });

  const githubEnv = process.env.GITHUB_ENV?.trim();
  if (githubEnv) {
    appendFileSync(githubEnv, `VERIFIED_SOURCE_SHA=${checkedOutSha}\n`);
    appendFileSync(githubEnv, `VERIFIED_CI_RUN_ID=${run.id}\n`);
    appendFileSync(githubEnv, `VERIFIED_TRIGGER_REF=${triggerRef}\n`);
  }

  console.log(
    `Release authority verified: master ${checkedOutSha} passed ${REQUIRED_CI_GATE_NAME} in CI run ${run.id}.`
  );
}

async function verifyPublishAuthority(): Promise<void> {
  const checkedOutSha = resolveHeadSha();
  const expectedSha = requiredEnvironment('VERIFIED_SOURCE_SHA');
  assertVerifiedCheckout(expectedSha, checkedOutSha);
  const triggerRef = requiredEnvironment('VERIFIED_TRIGGER_REF');
  const masterSha = await resolveMasterSha();
  const run = await resolveCiRun(checkedOutSha);
  const gateConclusion = await requiredGateConclusion(run.id);

  assertReleaseContext({
    triggerRef,
    checkedOutSha,
    masterSha,
    ciRun: {
      workflowName: run.name,
      event: run.event,
      headBranch: run.head_branch,
      headSha: run.head_sha,
      status: run.status,
      conclusion: run.conclusion,
      requiredGateConclusion: gateConclusion,
    },
  });

  console.log(
    `Publish authority reverified for CI-attested master commit ${checkedOutSha}.`
  );
}

async function verifyMasterUnchanged(): Promise<void> {
  const expectedSha = requiredEnvironment('VERIFIED_SOURCE_SHA');
  assertVerifiedCheckout(expectedSha, resolveHeadSha());
  const masterSha = await resolveMasterSha();
  if (masterSha !== expectedSha) {
    throw new ReleasePolicyError(
      `Master advanced after release verification: expected ${expectedSha}, found ${masterSha}`
    );
  }
  console.log(`Master remains at verified source commit ${expectedSha}.`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === 'assert-ci-results') {
    const raw = requiredEnvironment('REQUIRED_CI_RESULTS');
    assertRequiredCiResults(JSON.parse(raw) as CiNeeds);
    console.log('All required CI jobs succeeded.');
    return;
  }
  if (command === 'verify') {
    await verifyRelease();
    return;
  }
  if (command === 'verify-master') {
    await verifyMasterUnchanged();
    return;
  }
  if (command === 'verify-publish') {
    await verifyPublishAuthority();
    return;
  }
  throw new ReleasePolicyError(
    'Usage: release-policy.ts <assert-ci-results|verify|verify-master|verify-publish>'
  );
}

if (import.meta.main) {
  main().catch(error => {
    const message =
      error instanceof Error ? error.message : 'Unknown release policy error';
    console.error(`Release policy rejected this run: ${message}`);
    process.exit(1);
  });
}
