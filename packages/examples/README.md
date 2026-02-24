# Examples

This package contains example implementations demonstrating how to use the lucid-agents framework.

## Structure

- `src/core/` - Core framework examples (HTTP, payments, identity, streaming)
- `src/identity/` - ERC-8004 identity examples
- `src/a2a/` - Agent-to-Agent protocol examples
- `src/xmpt/` - XMPT inbox and thread-aware messaging examples

## Running Examples

Examples can be run directly with Bun:

```bash
# From the examples package
bun run src/core/full-agent.ts
bun run src/xmpt/local-messaging.ts

# Or from the repo root
bun run packages/examples/src/core/full-agent.ts
bun run packages/examples/src/xmpt/local-messaging.ts
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
