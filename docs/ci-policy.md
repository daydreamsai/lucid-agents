# CI Policy: Package Script Requirements (Phase 0 Draft)

## Goals
- Enforce consistent quality gates across all packages.
- Make CI failures deterministic and attributable to a specific package.
- Ensure every package is buildable, linted, formatted, type-checked, and testable.

## Required Scripts (All Packages)
Each package in `packages/*` must provide the following scripts:
- `build`
- `lint`
- `format`
- `format:check`
- `type-check`
- `test`

Notes:
- Scripts may be no-ops (e.g., `echo "no tests"`), but they must exist so CI can enforce them uniformly.
- The intent is that runtime packages run real commands; no-ops are a temporary escape hatch only.

## Script Spec: scripts/ci/verify-packages.ts
Purpose: fail CI if any package in `packages/*` is missing required scripts.

Inputs:
- `packages/*/package.json`
- Required script list (build, lint, format, format:check, type-check, test)

Behavior:
- Enumerate packages under `packages/`.
- For each package, list missing scripts.
- Exit with code 1 and a readable report if any are missing.
- Exit 0 if all packages are compliant.

Output format (example):
```
CI policy check failed:
- @lucid-agents/express: missing lint, format, format:check, type-check, test
```

Notes:
- No allowlist unless explicitly approved; this policy enforces all packages uniformly.

## Current Inventory (as of 2026-02-01)
| Package | Present scripts | Missing scripts |
| --- | --- | --- |
| @lucid-agents/a2a | build, type-check, test | lint, format, format:check |
| @lucid-agents/analytics | build, type-check | lint, format, format:check, test |
| @lucid-agents/ap2 | build, type-check, test | lint, format, format:check |
| @lucid-agents/api-sdk | none | build, lint, format, format:check, type-check, test |
| @lucid-agents/cli | build, lint, format, format:check, type-check, test | none |
| @lucid-agents/core | build, lint, format, format:check, type-check | test |
| @lucid-agents/eslint-config | none | build, lint, format, format:check, type-check, test |
| @lucid-agents/examples | build, lint, format, format:check, type-check | test |
| @lucid-agents/express | build | lint, format, format:check, type-check, test |
| @lucid-agents/hono | build, type-check | lint, format, format:check, test |
| @lucid-agents/http | build, type-check | lint, format, format:check, test |
| @lucid-agents/identity | build, lint, format, format:check, type-check | test |
| @lucid-agents/payments | build, type-check | lint, format, format:check, test |
| @lucid-agents/prettier-config | none | build, lint, format, format:check, type-check, test |
| @lucid-agents/scheduler | build, type-check, test | lint, format, format:check |
| @lucid-agents/tanstack | build, type-check | lint, format, format:check, test |
| @lucid-agents/types | build, type-check | lint, format, format:check, test |
| @lucid-agents/wallet | build, type-check, test | lint, format, format:check |

## Next Steps (Phase 1)
- Add missing scripts to every package.
- Implement `scripts/ci/verify-packages.ts` to enforce this policy in CI.
- Wire the policy check into `.github/workflows/ci.yml`.
