# @lucid-agents/types

Shared TypeScript type definitions for the lucid-agents framework.

## Overview

This package provides the core type definitions used across all lucid-agents packages. It has **zero dependencies** on other `@lucid-agents` packages, making it a pure leaf package in the dependency graph.

## What's Included

- **Core Types**: `AgentMeta`, `AgentContext`, `Usage`
- **Entrypoint Types**: `EntrypointDef`, `EntrypointHandler`, `EntrypointStreamHandler`
- **Pricing Types**: `EntrypointPrice`, `PaymentsConfig`, `SolanaAddress`
- **Streaming Types**: `StreamEnvelope`, `StreamResult`, and related stream types
- **Re-exports**: `Network` from `x402/types`

## Installation

```bash
bun add @lucid-agents/types
```

## Usage

```typescript
import type {
  AgentMeta,
  EntrypointDef,
  PaymentsConfig,
  Network,
} from '@lucid-agents/types';

const meta: AgentMeta = {
  name: 'my-agent',
  version: '1.0.0',
  description: 'My agent description',
};

const entrypoint: EntrypointDef = {
  key: 'echo',
  description: 'Echo back input',
  price: '1000',
  network: 'ethereum',
  handler: async (ctx) => {
    return {
      output: ctx.input,
      usage: { total_tokens: 0 },
    };
  },
};
```

## Design Philosophy

This package follows the **types-in-core** pattern used by mature TypeScript frameworks like TanStack. By centralizing type definitions:

- **Zero Circular Dependencies**: All other packages import from this package, never the reverse
- **Single Source of Truth**: Type contracts are defined in one place
- **Better IDE Support**: Type inference and autocomplete work seamlessly
- **Smaller Bundles**: Types are erased at compile time, adding no runtime overhead

## Dependencies

This package has no dependencies on other `@lucid-agents` packages. It only depends on:

- `zod` (peer dependency for type inference)
- `x402` (for `Network` type re-export)

## License

MIT

