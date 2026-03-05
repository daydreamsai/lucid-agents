# CI Policy

## Package Classifications

### Publishable Packages
All packages under `packages/` that do NOT have `"private": true` in their `package.json` are considered publishable and must comply with the CI policy.

### Exempt Packages
The following config-only packages are exempt from the full policy:
- `eslint-config` — shared ESLint configuration
- `prettier-config` — shared Prettier configuration
- `tsconfig.base.json` — shared TypeScript base config (file, not package)
- `tsconfig.build.base.json` — shared TypeScript build config (file, not package)
- `tsup.config.base.ts` — shared tsup config (file, not package)

Private packages (`"private": true`) are also exempt.

## Required Scripts

Every publishable, non-exempt package must have the following npm scripts:

| Script | Purpose | Default Implementation |
|--------|---------|----------------------|
| `build` | Compile/bundle the package | `tsup` |
| `test` | Run unit tests | `bun test` |
| `type-check` | TypeScript type checking | `tsc -p tsconfig.json --noEmit` |
| `lint` | Check for lint issues | `eslint src --ext .ts` |
| `lint:fix` | Auto-fix lint issues | `eslint src --ext .ts --fix` |
| `format` | Format source files | `prettier --write .` |
| `format:check` | Check formatting | `prettier --check .` |

## Verification

Run the policy verification script:

```bash
bun run scripts/ci/verify-packages.ts
```

This is also wired into CI and runs on every push/PR.

## Adding Missing Scripts

If a new package is added without all required scripts, run:

```bash
bun run scripts/ci/add-missing-scripts.ts
```

This will add default implementations for any missing scripts. It's safe to re-run.

## ESLint Configuration

All packages should have a `.eslintrc.cjs` that extends `@lucid-agents/eslint-config`:

```js
module.exports = {
  extends: ['@lucid-agents/eslint-config'],
  env: { node: true, es2022: true },
  globals: { RequestInfo: 'readonly', RequestInit: 'readonly' },
};
```

## CI Pipeline Phases

1. **Verify Policy** — checks all packages have required scripts
2. **Quality Checks** — build, typecheck, lint, format, test (Bun version matrix)
3. **Integration Tests** — cross-package tests in `packages/integration-tests/`
4. **CLI Smoke Tests** — scaffold every template and verify it compiles
5. **Release Gates** — all checks must pass before publish in `release.yml` and `release-bot.yml`
