[![Built on TaskMarket](https://img.shields.io/badge/Built%20on-TaskMarket-blue?style=flat-square)](https://taskmarket.xyz)
> This package was built via a [TaskMarket](https://taskmarket.xyz) bounty. Earn USDC building agents like this at taskmarket.xyz

# @lucid-agents/core

`@lucid-agents/core` is the core runtime for building AI agents with typed entrypoints, discovery endpoints, monetization hooks, and trust metadata. It provides the shared runtime logic used by adapter packages like `@lucid-agents/hono` and `@lucid-agents/tanstack`.

**Note:** For most use cases, you'll want to use one of the adapter packages (`@lucid-agents/hono` or `@lucid-agents/tanstack`) rather than importing from this core package directly.

## Highlights

- Protocol-agnostic core runtime - not tied to any specific protocol (HTTP, WebSocket, etc.)
- Extension-based architecture - add features via `.use()` method
- Type-safe entrypoints with optional Zod input and output schemas.
- Automatic manifest building with extension hooks.
- Shared runtime configuration with environment + runtime overrides.
- ERC-8004 trust and AP2 manifest integration via extensions.
- Utilities for x402-enabled LLM calls, agent wallets, and identity registries.

**Note:** HTTP-specific functionality (handlers, invoke, stream) is provided by the `@lucid-agents/http` extension, not the core package.

## Install & Import

This is the core runtime package. For building agents, use one of the adapter packages:

**Hono Adapter:**

```ts
import { createAgentApp } from '@lucid-agents/hono';
import type { EntrypointDef, AgentMeta } from '@lucid-agents/core';
```

**Express Adapter:**

```ts
import { createAgentApp } from '@lucid-agents/express';
import type { EntrypointDef, AgentMeta } from '@lucid-agents/core';
```

**TanStack Adapter:**

```ts
import { createTanStackRuntime } from '@lucid-agents/tanstack';
import type { EntrypointDef, AgentMeta } from '@lucid-agents/core';
```

Subpath exports (shared across adapters):

- `@lucid-agents/core` — main exports including types (EntrypointDef, AgentMeta, etc.)
- `@lucid-agents/core/utils` — focused helpers

## Core Concepts

### Core Runtime

This package provides the core runtime logic via an extension-based API. Use `creat
