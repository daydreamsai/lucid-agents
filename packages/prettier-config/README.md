# @lucid-agents/prettier-config

Shared Prettier configuration for Lucid Agents monorepo packages.

## Features

- Single quotes for strings
- 2-space indentation
- Semicolons enabled
- 80 character line width
- Trailing commas (ES5)
- LF line endings

## Setup

### 1. Install in your package

```bash
# In your package directory
bun add -D @lucid-agents/prettier-config
```

### 2. Create `.prettierignore`

Copy the example file or create a new one:

```bash
cp ../prettier-config/.prettierignore.example .prettierignore
```

The example includes common patterns. Customize for your package:

- **Build outputs**: Always ignore `dist/`, `build/`, `*.tsbuildinfo`
- **Config files**: Ignore `tsconfig.json`, `.eslintrc.cjs`, etc.
- **Generated files**: Add any generated code patterns
- **Templates**: If your package scaffolds files

### 3. Add scripts to `package.json`

```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

## Configuration

The root `prettier.config.js` already imports this package:

```js
module.exports = require('./packages/prettier-config');
```

Individual packages inherit this automatically.

## Formatting Rules

```js
{
  semi: true,                    // Use semicolons
  trailingComma: 'es5',          // Trailing commas where valid in ES5
  singleQuote: true,             // Single quotes for strings
  printWidth: 80,                // Wrap at 80 characters
  tabWidth: 2,                   // 2 spaces per indent
  useTabs: false,                // Use spaces, not tabs
  bracketSpacing: true,          // { foo: bar }
  bracketSameLine: false,        // JSX brackets on new line
  arrowParens: 'avoid',          // x => x (omit parens when possible)
  endOfLine: 'lf',               // Unix line endings
  quoteProps: 'as-needed',       // Only quote when needed
  proseWrap: 'preserve',         // Don't wrap markdown
}
```

## Common Ignore Patterns

### Essential Ignores

Always ignore these:

```gitignore
dist/
build/
*.tsbuildinfo
node_modules/
*.log
.DS_Store
```

### Config Files

Don't format these (they have specific formatting):

```gitignore
tsconfig.json
tsconfig.*.json
*.config.js
*.config.ts
.eslintrc.cjs
```

### Package-Specific Examples

**For packages with generated code:**

```gitignore
src/generated/
src/abi/*.json
```

**For CLI packages with templates:**

```gitignore
templates/
```

## Running Formatting

```bash
# Format all files
bun run format

# Check formatting (CI)
bun run format:check

# Using just
just format-fix <package-name>
just format-check <package-name>
```

## Troubleshooting

### Files not being formatted

Check `.prettierignore` - the pattern might be too broad.

### Config files being formatted

Add them to `.prettierignore`:

```gitignore
tsconfig.json
*.config.js
```

### Templates being formatted

Add the templates directory:

```gitignore
templates/
```
