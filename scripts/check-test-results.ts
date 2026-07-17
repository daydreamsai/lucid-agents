export type TestRunSummary = {
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
};

function readCount(
  attributes: string,
  name: string,
  required = true
): number {
  const value = attributes.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1];
  if (value === undefined) {
    if (!required) return 0;
    throw new Error(`JUnit testsuites summary is missing ${name}`);
  }
  return Number.parseInt(value, 10);
}

export function summarizeJunit(xml: string): TestRunSummary {
  const attributes = xml.match(/<testsuites\b([^>]*)>/)?.[1];
  if (attributes === undefined) {
    throw new Error('JUnit report is missing its testsuites summary');
  }
  return {
    tests: readCount(attributes, 'tests'),
    failures: readCount(attributes, 'failures'),
    errors: readCount(attributes, 'errors', false),
    skipped: readCount(attributes, 'skipped'),
  };
}

export function assertCleanTestRun(summary: TestRunSummary): void {
  const problems: string[] = [];
  if (summary.tests === 0) problems.push('no tests executed');
  if (summary.failures > 0) problems.push(`${summary.failures} failed`);
  if (summary.errors > 0) problems.push(`${summary.errors} errored`);
  if (summary.skipped > 0) problems.push(`${summary.skipped} skipped`);
  if (problems.length > 0) {
    throw new Error(`Test-result gate failed: ${problems.join(', ')}`);
  }
}

export async function checkTestReports(
  paths: string[]
): Promise<TestRunSummary> {
  const aggregate: TestRunSummary = {
    tests: 0,
    failures: 0,
    errors: 0,
    skipped: 0,
  };
  for (const path of paths) {
    const file = Bun.file(path);
    if (!(await file.exists()))
      throw new Error(`JUnit report not found: ${path}`);
    const summary = summarizeJunit(await file.text());
    aggregate.tests += summary.tests;
    aggregate.failures += summary.failures;
    aggregate.errors += summary.errors;
    aggregate.skipped += summary.skipped;
  }

  assertCleanTestRun(aggregate);
  return aggregate;
}

if (import.meta.main) {
  const paths = process.argv.slice(2);
  if (paths.length === 0) paths.push('reports/junit.xml');
  const aggregate = await checkTestReports(paths);
  console.log(
    `Test-result gate passed: ${aggregate.tests} tests, no failures or skips`
  );
}
