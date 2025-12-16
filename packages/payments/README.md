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
- **File-based** - Uses `better-sqlite3` for local SQLite database
- **Auto-creates directories** - Creates `.data/` directory if it doesn't exist

**Configuration:**

```typescript
import { payments } from '@lucid-agents/payments';

const agent = await createAgent({ ... })
  .use(payments({
    config: paymentsFromEnv(),
    // SQLite is the default - no configuration needed
    // Optional: specify custom path
    storage: {
      type: 'sqlite',
      sqlite: { dbPath: '.data/payments.db' } // optional
    }
  }))
  .build();
```

**When to use:**
- Traditional server deployments
- VMs with persistent disk
- Local development
- Single-instance deployments

### In-Memory

**Best for:** Serverless without file access, testing

- **No file system required** - Pure in-memory storage using JavaScript `Map`
- **Ephemeral** - Data is lost when the process restarts or invocation ends
- **Zero overhead** - Fastest option with no I/O
- **Testing friendly** - Perfect for unit tests

**Configuration:**

```typescript
import { payments } from '@lucid-agents/payments';

const agent = await createAgent({ ... })
  .use(payments({
    config: paymentsFromEnv(),
    storage: {
      type: 'in-memory'
    }
  }))
  .build();
```

**When to use:**
- Serverless functions without file system access (e.g., AWS Lambda with read-only filesystem)
- Unit tests and integration tests
- Temporary tracking that doesn't need persistence
- Development environments where data loss is acceptable

### Postgres

**Best for:** Serverless with persistence needs, multi-agent deployments

- **Remote database** - Uses PostgreSQL via `pg` client
- **Shared state** - Multiple agent instances can share the same database
- **Persistent** - Data survives all restarts and invocations
- **Fully async** - Non-blocking operations, no event loop blocking

**Configuration:**

```typescript
import { payments } from '@lucid-agents/payments';

const agent = await createAgent({ ... })
  .use(payments({
    config: paymentsFromEnv(),
    storage: {
      type: 'postgres',
      postgres: {
        connectionString: process.env.DATABASE_URL // required
      }
    }
  }))
  .build();
```

**Environment variable:**

```bash
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

**When to use:**
- Serverless functions with database access (e.g., Vercel, Netlify with Postgres)
- Multi-instance deployments where agents need shared state
- Production environments requiring high availability
- When you need to query payment data from external tools

**Schema:** The Postgres storage automatically creates the required table and indexes on first use.

## Zero-Value Transaction Tracking

The payment tracker records **all transactions**, including those with zero value (free services). This enables:

- **Policy enforcement on free services** - Block or rate-limit free endpoints using the same policy system
- **Usage analytics** - Track how often free services are used
- **Consistent behavior** - Apply the same controls regardless of whether a service is paid or free

This means even when `price: "0"` or when no payment is required, the transaction is still recorded in the payment storage and subject to policy checks like rate limits and recipient restrictions.

## Payment Policies

Payment policies allow you to control both outgoing payments (when your agent pays others) and incoming payments (when others pay your agent).

### Outgoing Payment Policies

Control how much your agent can spend:

```typescript
{
  name: 'Daily Spending Limit',
  outgoingLimits: {
    global: {
      maxPaymentUsd: 10.0,      // Max per payment
      maxTotalUsd: 1000.0,       // Max total spending
      windowMs: 86400000         // 24 hour window
    },
    perTarget: {
      'https://agent.example.com': {
        maxTotalUsd: 500.0       // Per-target limit
      }
    },
    perEndpoint: {
      'https://agent.example.com/entrypoints/process/invoke': {
        maxTotalUsd: 100.0       // Per-endpoint limit
      }
    }
  },
  allowedRecipients: [
    'https://trusted.example.com',
    '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
  ],
  blockedRecipients: [
    'https://untrusted.example.com',
    '0x1234567890123456789012345678901234567890'
  ],
  rateLimits: {
    maxPayments: 100,
    windowMs: 3600000            // 1 hour
  }
}
```

### Incoming Payment Policies

Control which payments your agent accepts:

```typescript
{
  name: 'Incoming Payment Controls',
  incomingLimits: {
    global: {
      maxPaymentUsd: 100.0,      // Max per incoming payment
      maxTotalUsd: 5000.0,       // Max total incoming
      windowMs: 86400000         // 24 hour window
    },
    perSender: {
      '0x1234567890123456789012345678901234567890': {
        maxTotalUsd: 1000.0      // Per-sender limit
      }
    },
    perEndpoint: {
      '/entrypoints/process/invoke': {
        maxTotalUsd: 500.0       // Per-endpoint limit
      }
    }
  },
  allowedSenders: [
    'https://trusted.example.com',
    '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
  ],
  blockedSenders: [
    'https://untrusted.example.com',
    '0x1234567890123456789012345678901234567890'
  ]
}
```

**Important:** Due to x402 protocol limitations, wallet-based sender checks and incoming limits can only be evaluated *after* payment is received. Domain-based checks can block before payment.

### Policy Enforcement Flow

**Outgoing Payments:**
1. Policy check happens **before** payment
2. If policy violation → Payment is blocked (403 Forbidden)
3. If policy passes → Payment proceeds

**Incoming Payments:**
1. **Domain-based checks** happen **before** payment (using `Origin`/`Referer` headers)
   - If blocked → Return 403 Forbidden (payment not received)
2. **x402 payment validation** happens
3. **Wallet-based checks and incoming limits** happen **after** payment
   - If blocked → Return 403 Forbidden (payment already received - x402 limitation)

### Loading Policies from Config

```typescript
import { policiesFromConfig } from '@lucid-agents/payments';
import { join } from 'node:path';

