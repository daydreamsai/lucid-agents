# @lucid-agents/eslint-config

Shared ESLint configuration for Lucid Agents monorepo packages.

## Features

- TypeScript support with recommended rules
- Automatic import sorting with `simple-import-sort`
- Unused imports removal with `unused-imports`
- Import organization with `import` plugin
- Prettier integration (disables conflicting rules)

## Setup

### 1. Install in your package

```bash
# In your package directory
bun add -D @lucid-agents/eslint-config
```

### 2. Create `.eslintrc.cjs`

Copy the example file or create a new one:

```bash
cp ../eslint-config/.eslintrc.cjs.example .eslintrc.cjs
```

Or create manually:

```js
module.exports = {
  extends: ['@lucid-agents/eslint-config'],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // Add package-specific rules here
  },
};
```

### 3. Add scripts to `package.json`

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix"
  }
}
```

### 4. Common Customizations

#### Add Global Types

If ESLint doesn't recognize certain globals:

```js
module.exports = {
  extends: ['@lucid-agents/eslint-config'],
  globals: {
    NodeJS: 'readonly',
    RequestInfo: 'readonly',
    RequestInit: 'readonly',
  },
};
```

#### Allow `while(true)` Loops

For interactive CLI prompts:

```js
module.exports = {
  extends: ['@lucid-agents/eslint-config'],
  rules: {
    'no-constant-condition': ['error', { checkLoops: false }],
  },
};
```

## Rules Overview

### TypeScript

- Warns on `any` types
- Warns on unused variables (with `_` prefix exception)
- Warns on empty object types

### Imports

- Enforces sorted imports (auto-fixable)
- Removes unused imports (auto-fixable)
- Prevents duplicate imports

### General

- Enforces `const` over `let` where possible
- Prohibits `var`
- Warns on unused variables

## Running Linting

```bash
# Check for issues
bun run lint

# Auto-fix issues
bun run lint:fix

# Using just
just lint-check <package-name>
just lint-fix <package-name>
```
