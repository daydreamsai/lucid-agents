/**
 * CI Policy — defines required scripts per package.
 * Closes #116.
 */

export type ScriptName = "build" | "lint" | "format:check" | "type-check" | "test";

export interface PackagePolicy {
  /** Required scripts that must be present */
  required: ScriptName[];
  /** Optional scripts — present is fine, absent is fine */
  optional?: ScriptName[];
  /** Human-readable reason for any exceptions */
  note?: string;
}

/** Packages that are config-only and have no TS source */
const CONFIG_ONLY: PackagePolicy = {
  required: ["format:check"],
  note: "Config-only package — no build, lint, or type-check needed",
};

/** Packages with type definitions only */
const TYPES_ONLY: PackagePolicy = {
  required: ["build", "format:check", "type-check"],
  note: "Type-definition package — lint not applicable",
};

/** Standard source packages */
const STANDARD: PackagePolicy = {
  required: ["build", "lint", "format:check", "type-check"],
  optional: ["test"],
};

export const POLICY: Record<string, PackagePolicy> = {
  "a2a": STANDARD,
  "analytics": STANDARD,
  "ap2": STANDARD,
  "api-sdk": STANDARD,
  "cli": STANDARD,
  "core": STANDARD,
  "eslint-config": CONFIG_ONLY,
  "examples": { ...STANDARD, note: "Example package — CI runs but failures are advisory" },
  "express": STANDARD,
  "hono": STANDARD,
  "http": STANDARD,
  "identity": STANDARD,
  "payments": STANDARD,
  "prettier-config": CONFIG_ONLY,
  "scheduler": STANDARD,
  "tanstack": STANDARD,
  "types": TYPES_ONLY,
  "wallet": STANDARD,
};
