# CI Policy

This document defines the required scripts and CI coverage for every package in the `lucid-agents` monorepo. Closes #116.

## Required Scripts

Every package that contains source code **must** implement the following scripts:

| Script | Purpose | Exceptions |
|--------|---------|------------|
| `build` | Compile TypeScript to `dist/` | `eslint-config`, `prettier-config`, `types` |
| `lint` | Run ESLint on `src/` | `eslint-config`, `prettier-config`, `types` |
| `format:check` | Run Prettier check | none |
| `type-check` | Run `tsc --noEmit` | `eslint-config`, `prettier-config` |
| `test` | Run unit tests | optional — packages with no logic may omit |

## Package Classification

### Full CI (build + lint + format:check + type-check + test)
- `core`
- `http`
- `payments`
- `wallet`
- `identity`
- `a2a`
- `ap2`
- `hono`
- `express`
- `tanstack`
- `scheduler`
- `analytics`
- `cli`
- `api-sdk`

### Config-only packages (format:check only)
- `eslint-config` — exports ESLint config, no build step needed
- `prettier-config` — exports Prettier config, no build step needed

### Type-only packages (build + type-check)
- `types` — type definitions only, lint/test not required

### Example packages (best-effort)
- `examples` — demonstrative code, CI runs but failures are non-blocking

## Enforcement

The script `scripts/ci/verify-packages.ts` enforces this policy at CI time.
Any package missing a required script will cause CI to fail.

Exceptions must be documented in this file with a rationale.

## Allowlisted Exceptions

| Package | Missing Script | Rationale |
|---------|---------------|-----------|
| `eslint-config` | `build`, `lint`, `type-check` | Config-only package, no TypeScript source |
| `prettier-config` | `build`, `lint`, `type-check` | Config-only package, exports a JS object |
| `types` | `lint` | Type definitions only, linting not applicable |
