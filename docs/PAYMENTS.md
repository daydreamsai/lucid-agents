# Payments Extension

The payments extension enables your agent to receive payments using the x402 protocol. It supports both EVM (Ethereum, Base) and Solana networks, and includes powerful policy controls for managing spending limits, rate limits, and recipient restrictions.

## Table of Contents

- [Overview](#overview)
- [Basic Usage](#basic-usage)
- [Configuration](#configuration)
- [Payment Policies](#payment-policies)
- [Policy File Format](#policy-file-format)
- [Advanced Usage](#advanced-usage)
- [API Reference](#api-reference)
- [Examples](#examples)

## Overview

The payments extension provides:

- **x402 Payment Processing**: Receive payments from other agents using the x402 protocol
- **Multi-Network Support**: Works with EVM chains (Ethereum, Base) and Solana
- **Payment Policies**: Control spending with limits, rate limits, and recipient restrictions
- **Automatic Manifest Integration**: Payment information is automatically added to your agent's manifest
- **Policy Enforcement**: Policies are enforced when your agent makes outbound payments to other agents

## Basic Usage

### Simple Setup

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { paymentsFromEnv } from '@lucid-agents/payments';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();
```

### With Policies

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { paymentsFromEnv } from '@lucid-agents/payments';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(http())
  .use(
    payments({
      config: paymentsFromEnv(),
      policies: 'payment-policies.json',
    })
  )
  .build();
```

### Direct Configuration

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(http())
  .use(
    payments({
      config: {
        payTo: '0x1234567890123456789012345678901234567890',
        facilitatorUrl: 'https://facilitator.daydreams.systems',
        network: 'base',
      },
      policies: 'payment-policies.json',
    })
  )
  .build();
```

## Configuration

### Environment Variables

The `paymentsFromEnv()` helper loads configuration from environment variables:

```bash
PAYMENTS_RECEIVABLE_ADDRESS=0x1234567890123456789012345678901234567890
FACILITATOR_URL=https://facilitator.daydreams.systems
NETWORK=base
```

### Supported Networks

**EVM Networks:**

- `base` - Base mainnet
- `base-sepolia` - Base Sepolia testnet
- `ethereum` - Ethereum mainnet
- `sepolia` - Ethereum Sepolia testnet

**Solana Networks:**

- `solana` - Solana mainnet
- `solana-devnet` - Solana devnet

### PaymentsConfig

```typescript
type PaymentsConfig = {
  payTo: `0x${string}` | SolanaAddress; // Your wallet address
  facilitatorUrl: Resource; // x402 facilitator URL
  network: Network; // Network identifier
  policyGroups?: PaymentPolicyGroup[]; // Optional policy groups
};
```

## Payment Policies

Payment policies allow you to control how your agent spends money when making outbound payments to other agents. Policies are evaluated **before** payment happens, and all policy groups must pass for a payment to proceed.

### Policy Activation

Policies are only activated when you provide a `policies` file path:

```typescript
.use(payments({
  config: paymentsFromEnv(),
  policies: 'payment-policies.json'  // Policies activated
}))
```

Without the `policies` option, no policy enforcement occurs.

### Policy Types

#### 1. Spending Limits

Control how much your agent can spend:

- **`maxPaymentUsd`**: Maximum amount per individual payment (stateless check)
- **`maxTotalUsd`**: Maximum total spending across all payments (stateful, tracked)
- **`windowMs`**: Time window for total spending limit (optional, defaults to lifetime)

**Scopes:**

- **`global`**: Applies to all payments
- **`perTarget`**: Applies per agent URL/domain
- **`perEndpoint`**: Applies per specific endpoint URL

#### 2. Rate Limits

Control how frequently your agent can make payments:

- **`maxPayments`**: Maximum number of payments allowed
- **`windowMs`**: Time window in milliseconds

#### 3. Recipient Controls

Whitelist or blacklist specific recipients:

- **`allowedRecipients`**: Array of allowed addresses or domains
- **`blockedRecipients`**: Array of blocked addresses or domains (takes precedence)

## Policy File Format

Create a `payment-policies.json` file in your project root:

```json
[
  {
    "name": "Daily Spending Limit",
    "spendingLimits": {
      "global": {
        "maxPaymentUsd": 10.0,
        "maxTotalUsd": 1000.0,
        "windowMs": 86400000
      },
      "perTarget": {
        "https://agent.example.com": {
          "maxTotalUsd": 500.0
        },
        "agent.example.com": {
          "maxTotalUsd": 500.0
        }
      },
      "perEndpoint": {
        "https://agent.example.com/entrypoints/process/invoke": {
          "maxTotalUsd": 100.0
        }
      }
    },
    "allowedRecipients": [
      "https://trusted.example.com",
      "0x1234567890123456789012345678901234567890"
    ],
    "blockedRecipients": ["https://untrusted.example.com"],
    "rateLimits": {
      "maxPayments": 100,
      "windowMs": 3600000
    }
  },
  {
    "name": "Strict API Usage",
    "spendingLimits": {
      "global": {
        "maxPaymentUsd": 5.0,
        "maxTotalUsd": 200.0,
        "windowMs": 86400000
      }
    }
  }
]
```

### Policy Evaluation Order

1. Policies are evaluated in the order they appear in the array
2. **All** policy groups must pass for payment to proceed
3. First violation blocks the payment and returns a 403 response
4. Evaluation stops at the first failure

### Scope Matching

**Per-Target Matching:**

- Matches full URLs: `https://agent.example.com` matches `https://agent.example.com/entrypoints/process/invoke`
- Matches domains: `agent.example.com` matches any URL on that domain
- Domain matching is case-insensitive

**Per-Endpoint Matching:**

- Matches exact endpoint URLs: `https://agent.example.com/entrypoints/process/invoke`
- Most specific match wins (endpoint > target > global)

### Example Policy Scenarios

**Scenario 1: Global Daily Budget**

```json
{
  "name": "Daily Budget",
  "spendingLimits": {
    "global": {
      "maxTotalUsd": 1000.0,
      "windowMs": 86400000
    }
  }
}
```

**Scenario 2: Per-Agent Limits**

```json
{
  "name": "Per-Agent Limits",
  "spendingLimits": {
    "perTarget": {
      "https://expensive-api.example.com": {
        "maxPaymentUsd": 50.0,
        "maxTotalUsd": 500.0
      },
      "https://cheap-api.example.com": {
        "maxPaymentUsd": 1.0,
        "maxTotalUsd": 100.0
      }
    }
  }
}
```

**Scenario 3: Rate Limiting**

```json
{
  "name": "Rate Limit",
  "rateLimits": {
    "maxPayments": 10,
    "windowMs": 60000
  }
}
```

**Scenario 4: Recipient Whitelist**

```json
{
  "name": "Trusted Recipients Only",
  "allowedRecipients": [
    "https://trusted-agent-1.example.com",
    "https://trusted-agent-2.example.com",
    "0x1234567890123456789012345678901234567890"
  ]
}
```

## Advanced Usage

### Making Payments from Your Agent

When your agent needs to make payments to other agents, use the runtime payment context:

```typescript
import { createRuntimePaymentContext } from '@lucid-agents/payments';

const context = await createRuntimePaymentContext({
  runtime: agent,
  network: 'base',
});

if (context.fetchWithPayment) {
  const response = await context.fetchWithPayment(
    'https://other-agent.com/api',
    {
      method: 'POST',
      body: JSON.stringify({ query: '...' }),
    }
  );
}
```

### Policy Enforcement

When policies are configured, they automatically wrap your agent's fetch calls:

```typescript
// Policies are automatically applied when you use fetchWithPayment
const response = await context.fetchWithPayment(
  'https://agent.example.com/api'
);

// If policy violation:
// - Returns 403 Forbidden
// - Includes error message explaining the violation
// - Payment does not proceed
```

### Manual Policy Wrapping

For advanced use cases, you can manually wrap fetch with policies:

```typescript
import { wrapBaseFetchWithPolicy } from '@lucid-agents/payments';

const policyGroups = [
  {
    name: 'My Policy',
    spendingLimits: {
      global: { maxTotalUsd: 1000.0 },
    },
  },
];

const wrappedFetch = wrapBaseFetchWithPolicy(
  fetch,
  policyGroups,
  spendingTracker,
  rateLimiter
);
```

## API Reference

### `payments(options?)`

Main extension function.

**Options:**

- `config?: PaymentsConfig | false` - Payment configuration, or `false` to disable
- `policies?: string` - Path to policy JSON file (optional)

**Returns:** Extension that adds `payments` runtime

### `paymentsFromEnv(configOverrides?)`

Loads payment configuration from environment variables.

**Parameters:**

- `configOverrides?: Partial<PaymentsConfig>` - Optional config overrides

**Returns:** `PaymentsConfig`

**Environment Variables:**

- `PAYMENTS_RECEIVABLE_ADDRESS` - Your wallet address
- `FACILITATOR_URL` - x402 facilitator URL
- `NETWORK` - Network identifier

### `PaymentsRuntime`

Runtime object available at `agent.payments`.

**Properties:**

- `config: PaymentsConfig` - Payment configuration
- `isActive: boolean` - Whether payments are active
- `spendingTracker?: SpendingTracker` - Spending tracker (if policies have total limits)
- `rateLimiter?: RateLimiter` - Rate limiter (if policies have rate limits)
- `policyGroups?: PaymentPolicyGroup[]` - Configured policy groups

**Methods:**

- `requirements(entrypoint, kind)` - Get payment requirement for an entrypoint
- `activate(entrypoint)` - Activate payments for an entrypoint

### `createRuntimePaymentContext(options)`

Creates a payment context for making outbound payments.

**Parameters:**

- `runtime: AgentRuntime` - Agent runtime
- `network?: Network` - Network override
- `fetch?: typeof fetch` - Fetch implementation
- `privateKey?: string` - Private key for signing (alternative to runtime wallet)
- `maxPaymentBaseUnits?: bigint` - Maximum payment amount
- `logger?: RuntimePaymentLogger` - Optional logger

**Returns:** `Promise<RuntimePaymentContext>`

**RuntimePaymentContext:**

- `fetchWithPayment: WrappedFetch | null` - Fetch function with payment handling
- `signer: Signer | null` - Signer for transactions
- `walletAddress: string | null` - Wallet address
- `chainId: number | null` - Chain ID

### `wrapBaseFetchWithPolicy(baseFetch, policyGroups, spendingTracker?, rateLimiter?)`

Wraps a fetch function with policy enforcement.

**Parameters:**

- `baseFetch: FetchLike` - Base fetch function
- `policyGroups: PaymentPolicyGroup[]` - Policy groups to enforce
- `spendingTracker?: SpendingTracker` - Spending tracker instance
- `rateLimiter?: RateLimiter` - Rate limiter instance

**Returns:** Wrapped fetch function

### Policy Evaluation Functions

#### `evaluatePolicyGroups(policyGroups, paymentInfo, spendingTracker?, rateLimiter?)`

Evaluates all policy groups against a payment.

**Returns:** `PolicyEvaluationResult`

#### `evaluateSpendingLimits(policyGroups, paymentInfo, spendingTracker?)`

Evaluates spending limits for policy groups.

**Returns:** `PolicyEvaluationResult`

#### `evaluateRateLimit(policyGroups, rateLimiter?)`

Evaluates rate limits for policy groups.

**Returns:** `PolicyEvaluationResult`

#### `evaluateRecipient(group, recipientAddress?, recipientDomain?)`

Evaluates recipient whitelist/blacklist for a policy group.

**Returns:** `PolicyEvaluationResult`

## Examples

### Example 1: Basic Agent with Payments

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

const agent = await createAgent({
  name: 'paid-api',
  version: '1.0.0',
  description: 'A paid API agent',
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();

agent.addEntrypoint({
  key: 'process',
  description: 'Process data',
  input: z.object({ data: z.string() }),
  output: z.object({ result: z.string() }),
  price: '1000', // 0.001 USDC
  handler: async ({ input }) => {
    return {
      output: { result: `Processed: ${input.data}` },
    };
  },
});
```

### Example 2: Agent with Spending Policies

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { paymentsFromEnv } from '@lucid-agents/payments';
import { createRuntimePaymentContext } from '@lucid-agents/payments';

const agent = await createAgent({
  name: 'orchestrator',
  version: '1.0.0',
})
  .use(http())
  .use(
    payments({
      config: paymentsFromEnv(),
      policies: 'payment-policies.json',
    })
  )
  .build();

agent.addEntrypoint({
  key: 'orchestrate',
  description: 'Orchestrate multiple agents',
  input: z.object({ task: z.string() }),
  output: z.object({ result: z.string() }),
  handler: async ({ input, runtime }) => {
    const context = await createRuntimePaymentContext({
      runtime,
      network: 'base',
    });

    // Policies are automatically enforced
    const response = await context.fetchWithPayment?.(
      'https://worker-agent.example.com/api',
      {
        method: 'POST',
        body: JSON.stringify({ task: input.task }),
      }
    );

    return {
      output: { result: await response?.json() },
    };
  },
});
```

### Example 3: Policy File

`payment-policies.json`:

```json
[
  {
    "name": "Daily Budget",
    "spendingLimits": {
      "global": {
        "maxPaymentUsd": 10.0,
        "maxTotalUsd": 1000.0,
        "windowMs": 86400000
      }
    }
  },
  {
    "name": "Trusted Recipients",
    "allowedRecipients": [
      "https://trusted-agent-1.example.com",
      "https://trusted-agent-2.example.com"
    ]
  },
  {
    "name": "Rate Limit",
    "rateLimits": {
      "maxPayments": 100,
      "windowMs": 3600000
    }
  }
]
```

### Example 4: Per-Agent Limits

```json
[
  {
    "name": "Per-Agent Budgets",
    "spendingLimits": {
      "perTarget": {
        "https://expensive-api.example.com": {
          "maxPaymentUsd": 50.0,
          "maxTotalUsd": 500.0,
          "windowMs": 86400000
        },
        "https://cheap-api.example.com": {
          "maxPaymentUsd": 1.0,
          "maxTotalUsd": 100.0,
          "windowMs": 86400000
        }
      }
    }
  }
]
```

## Error Handling

When policies are violated, the wrapped fetch returns a 403 Forbidden response:

```typescript
const response = await context.fetchWithPayment?.(url);

if (response?.status === 403) {
  const error = await response.json();
  console.error('Policy violation:', error.reason);
  // error.reason contains details like:
  // "Total spending limit exceeded for policy group 'Daily Budget' at scope 'global'.
  //  Current: 950 USDC, Requested: 100 USDC, Limit: 1000 USDC"
}
```

## Best Practices

1. **Start Simple**: Begin with global spending limits, then add per-target/per-endpoint limits as needed
2. **Use Time Windows**: Always set `windowMs` for total spending limits to prevent lifetime accumulation
3. **Whitelist Recipients**: Use `allowedRecipients` to restrict payments to trusted agents only
4. **Monitor Spending**: Check `spendingTracker` and `rateLimiter` in your agent's runtime for monitoring
5. **Test Policies**: Test policy violations in development before deploying
6. **Document Policies**: Document your policy file format and rationale for your team

## Troubleshooting

### Policies Not Enforcing

- Ensure you've provided the `policies` option: `.use(payments({ policies: 'path.json' }))`
- Check that the policy file exists and is valid JSON
- Verify policy groups are loaded: `agent.payments?.policyGroups`

### Policy Violations Too Strict

- Check scope matching (endpoint > target > global)
- Verify domain matching is working correctly
- Review policy evaluation order (all groups must pass)

### Spending Not Tracked

- Ensure `maxTotalUsd` is set in at least one policy group
- Check that `spendingTracker` exists: `agent.payments?.spendingTracker`
- Verify payments are being recorded after successful responses

## See Also

- [Wallets Documentation](./WALLETS.md) - Wallet configuration for payments
- [Core Documentation](../packages/core/README.md) - Agent runtime basics
- [x402 Protocol](https://github.com/paywithx402) - Payment protocol specification
