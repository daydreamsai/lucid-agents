import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type PlannedChangeset = {
  id: string;
  summary: string;
  releases: Array<{ name: string; type: string }>;
};

type PlannedRelease = {
  name: string;
  type: string;
  oldVersion: string;
  newVersion: string;
  changesets: string[];
};

export type ReleasePlan = {
  changesets: PlannedChangeset[];
  releases: PlannedRelease[];
};

const publishableBumps = new Set(['patch', 'minor', 'major']);

function isReleasePlan(value: unknown): value is ReleasePlan {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ReleasePlan>;
  return (
    Array.isArray(candidate.changesets) && Array.isArray(candidate.releases)
  );
}

export function normalizeReleasePlan(plan: ReleasePlan): ReleasePlan {
  return {
    changesets: plan.changesets,
    releases: plan.releases.filter(
      release =>
        typeof release.name === 'string' &&
        typeof release.oldVersion === 'string' &&
        typeof release.newVersion === 'string' &&
        publishableBumps.has(release.type)
    ),
  };
}

export function renderReleaseNotes(plan: ReleasePlan): string {
  const normalized = normalizeReleasePlan(plan);
  if (normalized.releases.length === 0) {
    return '# Release\n\nNo packages are scheduled for release.\n';
  }

  const changesets = new Map(
    normalized.changesets.map(changeset => [changeset.id, changeset])
  );
  const sections = normalized.releases.map(release => {
    const summaries = release.changesets.flatMap(id => {
      const summary = changesets.get(id)?.summary.trim();
      return summary ? [`- ${summary.replaceAll('\n', '\n  ')}`] : [];
    });
    return [
      `## ${release.name} ${release.newVersion}`,
      '',
      `Previous version: ${release.oldVersion} (${release.type})`,
      '',
      ...(summaries.length > 0
        ? summaries
        : ['- Version alignment and dependency updates.']),
    ].join('\n');
  });

  return `# Release\n\n${sections.join('\n\n')}\n`;
}

function main(): void {
  const planPath = process.argv[2]?.trim();
  const notesPath = process.argv[3]?.trim();
  if (!planPath || !notesPath) {
    throw new Error('Usage: release-plan.ts PLAN.json RELEASE_NOTES.md');
  }

  const parsed = JSON.parse(
    readFileSync(path.resolve(planPath), 'utf8')
  ) as unknown;
  if (!isReleasePlan(parsed)) {
    throw new Error('Changesets produced an invalid release plan');
  }
  const normalized = normalizeReleasePlan(parsed);
  writeFileSync(
    path.resolve(planPath),
    `${JSON.stringify(normalized, null, 2)}\n`,
    'utf8'
  );
  writeFileSync(
    path.resolve(notesPath),
    renderReleaseNotes(normalized),
    'utf8'
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown release plan error';
    console.error(message);
    process.exitCode = 1;
  }
}
