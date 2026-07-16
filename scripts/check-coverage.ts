const DEFAULT_LINE_THRESHOLD = 0.7;
const DEFAULT_FUNCTION_THRESHOLD = 0.78;

type FileCoverage = {
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
};

export type CoverageSummary = FileCoverage & {
  files: number;
  lineRate: number;
  functionRate: number;
};

function isSourceFile(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return (
    !normalized.includes('/dist/') &&
    !normalized.includes('/__tests__/') &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

/** Summarize source-only LCOV records using the aggregate repository totals. */
export function summarizeLcov(lcov: string): CoverageSummary {
  const files = new Map<string, FileCoverage>();

  for (const record of lcov.split('end_of_record')) {
    const source = record.match(/^SF:(.+)$/m)?.[1]?.trim();
    if (!source || !isSourceFile(source)) continue;

    const read = (key: string): number => {
      const raw = record.match(new RegExp(`^${key}:(\\d+)$`, 'm'))?.[1];
      return raw ? Number.parseInt(raw, 10) : 0;
    };
    const next: FileCoverage = {
      linesFound: read('LF'),
      linesHit: read('LH'),
      functionsFound: read('FNF'),
      functionsHit: read('FNH'),
    };
    const current = files.get(source);
    files.set(
      source,
      current
        ? {
            linesFound: Math.max(current.linesFound, next.linesFound),
            linesHit: Math.max(current.linesHit, next.linesHit),
            functionsFound: Math.max(
              current.functionsFound,
              next.functionsFound
            ),
            functionsHit: Math.max(current.functionsHit, next.functionsHit),
          }
        : next
    );
  }

  const totals = [...files.values()].reduce<FileCoverage>(
    (summary, file) => ({
      linesFound: summary.linesFound + file.linesFound,
      linesHit: summary.linesHit + file.linesHit,
      functionsFound: summary.functionsFound + file.functionsFound,
      functionsHit: summary.functionsHit + file.functionsHit,
    }),
    { linesFound: 0, linesHit: 0, functionsFound: 0, functionsHit: 0 }
  );
  return {
    ...totals,
    files: files.size,
    lineRate: totals.linesFound === 0 ? 1 : totals.linesHit / totals.linesFound,
    functionRate:
      totals.functionsFound === 0
        ? 1
        : totals.functionsHit / totals.functionsFound,
  };
}

function percentage(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

if (import.meta.main) {
  const paths =
    process.argv.length > 2 ? process.argv.slice(2) : ['coverage/lcov.info'];
  const lineThreshold = Number(
    process.env.COVERAGE_LINE_THRESHOLD ?? DEFAULT_LINE_THRESHOLD
  );
  const functionThreshold = Number(
    process.env.COVERAGE_FUNCTION_THRESHOLD ?? DEFAULT_FUNCTION_THRESHOLD
  );
  const reports: string[] = [];
  for (const path of paths) {
    const source = Bun.file(path);
    if (!(await source.exists())) {
      console.error(`Coverage report not found: ${path}`);
      process.exit(1);
    }
    reports.push(await source.text());
  }

  const summary = summarizeLcov(reports.join('\n'));
  if (summary.files === 0) {
    console.error(
      `Coverage report contains no source files: ${paths.join(', ')}`
    );
    process.exit(1);
  }

  console.log(
    `Aggregate source coverage (${summary.files} files): ` +
      `${percentage(summary.lineRate)} lines, ` +
      `${percentage(summary.functionRate)} functions`
  );

  const failures: string[] = [];
  if (summary.lineRate < lineThreshold) {
    failures.push(
      `lines ${percentage(summary.lineRate)} < ${percentage(lineThreshold)}`
    );
  }
  if (summary.functionRate < functionThreshold) {
    failures.push(
      `functions ${percentage(summary.functionRate)} < ${percentage(functionThreshold)}`
    );
  }
  if (failures.length > 0) {
    console.error(`Coverage threshold failed: ${failures.join(', ')}`);
    process.exit(1);
  }
}
