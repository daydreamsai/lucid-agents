import ts from 'typescript';

const DEFAULT_LINE_THRESHOLD = 0.9;
const DEFAULT_FUNCTION_THRESHOLD = 0.9;

type FileCoverage = {
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
};

export type CoverageSummary = FileCoverage & {
  files: number;
  missingFiles: string[];
  lineRate: number;
  functionRate: number;
};

function normalizeSourcePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const packageIndex = normalized.indexOf('/packages/');
  if (packageIndex >= 0) return normalized.slice(packageIndex + 1);
  return normalized;
}

function isSourceFile(path: string): boolean {
  const normalized = normalizeSourcePath(path);
  return (
    !normalized.includes('/dist/') &&
    !normalized.includes('/__tests__/') &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function hasDeclareModifier(statement: ts.Statement): boolean {
  return ts.canHaveModifiers(statement)
    ? (ts
        .getModifiers(statement)
        ?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword) ??
        false)
    : false;
}

function emitsRuntimeCode(statement: ts.Statement): boolean {
  if (
    ts.isImportDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    ts.isExportDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEmptyStatement(statement)
  ) {
    return false;
  }

  return !hasDeclareModifier(statement);
}

/** Return whether a package source file belongs to the repository coverage gate. */
export function isCoverageSource(path: string, source: string): boolean {
  const normalized = normalizeSourcePath(path);
  if (
    !/^packages\/[^/]+\/src\/.+\.[cm]?[jt]sx?$/.test(normalized) ||
    normalized.startsWith('packages/examples/') ||
    normalized.includes('/generated/') ||
    /\.gen\.[cm]?[jt]sx?$/.test(normalized) ||
    /(?:^|\/)routeTree\.gen\.[cm]?[jt]sx?$/.test(normalized) ||
    normalized.endsWith('.d.ts') ||
    !isSourceFile(normalized)
  ) {
    return false;
  }

  const scriptKind = normalized.endsWith('x')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    normalized,
    source,
    ts.ScriptTarget.Latest,
    false,
    scriptKind
  );
  return sourceFile.statements.some(emitsRuntimeCode);
}

/** Discover executable package modules that must be represented in LCOV. */
export async function discoverCoverageSources(
  root = process.cwd()
): Promise<string[]> {
  const paths = new Set<string>();
  for (const pattern of ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx']) {
    const glob = new Bun.Glob(pattern);
    for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
      const normalized = normalizeSourcePath(path);
      const source = await Bun.file(`${root}/${normalized}`).text();
      if (isCoverageSource(normalized, source)) paths.add(normalized);
    }
  }
  return [...paths].sort();
}

/** Summarize source-only LCOV records using the aggregate repository totals. */
export function summarizeLcov(
  lcov: string,
  expectedSources: Iterable<string> = []
): CoverageSummary {
  const files = new Map<string, FileCoverage>();

  for (const record of lcov.split('end_of_record')) {
    const source = record.match(/^SF:(.+)$/m)?.[1]?.trim();
    if (!source || !isSourceFile(source)) continue;
    const normalizedSource = normalizeSourcePath(source);

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
    const current = files.get(normalizedSource);
    files.set(
      normalizedSource,
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
    missingFiles: [...expectedSources]
      .map(normalizeSourcePath)
      .filter(path => !files.has(path))
      .sort(),
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

  const expectedSources = await discoverCoverageSources();
  const summary = summarizeLcov(reports.join('\n'), expectedSources);
  if (summary.files === 0) {
    console.error(
      `Coverage report contains no source files: ${paths.join(', ')}`
    );
    process.exit(1);
  }
  if (summary.missingFiles.length > 0) {
    console.error(
      `Coverage report is missing ${summary.missingFiles.length} executable source files:\n` +
        summary.missingFiles.map(path => `- ${path}`).join('\n')
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
