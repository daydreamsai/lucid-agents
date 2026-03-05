/**
 * CI Policy — defines required scripts for every publishable package.
 *
 * A package is "publishable" when its package.json does NOT contain
 * `"private": true`.  Config-only packages (eslint-config, prettier-config)
 * are excluded via the skip-list below.
 */

/**
 * Scripts that every publishable, non-exempt package must define
 * in its package.json "scripts" section.
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

/**
 * Package directory names under packages/ that are config-only
 * and exempt from the full CI policy requirements.
 */
export const SKIP_PACKAGES = [
  "eslint-config",
  "prettier-config",
] as const;

/** Type representing one of the required script names. */
export type RequiredScript = (typeof REQUIRED_SCRIPTS)[number];
