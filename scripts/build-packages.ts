import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Manifest = {
  name?: string;
  scripts?: Record<string, string>;
};

type PackageInfo = {
  dir: string;
  manifest: Manifest;
  name: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const packagesDir = path.join(repoRoot, "packages");

function collectPackages(): PackageInfo[] {
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
      const name = manifest.name ?? path.basename(dir);
      results.push({ dir, manifest, name });
    } catch (err) {
      console.warn(`Skipping ${entry.name}: ${(err as Error).message}`);
    }
  }

  return results;
}

async function exec(argv: string[], cwd: string) {
  const proc = Bun.spawn(argv, {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${argv.join(" ")} exited with code ${code}`);
  }
}

async function buildPackages() {
  const packages = collectPackages();

  if (!packages.length) {
    console.warn("No packages found in packages/ – skipping build step.");
    return;
  }

  // Align build order with scripts/build-all.ts so internal deps build first.
  const preferredOrder = [
    "@lucid-agents/x402-tanstack-start",
    "@lucid-agents/types",
    "@lucid-agents/identity",
    "@lucid-agents/payments",
    "@lucid-agents/core",
    "@lucid-agents/hono",
    "@lucid-agents/tanstack",
    "@lucid-agents/cli",
  ];

  const packagesByName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const orderedBuildList: PackageInfo[] = [];

  for (const name of preferredOrder) {
    const pkg = packagesByName.get(name);
    if (pkg) {
      orderedBuildList.push(pkg);
      packagesByName.delete(name);
    }
  }

  // Append any remaining packages that weren't explicitly ordered.
  orderedBuildList.push(...packagesByName.values());

  for (const { manifest, dir, name } of orderedBuildList) {
    const buildScript = manifest.scripts?.build;

    if (!buildScript) {
      console.log(`Skipping ${name}: no build script defined.`);
      continue;
    }

    console.log(`Building ${name}...`);
    await exec(["bun", "run", "build"], dir);
  }
}

await buildPackages().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
