import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
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

function sanitiseManifest(info: PackageInfo): { changed: boolean; next: Manifest } {
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

function writeManifestWithBackup(pathToFile: string, manifest: Manifest, backups: Backup[]) {
  const original = readFileSync(pathToFile, "utf8");
  backups.push({ path: pathToFile, contents: original });
  writeFileSync(pathToFile, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

function restoreBackups(backups: Backup[]) {
  for (const backup of backups) {
    writeFileSync(backup.path, backup.contents, "utf8");
  }
}

async function runPublish() {
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
    const extraArgs = process.argv.slice(2);
    await exec(["bun", "x", "changeset", "publish", ...extraArgs]);
  } finally {
    if (backups.length) {
      restoreBackups(backups);
      console.log("Restored workspace dependency manifest values after publish.");
    }
  }
}

async function exec(argv: string[]) {
  const proc = Bun.spawn(argv, {
    cwd: repoRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${argv.join(" ")} exited with code ${code}`);
  }
}

await runPublish().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
