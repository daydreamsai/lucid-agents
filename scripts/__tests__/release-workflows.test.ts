import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

type Workflow = Record<string, unknown> & {
  concurrency?: { group?: string };
  jobs?: Record<string, Record<string, unknown>>;
  on?: Record<string, unknown>;
};

type WorkflowStep = {
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
};

const repoRoot = path.resolve(import.meta.dir, '../..');

function readWorkflow(name: string): Workflow {
  const source = readFileSync(
    path.join(repoRoot, '.github/workflows', name),
    'utf8'
  );
  return Bun.YAML.parse(source) as Workflow;
}

function workflowSource(name: string): string {
  return readFileSync(path.join(repoRoot, '.github/workflows', name), 'utf8');
}

describe('release workflow policy', () => {
  test('CI has a single required gate covering every release-critical job', () => {
    const workflow = readWorkflow('ci.yml');
    const gate = workflow.jobs?.required_verification as
      | { needs?: string[] }
      | undefined;

    expect(gate?.needs).toEqual([
      'static_checks',
      'tests',
      'examples_e2e',
      'generated_projects',
      'browser_smoke',
      'runtime_compatibility',
      'skill_integrity',
      'docs',
    ]);
  });

  test('manual and bot releases share a lock and verify CI authority', () => {
    for (const name of ['release.yml', 'release-bot.yml']) {
      const workflow = readWorkflow(name);
      const source = workflowSource(name);

      expect(workflow.concurrency?.group).toBe('release-master');
      expect(source).toContain('scripts/release-policy.ts verify');
      expect(source).toContain('RELEASE_TRIGGER_REF:');
    }
  });

  test('release bot runs only after successful master CI', () => {
    const workflow = readWorkflow('release-bot.yml');
    const source = workflowSource('release-bot.yml');

    expect(workflow.on).toEqual({
      workflow_run: {
        workflows: ['CI'],
        types: ['completed'],
        branches: ['master'],
      },
    });
    expect(source).toContain(
      "github.event.workflow_run.conclusion == 'success'"
    );
    expect(source).toContain('publish: bun run release:publish:verified');
  });

  test('manual dry runs version, build, and inspect package artifacts', () => {
    const source = workflowSource('release.yml');

    expect(source).toContain(
      'bun run changeset status --output "$PLAN_RELATIVE_PATH"'
    );
    expect(source).not.toContain('changeset status --json');
    expect(source).toContain('bun run release:version');
    expect(source).toContain('bun run build:packages');
    expect(source).toContain('bun run scripts/changeset-publish.ts --dry-run');
    expect(source).toContain('bun run release:publish:verified');
    expect(source).toContain('Live publishing cannot apply pending changesets');
  });

  test('manual live publish cannot version or publish an uncommitted tree', () => {
    const workflow = readWorkflow('release.yml');
    const releaseJob = workflow.jobs?.release as
      | { steps?: WorkflowStep[] }
      | undefined;
    const steps = releaseJob?.steps ?? [];
    const versionSteps = steps.filter(step =>
      step.run?.includes('bun run release:version')
    );
    const publishStep = steps.find(step =>
      step.run?.includes('bun run release:publish:verified')
    );

    expect(versionSteps).toHaveLength(1);
    expect(versionSteps[0]?.if).toContain('inputs.dry_run == true');
    expect(publishStep?.if).toContain('inputs.dry_run != true');
    expect(workflowSource('release.yml')).not.toContain('git commit');
    expect(workflowSource('release.yml')).not.toContain('git tag');
    expect(workflowSource('release.yml')).not.toContain(
      'softprops/action-gh-release'
    );

    const rootManifest = JSON.parse(
      readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    expect(rootManifest.scripts['release:publish:verified']).toContain(
      'git diff --exit-code'
    );
    expect(
      rootManifest.scripts['release:publish:verified'].match(
        /release-policy\.ts verify-publish/g
      )
    ).toHaveLength(2);
    expect(rootManifest.scripts['release:publish']).toBe(
      'bun run release:publish:verified'
    );
    expect(rootManifest.scripts.release).toBe(
      'bun run release:publish:verified'
    );
  });

  test('every workflow publication entrance uses the guarded publisher', () => {
    const workflowNames = readdirSync(
      path.join(repoRoot, '.github/workflows')
    ).filter(name => /\.ya?ml$/u.test(name));

    for (const workflowName of workflowNames) {
      const workflow = readWorkflow(workflowName);
      for (const job of Object.values(workflow.jobs ?? {})) {
        const steps = (job.steps ?? []) as WorkflowStep[];
        for (const step of steps) {
          const liveCommands = [
            step.run ?? '',
            ...Object.values(step.with ?? {}).map(String),
          ].filter(
            value =>
              /\b(?:npm|changeset|release(?::publish)?)\b.*\bpublish\b/u.test(
                value
              ) && !/--dry-run|--preflight-only/u.test(value)
          );
          for (const command of liveCommands) {
            expect(command).toContain('release:publish:verified');
          }
        }
      }
    }

    const publisher = readFileSync(
      path.join(repoRoot, 'scripts/changeset-publish.ts'),
      'utf8'
    );
    expect(publisher.match(/verifyLivePublishAuthority\(\)/g)?.length).toBe(3);
    expect(publisher).toContain(
      'await verifyPackageArtifacts({ simulatePublish: false });'
    );

    const artifactGate = publisher.indexOf(
      'await verifyPackageArtifacts({ simulatePublish: false });'
    );
    const finalAuthorityGate = publisher.lastIndexOf(
      'await verifyLivePublishAuthority();'
    );
    const publication = publisher.indexOf(
      "['bun', 'x', 'changeset', 'publish', ...extraArgs]"
    );
    expect(artifactGate).toBeGreaterThan(-1);
    expect(artifactGate).toBeLessThan(finalAuthorityGate);
    expect(finalAuthorityGate).toBeLessThan(publication);
  });

  test('SDK watcher opens a PR and cannot push master or dispatch release', () => {
    const source = workflowSource('sdk-watch-release.yml');

    expect(source).toContain('peter-evans/create-pull-request');
    expect(source).not.toMatch(/\bgit push\b/);
    expect(source).not.toContain('createWorkflowDispatch');
    expect(source).not.toContain('release.yml');
    expect(source).toContain(
      "steps.generation.outputs.recommended_bump != 'none'"
    );
  });

  test('hosted API SDK is independent from the runtime fixed release group', () => {
    const config = JSON.parse(
      readFileSync(path.join(repoRoot, '.changeset/config.json'), 'utf8')
    ) as { fixed: string[][] };

    expect(config.fixed.flat()).not.toContain('@lucid-agents/api-sdk');
  });
});
