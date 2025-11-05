# Contributing to Lucid Agents

Thank you for your interest in contributing to Lucid Agents! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Pull Requests](#pull-requests)
- [Release Process](#release-process)
- [Code Standards](#code-standards)

## Getting Started

### Prerequisites

- **Bun** >= 20.9.0 (install from [bun.sh](https://bun.sh))
- **Git** for version control
- A code editor (VS Code recommended)

### Initial Setup

1. **Clone the repository**

```bash
git clone https://github.com/lucid-dreams-ai/lucid-agents.git
cd lucid-agents
```

2. **Install dependencies**

```bash
bun install
```

This installs all dependencies for the monorepo and individual packages.

### Monorepo Structure

The repository is organized as a monorepo with multiple packages:

```
lucid-agents/
├── packages/
│   ├── agent-kit/              # Core agent runtime
│   ├── agent-kit-identity/     # ERC-8004 identity toolkit
│   └── create-agent-kit/       # CLI scaffolding tool
├── scripts/                    # Build and release scripts
├── package.json                # Root package configuration
└── readme.md                   # Main documentation
```

Each package has its own:
- `package.json` - Dependencies and scripts
- `src/` - Source code
- `__tests__/` - Test files (where applicable)
- `README.md` - Package-specific documentation

## Development Workflow

### Building Packages

Build all packages:

```bash
bun run build:packages
```

Build a specific package:

```bash
cd packages/agent-kit
bun run build
```

### Development Mode

Most packages support watch mode for development:

```bash
cd packages/agent-kit
bun run dev
```

### Running Examples

Packages include example files demonstrating usage:

```bash
# Run an example from agent-kit
cd packages/agent-kit
bun run examples/full-agent.ts

# Run an example from agent-kit-identity
cd packages/agent-kit-identity
bun run examples/quick-start.ts
```

## Making Changes

### Branch Naming

Use descriptive branch names that indicate the type of change:

- `feature/add-new-entrypoint-type` - New features
- `fix/payment-validation-bug` - Bug fixes
- `docs/update-api-reference` - Documentation updates
- `refactor/simplify-config-loading` - Code refactoring
- `test/add-identity-registry-tests` - Test additions

### Commit Messages

Write clear, concise commit messages following these guidelines:

**Format:**
```
<type>: <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, no logic change)
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

**Examples:**

```
feat: add streaming support to entrypoints

Implements Server-Sent Events (SSE) streaming for long-running
agent operations. Adds stream() handler alongside existing handler().

Closes #42
```

```
fix: resolve payment validation error for zero prices

Previously, zero prices would cause validation to fail. Now correctly
handles zero as valid when payments are optional.

Fixes #123
```

### Package-Specific Development

When working on a specific package:

1. **Navigate to the package directory**
   ```bash
   cd packages/agent-kit
   ```

2. **Make your changes** in `src/`

3. **Update tests** in `__tests__/` (if applicable)

4. **Update documentation** in `README.md`

5. **Build and test locally**
   ```bash
   bun run build
   bun test
   ```

## Testing

### Running Tests

Run all tests across the monorepo:

```bash
bun test
```

Run tests for a specific package:

```bash
cd packages/agent-kit
bun test
```

Run tests in watch mode:

```bash
bun test --watch
```

### Writing Tests

Tests are located in `__tests__/` directories within each package.

**Test file naming:**
- `*.test.ts` - Unit tests
- `*.integration.test.ts` - Integration tests

**Example test structure:**

```typescript
import { describe, test, expect } from "bun:test";
import { createAgentApp } from "../src/app";

describe("createAgentApp", () => {
  test("creates app with metadata", () => {
    const { app, config } = createAgentApp({
      name: "test-agent",
      version: "1.0.0",
    });

    expect(app).toBeDefined();
    expect(config).toBeDefined();
  });
});
```

### Test Coverage

Aim for good test coverage, especially for:
- Public APIs
- Core functionality
- Edge cases and error handling
- Breaking changes

## Pull Requests

### Before Submitting

1. **Test your changes**
   ```bash
   bun test
   ```

2. **Build packages**
   ```bash
   bun run build:packages
   ```

3. **Check TypeScript types**
   ```bash
   bunx tsc --noEmit
   ```

4. **Update documentation** if you've changed APIs

### PR Checklist

- [ ] Code follows TypeScript and ESM standards
- [ ] Tests pass locally
- [ ] New functionality includes tests
- [ ] Documentation is updated (README, inline comments)
- [ ] Commit messages follow guidelines
- [ ] PR description explains the changes
- [ ] Related issues are referenced

### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Motivation
Why is this change needed?

## Changes
- List of specific changes made
- Can be bullet points

## Testing
How was this tested?

## Related Issues
Closes #123
Fixes #456
```

### Review Process

1. **Submit PR** - Create a pull request with a clear description
2. **Automated checks** - CI/CD runs tests and builds
3. **Code review** - Maintainers review your changes
4. **Address feedback** - Make requested changes
5. **Approval** - PR is approved by maintainers
6. **Merge** - Maintainers merge the PR

## Release Process

Releases are managed by maintainers using [Changesets](https://github.com/changesets/changesets).

### For Contributors

When making changes that should be included in release notes:

1. **Create a changeset**
   ```bash
   bun run changeset
   ```

2. **Follow the prompts:**
   - Select which packages are affected
   - Choose version bump type (major, minor, patch)
   - Write a summary of the change

3. **Commit the changeset file** along with your changes

### Version Bump Types

- **Major (1.0.0 → 2.0.0)** - Breaking changes
- **Minor (1.0.0 → 1.1.0)** - New features (backward compatible)
- **Patch (1.0.0 → 1.0.1)** - Bug fixes

### For Maintainers Only

Release workflow:

```bash
# 1. Version packages (updates package.json and CHANGELOG.md)
bun run release:version

# 2. Build and publish to npm
bun run release:publish
```

## Code Standards

### TypeScript

- **Strict mode enabled** - Use strict TypeScript settings
- **Explicit types** - Prefer explicit return types for public APIs
- **No `any`** - Avoid `any`; use `unknown` or proper types
- **ESM modules** - Use ES modules (`import`/`export`)

**Example:**

```typescript
// Good
export function createAgent(name: string): Agent {
  return { name };
}

// Avoid
export function createAgent(name) {
  return { name };
}
```

### Code Style

- **Formatting** - Use consistent indentation (2 spaces)
- **Naming** - Use descriptive names
  - Functions: `camelCase`
  - Classes: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Private members: prefix with `_`
- **Comments** - Write clear comments for complex logic
- **JSDoc** - Document public APIs with JSDoc comments

**Example:**

```typescript
/**
 * Creates a new agent application with the given metadata.
 *
 * @param meta - Agent metadata including name, version, and description
 * @param options - Optional configuration for payments, trust, etc.
 * @returns Agent app instance with helper methods
 */
export function createAgentApp(
  meta: AgentMeta,
  options?: CreateAgentAppOptions
): CreateAgentAppReturn {
  // Implementation
}
```

### File Organization

- **One export per file** (for major exports)
- **Group related utilities** in separate files
- **Index files** for clean public APIs
- **Types in separate files** when complex

### Error Handling

- **Use custom errors** for specific error cases
- **Provide context** in error messages
- **Don't swallow errors** - Always handle or propagate

**Example:**

```typescript
// Good
if (!config.payTo) {
  throw new Error(
    "PaymentsConfig.payTo is required when payments are enabled"
  );
}

// Avoid
if (!config.payTo) {
  throw new Error("Missing payTo");
}
```

### Documentation

- **README files** - Keep package READMEs up to date
- **Inline comments** - Explain complex logic
- **Examples** - Provide usage examples
- **API docs** - Document public APIs with JSDoc

## Questions?

If you have questions or need help:

- **Open an issue** - For bugs or feature requests
- **Discussions** - For general questions or ideas
- **Discord** - Join our community (link in main README)

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT).

