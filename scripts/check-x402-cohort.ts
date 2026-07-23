type RootPackageJson = {
  workspaces?: {
    catalog?: Record<string, string>;
  };
};

export type X402CohortInspection = {
  version?: string;
  errors: string[];
};

const REQUIRED_PACKAGES = [
  '@x402/core',
  '@x402/extensions',
  '@x402/fetch',
  '@x402/evm',
  '@x402/svm',
] as const;

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function versionFromRange(range: string): string {
  return range.trim().replace(/^[~^]/, '');
}

export function inspectX402Cohort(
  packageJson: RootPackageJson,
  lockfile: string
): X402CohortInspection {
  const errors: string[] = [];
  const catalog = packageJson.workspaces?.catalog ?? {};
  const missing = REQUIRED_PACKAGES.filter(name => !catalog[name]);
  if (missing.length > 0) {
    errors.push(`Catalog is missing x402 packages: ${missing.join(', ')}`);
  }

  const catalogVersions = uniqueSorted(
    Object.entries(catalog)
      .filter(([name]) => name.startsWith('@x402/'))
      .map(([, range]) => versionFromRange(range))
  );
  if (catalogVersions.length > 1) {
    errors.push(`Catalog x402 versions are mixed: ${catalogVersions.join(', ')}`);
  }

  const coreVersions = uniqueSorted(
    lockfile.matchAll(/@x402\/core@(\d+\.\d+\.\d+(?:-[^"\]]+)?)/g)
      .map(match => match[1])
      .filter((value): value is string => value !== undefined)
  );
  if (coreVersions.length === 0) {
    errors.push('bun.lock has no resolved @x402/core package');
  } else if (coreVersions.length > 1) {
    errors.push(
      `Resolved @x402/core versions are mixed: ${coreVersions.join(', ')}`
    );
  }

  const version = catalogVersions.length === 1 ? catalogVersions[0] : undefined;
  if (
    version &&
    coreVersions.length === 1 &&
    coreVersions[0] !== version
  ) {
    errors.push(
      `Catalog x402 version ${version} does not match resolved @x402/core ${coreVersions[0]}`
    );
  }

  return { ...(version ? { version } : {}), errors };
}

if (import.meta.main) {
  const packageJson = (await Bun.file('package.json').json()) as RootPackageJson;
  const lockfile = await Bun.file('bun.lock').text();
  const result = inspectX402Cohort(packageJson, lockfile);
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(error);
    process.exit(1);
  }
  console.log(`x402 dependency cohort is coherent at ${result.version}`);
}
