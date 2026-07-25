type RootPackageJson = {
  workspaces?: {
    catalog?: Record<string, string>;
  };
};

export type MppCohortInspection = {
  mppx?: string;
  viem?: string;
  errors: string[];
};

const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

function directResolvedVersion(
  lockfile: string,
  packageName: 'mppx' | 'viem'
): string | undefined {
  const match = new RegExp(
    `^\\s*"${packageName}": \\["${packageName}@(\\d+\\.\\d+\\.\\d+(?:-[^"\\]]+)?)"`,
    'mu'
  ).exec(lockfile);
  return match?.[1];
}

export function inspectMppCohort(
  packageJson: RootPackageJson,
  lockfile: string
): MppCohortInspection {
  const errors: string[] = [];
  const catalog = packageJson.workspaces?.catalog ?? {};
  const mppx = catalog.mppx;
  const viem = catalog.viem;

  for (const [name, version] of [
    ['mppx', mppx],
    ['viem', viem],
  ] as const) {
    if (!version) {
      errors.push(`Catalog is missing ${name}`);
    } else if (!exactVersion.test(version)) {
      errors.push(`Catalog ${name} must be pinned exactly, found ${version}`);
    }

    const resolved = directResolvedVersion(lockfile, name);
    if (!resolved) {
      errors.push(`bun.lock has no direct resolved ${name} package`);
    } else if (version && resolved !== version) {
      errors.push(
        `Catalog ${name} version ${version} does not match direct resolved ${name} ${resolved}`
      );
    }
  }

  return {
    ...(mppx ? { mppx } : {}),
    ...(viem ? { viem } : {}),
    errors,
  };
}

if (import.meta.main) {
  const packageJson = (await Bun.file(
    'package.json'
  ).json()) as RootPackageJson;
  const lockfile = await Bun.file('bun.lock').text();
  const result = inspectMppCohort(packageJson, lockfile);
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(error);
    process.exit(1);
  }
  console.log(
    `MPP dependency cohort is coherent at mppx ${result.mppx} and viem ${result.viem}`
  );
}
