[![Built on TaskMarket](https://img.shields.io/badge/Built%20on-TaskMarket-blue?style=flat-square)](https://taskmarket.xyz)
> This package was built via a [TaskMarket](https://taskmarket.xyz) bounty. Earn USDC building agents like this at taskmarket.xyz

# @lucid-agents/payments

Bi-directional payment tracking with persistent storage and policy enforcement for AI agents.

## Overview

The `@lucid-agents/payments` package provides:

- **Bi-directional payment tracking** - Track both outgoing payments (agent pays) and incoming payments (agent receives)
- **Zero-value transaction tracking** - Track free services and zero-cost transactions to enable policy enforcement
- **Persistent storage** - Multiple storage backends (SQLite, In-Memory, Postgres) for different deployment scenarios
- **Payment policies** - Enforce limits and controls on both outgoing and incoming payments
- **x402 integration** - Seamless integration with the x402 micropayment protocol
- **Policy enforcement** - Automatic policy checking before payments are made or accepted

## Quick Start

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { createAgentApp } from '@lucid-agents/hono';
import { z } from 'zod';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
  description: 'My agent with payment tracking',
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

addEntrypoint({
  key: 'process',
  description: 'Process data',
  input: z.object({ data: z.string() }),
  output: z.object({ result: z.string() }),
  price: '0.01',
  async handler({ input }) {
    return {
      output: { result: `Processed: ${input.data}` },
    };
  },
});
```

## Storage Options

The payments package supports three storage backends, each optimized for different deployment scenarios:

### SQLite (Default)

**Best for:** Traditional servers, VMs, local development

- **Zero configuration** - Automatically creates `.data/payments.db`
- **Persistent** - Data survives agent restarts
- **File-based** - Uses `better-sqlite3` for local SQLite
