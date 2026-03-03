# CI Policy

This document defines the required CI scripts for all packages in the lucid-agents monorepo.

## Required Scripts by Package Type

### Standard Packages (publishable libraries)

All publishable packages **must** have the following scripts:

| Script | Description | Required |
|--------|-------------|----------|
| `build` | Build the package (typically via tsup) | ✅ Yes |
| `type-check` | TypeScript type checking (`tsc --noEmit`) | ✅ Yes |
| `lint` | ESLint checking | ✅ Yes |
| `format:check` | Prettier format verification | ✅ Yes |
| `clean` | Remove build artifacts | Recommended |
| `test` | Run tests (if package has tests) | Conditional |

### Config Packages (allowlisted)

The following packages are configuration-only and are exempt from script requirements:

- `@lucid-agents/eslint-config` - ESLint shared configuration
- `@lucid-agents/prettier-config` - Prettier shared configuration

### Generated/Special Packages

Some packages have special build processes:

- `@lucid-agents/api-sdk` - Uses codegen, exempt from standard build

## Script Definitions

### lint

```json
{
  "lint": "eslint src --ext .ts"
}
```

### format:check

```json
{
  "format:check": "prettier --check ."
}
```

### type-check

```json
{
  "type-check": "tsc -p tsconfig.json --noEmit"
}
```

### build

```json
{
  "build": "tsup"
}
```

## CI Enforcement

The `scripts/ci/verify-packages.ts` script validates all packages conform to this policy. It runs as part of CI and will fail if:

1. A standard package is missing required scripts
2. A package has scripts that don't match expected patterns

### Running Verification

```bash
bun run scripts/ci/verify-packages.ts
```

### Allowlist Configuration

Packages can be allowlisted in the verification script by adding them to the `ALLOWLISTED_PACKAGES` constant.

## Adding New Packages

When creating a new package:

1. Copy scripts from an existing package (e.g., `@lucid-agents/core`)
2. Ensure `tsconfig.json` extends from `../tsconfig.base.json`
3. Run `bun run scripts/ci/verify-packages.ts` to verify compliance
4. Add tests if the package has meaningful logic to test
