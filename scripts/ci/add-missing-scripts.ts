#!/usr/bin/env bun
/**
 * One-time script to add missing required scripts to all publishable packages.
 * Safe to re-run — only adds scripts that are missing.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { REQUIRED_SCRIPTS, SKIP_PACKAGES } from "./policy";

const ROOT = resolve(import.meta.dir, "../..");
const PACKAGES_DIR = join(ROOT, "packages");

/** Default script commands when missing */
const DEFAULTS: Record<string, string> = {
  build: "tsup",
  test: 'echo "No tests yet" && exit 0',
  "type-check": "tsc -p tsconfig.json --noEmit",
  lint: "eslint src --ext .ts",
  "lint:fix": "eslint src --ext .ts --fix",
  format: "prettier --write .",
  "format:check": "prettier --check .",
};

const entries = readdirSync(PACKAGES_DIR);
let changed = 0;

for (const entry of entries) {
  const pkgJsonPath = join(PACKAGES_DIR, entry, "package.json");
  if (!existsSync(pkgJsonPath)) continue;
  if ((SKIP_PACKAGES as readonly string[]).includes(entry)) continue;

  const raw = readFileSync(pkgJsonPath, "utf-8");
  const pkg = JSON.parse(raw);
  if (pkg.private) continue;

  const scripts = pkg.scripts ?? {};
  let modified = false;

  for (const req of REQUIRED_SCRIPTS) {
    if (!scripts[req]) {
      scripts[req] = DEFAULTS[req];
      modified = true;
    }
  }

  if (modified) {
    pkg.scripts = scripts;
    writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`✏️  Updated ${pkg.name ?? entry}`);
    changed++;
  }
}

console.log(`\nDone — ${changed} package(s) updated.`);
