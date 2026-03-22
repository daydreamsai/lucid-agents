import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  describeNpmAccessFailure,
  describeNpmPublishFailure,
  getPackageScope,
  partitionPublishArgs,
} from "./changeset-publish-utils";

type DependencyBlocks =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies";

type Manifest = {
  name?: string;
  version?: string;
  private?: boolean;
  [k in DependencyBlocks]?: Record<string, string>;
};

type PackageInfo = {
  dir: string;
  manifestPath: string;
  manifest: Manifest;
};

type Backup = {
  path: string;
  contents: string;
};

type ExecResult = {
  code: number;
  output: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const rootPkgPath = path.join(repoRoot, "package.json");
if (!existsSync(rootPkgPath)) {
  throw new Error("package.json not found at repository root");
}

const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8")) as {
  workspaces?: { catalog?: Record<string, string> };
};

const catalogVersions = rootPkg.workspaces?.catalog ?? {};

function listPackages(): PackageInfo[] {
  const packagesDir = path.join(repoRoot, "packages");
  if (!existsSync(packagesDir)) return [];
  const entries = readdirSync(packagesDir, { withFileTypes: true });
  const results: PackageInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(packagesDir, entry.name);
    const manifestPath = path.join(dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(
        readFileSync(manifestPath, "utf8")
      ) as Manifest;
      if (!manifest.name) continue;
      results.push({ dir, manifestPath, manifest });
    } catch (err) {
      console.warn(`Skipping package ${entry.name}: ${(err as Error).message}`);
    }
  }
  return results;
}

const packages = listPackages();
const packagesByName = new Map<string, PackageInfo>();
for (const pkg of packages) {
  if (pkg.manifest.name) packagesByName.set(pkg.manifest.name, pkg);
}

function needsSanitise(manifest: Manifest): boolean {
  const blocks: DependencyBlocks[] = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];
  return blocks.some((block) => {
    const record = manifest[block];
    if (!record) return false;
    return Object.values(record).some(
      (value) =>
        typeof value === "string" &&
        (value.startsWith("workspace:") || value === "catalog:")
    );
  });
}

function deriveWorkspaceRange(raw: string, version: string): string {
  const remainder = raw.slice("workspace:".length).trim();
  if (!remainder || remainder === "*") return `^${version}`;
  if (remainder === "^") return `^${version}`;
  if (remainder === "~") return `~${version}`;
  if (remainder.startsWith("^") || remainder.startsWith("~")) {
    return `${remainder[0]}${version}`;
  }
  if (/^(>=|<=|>|<|=)/.test(remainder)) {
    return `${remainder}${version}`;
  }
  if (/^[0-9]/.test(remainder)) {
    return remainder;
  }
  return `^${version}`;
}

function sanitiseManifest(info: PackageInfo): {
  changed: boolean;
  next: Manifest;
} {
  const blocks: DependencyBlocks[] = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];
  const next = JSON.parse(JSON.stringify(info.manifest)) as Manifest;
  let changed = false;

  for (const block of blocks) {
    const record = next[block];
    if (!record) continue;
    for (const [dep, value] of Object.entries(record)) {
      if (typeof value !== "string") continue;
      if (value.startsWith("workspace:")) {
        const target = packagesByName.get(dep);
        if (!target || !target.manifest.version) {
          throw new Error(
            `Unable to resolve workspace dependency \"${dep}\" for package \"${info.manifest.name}\"`
          );
        }
        const normalized = deriveWorkspaceRange(value, target.manifest.version);
        if (normalized !== value) {
          record[dep] = normalized;
          changed = true;
        }
      } else if (value === "catalog:") {
        const catalogVersion = catalogVersions[dep];
        if (!catalogVersion) {
          throw new Error(
            `Missing catalog version for \"${dep}\" (referenced by ${info.manifest.name})`
          );
        }
        record[dep] = catalogVersion;
        changed = true;
      }
    }
  }

  return { changed, next };
}

