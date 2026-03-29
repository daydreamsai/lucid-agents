/**
 * verify-packages.ts
 * Audits every package against CI policy and exits non-zero on violations.
 * Closes #116, #117.
 *
 * Usage:
 *   bun run scripts/ci/verify-packages.ts
 */

import { readdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { POLICY } from "./policy";

const PACKAGES_DIR = join(import.meta.dir, "../../packages");

interface Violation {
  pkg: string;
  missing: string[];
}

function main() {
  const packages = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const violations: Violation[] = [];
  const warnings: string[] = [];

  for (const pkg of packages) {
    const pkgJsonPath = join(PACKAGES_DIR, pkg, "package.json");
    if (!existsSync(pkgJsonPath)) continue;

    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    const scripts: Record<string, string> = pkgJson.scripts ?? {};
    const policy = POLICY[pkg];

    if (!policy) {
      warnings.push(`⚠  Package "${pkg}" has no policy entry — add it to scripts/ci/policy.ts`);
      continue;
    }

    const missing = policy.required.filter((s) => !(s in scripts));
    if (missing.length > 0) {
      violations.push({ pkg, missing });
    }
  }

  // Print warnings
  for (const w of warnings) console.warn(w);

  // Print violations
  if (violations.length > 0) {
    console.error("\n❌ CI Policy violations found:\n");
    for (const { pkg, missing } of violations) {
      console.error(`  ${pkg}: missing scripts [${missing.join(", ")}]`);
    }
    console.error(
      "\nFix: add the missing scripts to each package.json, or update docs/ci-policy.md to grant an exception.\n"
    );
    process.exit(1);
  }

  console.log(`✅ All ${packages.length} packages pass CI policy checks.`);
}

main();
