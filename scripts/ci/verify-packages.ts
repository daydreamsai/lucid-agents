#!/usr/bin/env bun
/**
 * CI Package Verification Script
 *
 * Validates that all packages in the monorepo have the required scripts
 * as defined in docs/ci-policy.md
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Packages exempt from script requirements (config packages, generated, etc.)
const ALLOWLISTED_PACKAGES = new Set([
  '@lucid-agents/eslint-config',
  '@lucid-agents/prettier-config',
  '@lucid-agents/api-sdk', // Uses codegen
  '@lucid-agents/integration-tests', // Test-only package
]);

// Required scripts for standard packages
const REQUIRED_SCRIPTS = ['build', 'type-check', 'lint', 'format:check'] as const;

// Optional recommended scripts
const RECOMMENDED_SCRIPTS = ['clean', 'format', 'lint:fix'] as const;

interface PackageJson {
  name: string;
  private?: boolean;
  scripts?: Record<string, string>;
}

interface ValidationResult {
  package: string;
  path: string;
  missing: string[];
  present: string[];
  warnings: string[];
}

async function getPackageDirs(): Promise<string[]> {
  const packagesDir = join(process.cwd(), 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function readPackageJson(packageDir: string): Promise<PackageJson | null> {
  const pkgPath = join(process.cwd(), 'packages', packageDir, 'package.json');
  try {
    const content = await readFile(pkgPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function validatePackage(packageDir: string): Promise<ValidationResult | null> {
  const pkg = await readPackageJson(packageDir);

  if (!pkg) {
    console.warn(`⚠️  No package.json found in packages/${packageDir}`);
    return null;
  }

  if (ALLOWLISTED_PACKAGES.has(pkg.name)) {
    console.log(`⏭️  Skipping allowlisted package: ${pkg.name}`);
    return null;
  }

  const scripts = pkg.scripts ?? {};
  const missing: string[] = [];
  const present: string[] = [];
  const warnings: string[] = [];

  for (const script of REQUIRED_SCRIPTS) {
    if (scripts[script]) {
      present.push(script);
    } else {
      missing.push(script);
    }
  }

  for (const script of RECOMMENDED_SCRIPTS) {
    if (!scripts[script]) {
      warnings.push(`Recommended script '${script}' is missing`);
    }
  }

  return {
    package: pkg.name,
    path: `packages/${packageDir}`,
    missing,
    present,
    warnings,
  };
}

async function main(): Promise<void> {
  console.log('🔍 Verifying package scripts compliance...\n');

  const packageDirs = await getPackageDirs();
  const results: ValidationResult[] = [];
  const failures: ValidationResult[] = [];

  for (const dir of packageDirs) {
    const result = await validatePackage(dir);
    if (result) {
      results.push(result);
      if (result.missing.length > 0) {
        failures.push(result);
      }
    }
  }

  // Print results
  console.log('\n📊 Results:\n');

  for (const result of results) {
    if (result.missing.length === 0) {
      console.log(`✅ ${result.package}`);
      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          console.log(`   ⚠️  ${warning}`);
        }
      }
    } else {
      console.log(`❌ ${result.package}`);
      console.log(`   Missing: ${result.missing.join(', ')}`);
      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          console.log(`   ⚠️  ${warning}`);
        }
      }
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`Total packages checked: ${results.length}`);
  console.log(`Passed: ${results.length - failures.length}`);
  console.log(`Failed: ${failures.length}`);

  if (failures.length > 0) {
    console.log('\n❌ CI Policy verification failed!');
    console.log('Please add the missing scripts to the packages listed above.');
    console.log('See docs/ci-policy.md for script definitions.\n');
    process.exit(1);
  }

  console.log('\n✅ All packages comply with CI policy!\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