function writeManifestWithBackup(
  pathToFile: string,
  manifest: Manifest,
  backups: Backup[]
) {
  const original = readFileSync(pathToFile, "utf8");
  backups.push({ path: pathToFile, contents: original });
  writeFileSync(pathToFile, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

function restoreBackups(backups: Backup[]) {
  for (const backup of backups) {
    writeFileSync(backup.path, backup.contents, "utf8");
  }
}

async function verifyNpmPublishAccess() {
  if (process.env.LUCID_SKIP_NPM_PUBLISH_PREFLIGHT === "1") {
    console.log("Skipping npm publish preflight via LUCID_SKIP_NPM_PUBLISH_PREFLIGHT=1");
    return;
  }

  const publicPackages = packages
    .filter((pkg) => !pkg.manifest.private && pkg.manifest.name)
    .sort((a, b) => (a.manifest.name ?? "").localeCompare(b.manifest.name ?? ""));
  const scopes = new Set<string>();

  for (const pkg of publicPackages) {
    const scope = pkg.manifest.name ? getPackageScope(pkg.manifest.name) : undefined;
    if (scope) scopes.add(scope);
  }

  if (!scopes.size) return;

  const auth = await exec(["npm", "whoami"], { allowFailure: true });
  if (auth.code !== 0) {
    const scope = scopes.values().next().value ?? "the configured npm scope";
    const message =
      describeNpmAccessFailure({ output: auth.output, scope }) ??
      `npm publish preflight failed before publishing ${scope} packages.`;
    throw new Error(message);
  }

  for (const scope of scopes) {
    const probe = await findPublishedPackageForScope(publicPackages, scope);
    if (!probe) {
      console.warn(
        `Skipping npm collaborator preflight for ${scope}: no existing published package found to probe.`
      );
      continue;
    }

    const access = await exec(
      ["npm", "access", "list", "collaborators", probe, "--json"],
      { allowFailure: true }
    );
    if (access.code !== 0) {
      const message =
        describeNpmAccessFailure({
          output: access.output,
          packageName: probe,
          scope,
        }) ??
        `npm publish preflight failed while checking collaborator access for ${probe}.`;
      throw new Error(message);
    }
  }
}

async function findPublishedPackageForScope(
  candidates: PackageInfo[],
  scope: string
): Promise<string | undefined> {
  for (const pkg of candidates) {
    const name = pkg.manifest.name;
    if (!name || getPackageScope(name) !== scope) continue;
    const view = await exec(["npm", "view", name, "version", "--json"], {
      allowFailure: true,
    });
    if (view.code === 0) return name;
  }
  return undefined;
}

async function runPublish() {
  const parsedArgs = partitionPublishArgs(process.argv.slice(2));
  const backups: Backup[] = [];
  const sanitisedPackages: string[] = [];

  for (const pkg of packages) {
    if (!needsSanitise(pkg.manifest)) continue;
    const { changed, next } = sanitiseManifest(pkg);
    if (!changed) continue;
    writeManifestWithBackup(pkg.manifestPath, next, backups);
    const display = pkg.manifest.name ?? pkg.manifestPath;
    sanitisedPackages.push(display);
  }

  if (sanitisedPackages.length) {
    console.log(
      "Sanitised workspace/catalog dependencies for:",
      sanitisedPackages.join(", ")
    );
  } else {
    console.log("No workspace or catalog dependencies required sanitisation.");
  }

  try {
    await verifyNpmPublishAccess();
    if (parsedArgs.preflightOnly) {
      console.log("npm publish preflight succeeded.");
      return;
    }

    const extraArgs = parsedArgs.passthroughArgs;
    const publish = await exec(["bun", "x", "changeset", "publish", ...extraArgs], {
      allowFailure: true,
    });
    if (publish.code !== 0) {
      const scope = packages
        .map((pkg) => pkg.manifest.name)
        .find((name): name is string => Boolean(name))
        ?.match(/^@[^/]+/)?.[0];
      const message =
        scope && describeNpmPublishFailure({ output: publish.output, scope });
      if (message) {
        throw new Error(`${message}\n\nbun x changeset publish exited with code ${publish.code}`);
      }
      throw new Error(`bun x changeset publish exited with code ${publish.code}`);
    }
  } finally {
    if (backups.length) {
      restoreBackups(backups);
      console.log(
        "Restored workspace dependency manifest values after publish."
      );
    }
  }
}

async function exec(
  argv: string[],
  opts: { allowFailure?: boolean } = {}
): Promise<ExecResult> {
  const proc = Bun.spawn(argv, {
    cwd: repoRoot,
    stdin: "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, code] = await Promise.all([
    proc.stdout ? new Response(proc.stdout).text() : "",
    proc.stderr ? new Response(proc.stderr).text() : "",
    proc.exited,
  ]);

  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  const output = [stdout, stderr].filter(Boolean).join("\n");
  if (code !== 0 && !opts.allowFailure) {
    throw new Error(`${argv.join(" ")} exited with code ${code}`);
  }

  return { code, output };
}

await runPublish().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
