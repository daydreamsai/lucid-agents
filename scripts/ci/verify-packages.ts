#!/usr/bin/env bun
/**
 * verify-packages.ts — Ensures every publishable package satisfies the CI
 * policy (has all required scripts).  Exit 1 on any violation.
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { REQUIRED_SCRIPTS, SKIP_PACKAGES } from "./policy";

const ROOT = resolve(import.meta.dir, "../..");
const PACKAGES_DIR = join(ROOT, "packages");

interface PackageJson {
  name?: string;
  private?: boolean;
  scripts?: Record<string, string>;
}

function isDirectory(path: string): boolean {
  try {
    return Bun.file(path).size === undefined; // fallback below
  } catch {
    return false;
  }
}

let hasErrors = false;

const entries = readdirSync(PACKAGES_DIR);

for (const entry of entries) {
  const pkgDir = join(PACKAGES_DIR, entry);
  const pkgJsonPath = join(pkgDir, "package.json");

  // Skip non-directories and files at root (tsconfig, tsup config etc.)
  if (!existsSync(pkgJsonPath)) continue;

  // Skip config-only packages
  if ((SKIP_PACKAGES as readonly string[]).includes(entry)) continue;

  const raw = readFileSync(pkgJsonPath, "utf-8");
  const pkg: PackageJson = JSON.parse(raw);

  // Skip private packages
  if (pkg.private) continue;

  const scripts = pkg.scripts ?? {};
  const missing: string[] = [];

  for (const required of REQUIRED_SCRIPTS) {
    if (!scripts[required]) {
      missing.push(required);
    }
  }

  if (missing.length > 0) {
    console.error(
      `❌ ${pkg.name ?? entry}: missing scripts → ${missing.join(", ")}`
    );
    hasErrors = true;
  } else {
    console.log(`✅ ${pkg.name ?? entry}: all required scripts present`);
  }
}

if (hasErrors) {
  console.error("\n🚨 Some packages are missing required CI scripts.");
  process.exit(1);
} else {
  console.log("\n✅ All publishable packages satisfy CI policy.");
}