const agent = await createAgent({ ... })
  .use(payments({
    config: paymentsFromEnv(),
    policies: join(import.meta.dir, 'payment-policies.json')
  }))
  .build();
```

See `packages/examples/src/payments/payment-policies.json.example` for a complete policy configuration example.

## API Reference

### PaymentTracker

Tracks both outgoing and incoming payments:

```typescript
import { createPaymentTracker, createSQLitePaymentStorage } from '@lucid-agents/payments';

const storage = createSQLitePaymentStorage();
const tracker = createPaymentTracker(storage);

// Record outgoing payment
await tracker.recordOutgoing('group-name', 'global', 1_000_000n); // 1 USDC

// Record incoming payment
await tracker.recordIncoming('group-name', 'global', 1_000_000n); // 1 USDC

// Get totals
const outgoingTotal = await tracker.getOutgoingTotal('group-name', 'global');
const incomingTotal = await tracker.getIncomingTotal('group-name', 'global');

// Check limits
const result = await tracker.checkOutgoingLimit(
  'group-name',
  'global',
  100.0,        // maxTotalUsd
  86400000,     // windowMs (24 hours)
  1_000_000n    // requestedAmount
);
if (!result.allowed) {
  console.log('Limit exceeded:', result.reason);
}
```

### Storage Implementations

```typescript
import {
  createSQLitePaymentStorage,
  createInMemoryPaymentStorage,
  createPostgresPaymentStorage,
} from '@lucid-agents/payments';

// SQLite (default)
const sqliteStorage = createSQLitePaymentStorage(); // Uses .data/payments.db
const sqliteStorageCustom = createSQLitePaymentStorage('.data/custom.db');

// In-Memory
const memoryStorage = createInMemoryPaymentStorage();

// Postgres
const postgresStorage = createPostgresPaymentStorage(
  process.env.DATABASE_URL!
);
```

### Utility Functions

```typescript
import {
  extractSenderDomain,
  extractPayerAddress,
  parsePriceAmount,
} from '@lucid-agents/payments';

// Extract domain from request headers
const domain = extractSenderDomain(
  req.headers.origin,
  req.headers.referer
);

// Extract payer address from x402 response header
const payerAddress = extractPayerAddress(
  res.headers.get('X-PAYMENT-RESPONSE')
);

// Parse price string to bigint (USDC has 6 decimals)
const amount = parsePriceAmount('1.5'); // Returns 1_500_000n
```

## Serverless Considerations

### AWS Lambda

**Option 1: In-Memory (Ephemeral)**
```typescript
storage: { type: 'in-memory' }
```
- Data lost between invocations
- Fastest option
- No file system or database required

**Option 2: Postgres (Persistent)**
```typescript
storage: {
  type: 'postgres',
  postgres: { connectionString: process.env.DATABASE_URL }
}
```
- Data persists across invocations
- Requires RDS or managed Postgres
- Shared state across Lambda instances

### Vercel / Netlify

**Postgres (Recommended)**
```typescript
storage: {
  type: 'postgres',
  postgres: { connectionString: process.env.DATABASE_URL }
}
```
- Use Vercel Postgres or Netlify Postgres
- Data persists across deployments
- Shared state across serverless functions

### Traditional Servers / VMs

**SQLite (Recommended)**
```typescript
storage: { type: 'sqlite' } // or omit for default
```
- Zero configuration
- Persistent local storage
- Best performance for single-instance deployments

## Environment Variables

```bash
# Required for payments
PAYMENTS_RECEIVABLE_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0
FACILITATOR_URL=https://facilitator.daydreams.systems
NETWORK=base-sepolia

# Optional for Postgres storage
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

## Examples

- **Policy Agent** - `packages/examples/src/payments/policy-agent/` - Demonstrates outgoing payment policies
- **Receivables Policies** - `packages/examples/src/payments/receivables-policies/` - Demonstrates incoming payment policies
- **Blocked Domain** - `packages/examples/src/payments/blocked-domain/` - Domain-based blocking
- **Blocked Wallet** - `packages/examples/src/payments/blocked-wallet/` - Wallet-based blocking

## Related Packages

- `@lucid-agents/analytics` - Payment analytics and reporting
- `@lucid-agents/wallet` - Wallet management for making payments
- `@lucid-agents/identity` - ERC-8004 identity and trust

## Type Definitions

All payment-related types are exported from `@lucid-agents/types/payments`:

```typescript
import type {
  PaymentsConfig,
  PaymentPolicyGroup,
  PaymentDirection,
  PaymentRecord,
  OutgoingLimit,
  IncomingLimit,
} from '@lucid-agents/types/payments';
```

