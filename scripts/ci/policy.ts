/**
 * CI Policy — defines required scripts for every publishable package.
 *
 * A package is "publishable" when its package.json does NOT contain
 * `"private": true`.  Config-only packages (eslint-config, prettier-config,
 * tsconfig.*) are excluded via the skip-list below.
 */

export const REQUIRED_SCRIPTS = [
  "build",
  "test",
  "type-check",
  "lint",
  "lint:fix",
  "format",
  "format:check",
] as const;

/** Packages that are config-only and exempt from the full policy. */
export const SKIP_PACKAGES = [
  "eslint-config",
  "prettier-config",
  "tsconfig.base.json",
  "tsconfig.build.base.json",
  "tsup.config.base.ts",
] as const;

export type RequiredScript = (typeof REQUIRED_SCRIPTS)[number];
