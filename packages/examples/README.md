# Examples

This package contains example implementations demonstrating how to use the lucid-agents framework.

## Structure

- `src/core/` - Core framework examples (HTTP, payments, identity, streaming)
- `src/identity/` - ERC-8004 identity examples
- `src/a2a/` - Agent-to-Agent protocol examples

## Running Examples

Examples can be run directly with Bun:

```bash
# From the examples package
bun run src/core/full-agent.ts

# Or from the repo root
bun run packages/examples/src/core/full-agent.ts

# NASA NeoWs risk agent
bun run packages/examples/src/core/nasa-neows-agent.ts
```

## Type Checking

All examples are type-checked:

```bash
bun run type-check
```

## Linting

Lint examples:

```bash
bun run lint
bun run lint:fix
```
