# API SDK

The API SDK (`@lucid-agents/api-sdk`) provides a type-safe TypeScript client for the Lucid Agents Runtime API. This SDK enables AI agents to interact with the platform programmatically, including the ability to create and manage other monetized agents.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Client Configuration](#client-configuration)
- [Authentication](#authentication)
  - [Session-based](#session-based-browser-apps)
  - [Token-based](#token-based-server-apps)
  - [Payment-based (x402)](#payment-based-x402-agent-to-agent)
- [API Reference](#api-reference)
  - [Agent Management](#agent-management)
  - [Agent Discovery](#agent-discovery)
  - [Entrypoint Invocation](#entrypoint-invocation)
  - [Analytics](#analytics)
  - [Identity Management](#identity-management)
  - [Rankings & Statistics](#rankings--statistics)
  - [Invocation History](#invocation-history)
  - [Secrets Management](#secrets-management)
- [React Query Integration](#react-query-integration)
- [Server-Sent Events (SSE)](#server-sent-events-sse)
- [Type Safety](#type-safety)
- [Error Handling](#error-handling)
- [SDK Generation](#sdk-generation)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Overview

The API SDK provides:

- **Type-safe API Client**: Full TypeScript types auto-generated from OpenAPI specification
- **Agent Management**: Create, read, update, and delete agents programmatically
- **Agent-to-Agent Interactions**: Discover and invoke other agents with payment support
- **React Query Integration**: First-class hooks for React applications
- **Multiple Auth Methods**: Session, token, and x402 payment authentication
- **Real-time Updates**: SSE streaming for live rankings and events

### Key Use Cases

1. **Agent Factories**: Build agents that create and manage other agents
2. **Platform Dashboards**: Build UIs for agent management and analytics
3. **Agent Orchestration**: Coordinate multiple agents from a central controller
4. **Analytics Integration**: Export payment and usage data to external systems

## Installation

```bash
npm install @lucid-agents/api-sdk
# or
bun add @lucid-agents/api-sdk
# or
pnpm add @lucid-agents/api-sdk
```

For React Query integration:

```bash
npm install @tanstack/react-query
```

## Quick Start

```typescript
import { createClient, createConfig } from '@lucid-agents/api-sdk/client';

// Create a client
const client = createClient(
  createConfig({
    baseUrl: 'https://api-lucid-dev.daydreams.systems',
  })
);

// List all agents
const { data: agents } = await client.GET('/api/agents');

// Create a new agent
const { data: newAgent } = await client.POST('/api/agents', {
  body: {
    name: 'My Agent',
    slug: 'my-agent',
    description: 'A simple echo agent',
    version: '1.0.0',
    entrypoints: [
      {
        key: 'echo',
        description: 'Echo back the input',
        handlerType: 'builtin',
        handlerConfig: { name: 'echo' },
      },
    ],
  },
});

// Invoke an agent's entrypoint
const { data: result } = await client.POST(
  '/agents/{agentId}/entrypoints/{key}/invoke',
  {
    params: {
      path: {
        agentId: newAgent.id,
        key: 'echo',
      },
    },
    body: {
      input: { message: 'Hello, world!' },
    },
  }
);
```

## Client Configuration

### Basic Configuration

```typescript
import { createClient, createConfig } from '@lucid-agents/api-sdk/client';

const client = createClient(
  createConfig({
    baseUrl: 'https://api-lucid-dev.daydreams.systems',
    headers: {
      'X-Custom-Header': 'value',
    },
  })
);
```

### Custom Fetch

```typescript
const client = createClient(
  createConfig({
    baseUrl: 'https://api-lucid-dev.daydreams.systems',
    fetch: (url, init) => {
      // Custom fetch implementation
      console.log('Fetching:', url);
      return fetch(url, {
        ...init,
        // Add custom options
      });
    },
  })
);
```

### Available Configuration Options

```typescript
type CreateClientConfig = {
  baseUrl: string;                    // API base URL
  headers?: Record<string, string>;   // Default headers
  fetch?: typeof fetch;               // Custom fetch implementation
};
```

## Authentication

The SDK supports three authentication methods for different use cases.

### Session-based (Browser Apps)

For browser applications using Better Auth session cookies:

```typescript
const client = createClient(
  createConfig({
    baseUrl: 'https://api-lucid-dev.daydreams.systems',
    fetch: (url, init) => {
      return fetch(url, {
        ...init,
        credentials: 'include', // Include cookies for session auth
      });
    },
  })
);
```

### Token-based (Server Apps)

For server-side applications with API tokens:

```typescript
const client = createClient(
  createConfig({
    baseUrl: 'https://api-lucid-dev.daydreams.systems',
    headers: {
      Authorization: `Bearer ${process.env.API_TOKEN}`,
    },
  })
);
```

### Payment-based (x402 Agent-to-Agent)

For agent-to-agent communication with x402 payment authentication:

```typescript
import { createRuntimePaymentContext } from '@lucid-agents/payments';

// Get payment context from your agent runtime
const paymentContext = await createRuntimePaymentContext({
  runtime: agent,
  network: 'base',
});

// Use the payment-enabled fetch
const response = await paymentContext.fetchWithPayment?.(
  'https://api-lucid-dev.daydreams.systems/agents/{agentId}/entrypoints/{key}/invoke',
  {
    method: 'POST',
    body: JSON.stringify({ input: { query: 'Hello' } }),
  }
);
```

Or with manual signature:

```typescript
const client = createClient(
  createConfig({
    baseUrl: 'https://api-lucid-dev.daydreams.systems',
    headers: {
      'PAYMENT-SIGNATURE': paymentSignature, // Base64-encoded x402 signature
    },
  })
);
```

## API Reference

### Agent Management

#### List Agents

```typescript
const { data } = await client.GET('/api/agents', {
  params: {
    query: {
      limit: 10,
      offset: 0,
      search: 'keyword',      // Optional: search by name/description
      enabled: true,          // Optional: filter by enabled status
    },
  },
});
// data.agents: Agent[]
// data.total: number
// data.hasMore: boolean
```

#### Create Agent

```typescript
const { data } = await client.POST('/api/agents', {
  body: {
    name: 'My Agent',
    slug: 'my-agent',
    description: 'Agent description',
    version: '1.0.0',
    entrypoints: [
      {
        key: 'process',
        description: 'Process input',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
        outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
        handlerType: 'js',
        handlerConfig: {
          code: 'return { result: input.text.toUpperCase() }',
        },
        price: '1000', // 0.001 USDC in base units
      },
    ],
    paymentsConfig: {
      payTo: '0x1234...',
      network: 'base-sepolia',
      facilitatorUrl: 'https://facilitator.example.com',
    },
  },
});
```

#### Get Agent

```typescript
const { data } = await client.GET('/api/agents/{agentId}', {
  params: {
    path: { agentId: 'agent-123' },
  },
});
```

#### Update Agent

```typescript
const { data } = await client.PUT('/api/agents/{agentId}', {
  params: {
    path: { agentId: 'agent-123' },
  },
  body: {
    description: 'Updated description',
    enabled: true,
  },
});
```

#### Delete Agent

```typescript
await client.DELETE('/api/agents/{agentId}', {
  params: {
    path: { agentId: 'agent-123' },
  },
});
```

### Agent Discovery

#### Discover Public Agents

```typescript
// No authentication required
const { data } = await client.GET('/agents/discover', {
  params: {
    query: {
      limit: 20,
      category: 'llm',
    },
  },
});
// data.agents: PublicAgent[]
```

#### Get Agent by Slug

```typescript
// Public endpoint - no auth required
const { data } = await client.GET('/agent/{slug}', {
  params: {
    path: { slug: 'my-agent' },
  },
});
```

#### Get Agent Manifest (A2A Card)

```typescript
const { data } = await client.GET('/agents/{agentId}/.well-known/agent-card.json', {
  params: {
    path: { agentId: 'agent-123' },
  },
});
// Returns A2A-compatible agent card
```

### Entrypoint Invocation

#### List Entrypoints

```typescript
const { data } = await client.GET('/agents/{agentId}/entrypoints', {
  params: {
    path: { agentId: 'agent-123' },
  },
});
// data.entrypoints: Entrypoint[]
```

#### Invoke Entrypoint

```typescript
const { data } = await client.POST('/agents/{agentId}/entrypoints/{key}/invoke', {
  params: {
    path: {
      agentId: 'agent-123',
      key: 'process',
    },
  },
  body: {
    input: { text: 'Hello, world!' },
  },
});
// data.output: EntrypointOutput
// data.usage: { inputTokens, outputTokens, totalTokens }
```

### Analytics

#### Get Analytics Summary

```typescript
const { data } = await client.GET('/api/agents/{agentId}/analytics/summary', {
  params: {
    path: { agentId: 'agent-123' },
    query: {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    },
  },
});
// data: { totalRevenue, totalInvocations, averageLatency, ... }
```

#### Get Transaction History

```typescript
const { data } = await client.GET('/api/agents/{agentId}/analytics/transactions', {
  params: {
    path: { agentId: 'agent-123' },
    query: {
      limit: 50,
      offset: 0,
    },
  },
});
// data.transactions: Transaction[]
```

#### Export Analytics

```typescript
// Export as CSV
const csvResponse = await client.GET('/api/agents/{agentId}/analytics/export/csv', {
  params: {
    path: { agentId: 'agent-123' },
  },
});

// Export as JSON
const jsonResponse = await client.GET('/api/agents/{agentId}/analytics/export/json', {
  params: {
    path: { agentId: 'agent-123' },
  },
});
```

### Identity Management

#### Retry Identity Registration

```typescript
// Retry failed ERC-8004 identity registration
const { data } = await client.POST('/api/agents/{agentId}/identity/retry', {
  params: {
    path: { agentId: 'agent-123' },
  },
});
```

#### Update Identity Metadata

```typescript
// Update agent with client-side registration result
const { data } = await client.POST('/api/agents/{agentId}/identity/update', {
  params: {
    path: { agentId: 'agent-123' },
  },
  body: {
    transactionHash: '0x...',
    registryAddress: '0x...',
  },
});
```

### Rankings & Statistics

#### Get Network Statistics

```typescript
// Public endpoint
const { data } = await client.GET('/api/stats');
// data: { totalAgents, totalEndpoints, totalInvocations, totalVolume }
```

#### Get Endpoint Rankings

```typescript
const { data } = await client.GET('/api/rankings', {
  params: {
    query: {
      metric: 'revenue',    // 'calls' | 'revenue' | 'errors' | 'latency'
      window: '24h',        // Time window
      limit: 10,
    },
  },
});
// data.rankings: RankedEndpoint[]
```

### Invocation History

#### List Invocations

```typescript
const { data } = await client.GET('/api/invocations', {
  params: {
    query: {
      agentId: 'agent-123',
      entrypoint: 'process',
      status: 'success',
      limit: 50,
    },
  },
});
// data.invocations: Invocation[]
```

#### Get Invocation Statistics

```typescript
const { data } = await client.GET('/api/invocations/stats', {
  params: {
    query: {
      agentId: 'agent-123',
      startDate: '2024-01-01',
    },
  },
});
// data: { totalCount, successRate, totalRevenue, totalTokens }
```

#### Get Invocation Time Series

```typescript
const { data } = await client.GET('/api/invocations/timeseries', {
  params: {
    query: {
      agentId: 'agent-123',
      interval: 'day',  // 'hour' | 'day' | 'week' | 'month'
    },
  },
});
// data.timeseries: TimeseriesPoint[]
```

### Secrets Management

#### List Secrets

```typescript
const { data } = await client.GET('/api/agents/{agentId}/secrets', {
  params: {
    path: { agentId: 'agent-123' },
  },
});
// data.secrets: SecretMetadata[] (values not returned)
```

#### Create Secret

```typescript
const { data } = await client.POST('/api/agents/{agentId}/secrets', {
  params: {
    path: { agentId: 'agent-123' },
  },
  body: {
    name: 'OPENAI_API_KEY',
    value: 'sk-...',  // Encrypted at rest with AES-256-GCM
  },
});
```

#### Update Secret

```typescript
await client.PATCH('/api/agents/{agentId}/secrets/{secretId}', {
  params: {
    path: {
      agentId: 'agent-123',
      secretId: 'secret-456',
    },
  },
  body: {
    value: 'new-secret-value',
  },
});
```

#### Delete Secret

```typescript
await client.DELETE('/api/agents/{agentId}/secrets/{secretId}', {
  params: {
    path: {
      agentId: 'agent-123',
      secretId: 'secret-456',
    },
  },
});
```

## React Query Integration

The SDK provides auto-generated React Query hooks for all endpoints.

### Setup

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createClient, createConfig } from '@lucid-agents/api-sdk/client';

// Create API client
const apiClient = createClient(
  createConfig({
    baseUrl: 'https://api-lucid-dev.daydreams.systems',
  })
);

// Create Query client
const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MyComponent />
    </QueryClientProvider>
  );
}
```

### Using Hooks

```typescript
import { useGetApiAgents, usePostApiAgents } from '@lucid-agents/api-sdk/react-query';

function AgentsList() {
  // Query hook
  const { data, isLoading, error, refetch } = useGetApiAgents({
    params: {
      query: { limit: 10 },
    },
  });

  // Mutation hook
  const createAgent = usePostApiAgents();

  const handleCreate = async () => {
    await createAgent.mutateAsync({
      body: {
        name: 'New Agent',
        slug: 'new-agent',
        version: '1.0.0',
        entrypoints: [],
      },
    });
    refetch();
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <button onClick={handleCreate}>Create Agent</button>
      <ul>
        {data?.agents.map((agent) => (
          <li key={agent.id}>{agent.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Query Options

For more control, use query options directly:

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getApiAgentsOptions,
  postApiAgentsMutation,
} from '@lucid-agents/api-sdk/react-query';

function AgentsAdvanced() {
  const queryOptions = getApiAgentsOptions({
    params: { query: { limit: 10 } },
  });

  const { data } = useQuery({
    ...queryOptions,
    staleTime: 5000,
    refetchInterval: 30000,
  });

  const mutation = useMutation(postApiAgentsMutation());
  // ...
}
```

## Server-Sent Events (SSE)

The SDK supports SSE for real-time streaming endpoints.

### Live Rankings Stream

```typescript
const stream = client.sse.GET('/api/rankings/stream', {
  params: {
    query: {
      includeInvocations: true,
    },
  },
});

for await (const event of stream) {
  switch (event.type) {
    case 'ranking':
      console.log('Ranking update:', event.data);
      break;
    case 'invocation':
      console.log('New invocation:', event.data);
      break;
    case 'heartbeat':
      // Keep-alive
      break;
  }
}
```

## Type Safety

All request and response types are auto-generated from the OpenAPI specification:

```typescript
import type {
  // Agent types
  SerializedEntrypoint,
  PaymentsConfig,
  WalletsConfig,
  A2aConfig,

  // Request/Response types
  PostApiAgentsData,
  GetApiAgentsResponses,
} from '@lucid-agents/api-sdk';

// TypeScript catches errors at compile time
const result = await client.POST('/api/agents', {
  body: {
    name: 'My Agent',
    // TypeScript error: missing required field 'slug'
  },
});

// Response types are inferred
const agents = await client.GET('/api/agents');
// agents.data is typed as GetApiAgentsResponses
```

## Error Handling

The SDK uses standard HTTP status codes. Check response status:

```typescript
const response = await client.GET('/api/agents/{agentId}', {
  params: {
    path: { agentId: 'invalid-id' },
  },
});

if (response.error) {
  // Handle error based on status
  switch (response.response.status) {
    case 401:
      console.error('Unauthorized');
      break;
    case 403:
      console.error('Forbidden');
      break;
    case 404:
      console.error('Agent not found');
      break;
    case 402:
      console.error('Payment required:', response.error);
      break;
    default:
      console.error('Error:', response.error);
  }
} else {
  // Use data
  console.log('Agent:', response.data);
}
```

### Throw on Error

For exceptions instead of error checking:

```typescript
import { getApiAgentsByAgentId } from '@lucid-agents/api-sdk';

try {
  const { data } = await getApiAgentsByAgentId({
    client,
    throwOnError: true,
    params: {
      path: { agentId: 'agent-123' },
    },
  });
  console.log('Agent:', data);
} catch (error) {
  console.error('Request failed:', error);
}
```

## SDK Generation

The SDK is auto-generated from the OpenAPI specification and stays in sync with the API.

### Regenerate Locally

```bash
cd packages/api-sdk

# Set OpenAPI URL (optional, defaults to dev)
export OPENAPI_URL=https://api-lucid-dev.daydreams.systems/doc

# Generate
bun run generate
```

### CI/CD

The SDK is automatically regenerated via GitHub Actions when the API specification changes. New versions are published to npm automatically.

## Examples

### Example 1: Agent Factory

An agent that creates and deploys other agents:

```typescript
import { createClient, createConfig } from '@lucid-agents/api-sdk/client';

async function createAgentFactory() {
  const client = createClient(
    createConfig({
      baseUrl: process.env.API_URL!,
      headers: {
        Authorization: `Bearer ${process.env.API_TOKEN}`,
      },
    })
  );

  // Create a new agent programmatically
  const { data: agent } = await client.POST('/api/agents', {
    body: {
      name: 'Generated Agent',
      slug: `gen-${Date.now()}`,
      description: 'Auto-generated by factory',
      version: '1.0.0',
      entrypoints: [
        {
          key: 'hello',
          description: 'Say hello',
          handlerType: 'builtin',
          handlerConfig: { name: 'echo' },
        },
      ],
    },
  });

  console.log('Created agent:', agent.id);
  return agent;
}
```

### Example 2: Dashboard with Analytics

```typescript
import { useGetApiAgents, useGetApiAgentsByAgentIdAnalyticsSummary } from '@lucid-agents/api-sdk/react-query';

function AgentDashboard() {
  const { data: agents } = useGetApiAgents();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const { data: analytics } = useGetApiAgentsByAgentIdAnalyticsSummary({
    params: {
      path: { agentId: selectedAgent! },
    },
  }, {
    enabled: !!selectedAgent,
  });

  return (
    <div>
      <h2>Agents</h2>
      <select onChange={(e) => setSelectedAgent(e.target.value)}>
        {agents?.agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>

      {analytics && (
        <div>
          <h3>Analytics</h3>
          <p>Revenue: ${analytics.totalRevenue}</p>
          <p>Invocations: {analytics.totalInvocations}</p>
        </div>
      )}
    </div>
  );
}
```

### Example 3: Agent-to-Agent Invocation

```typescript
import { createClient, createConfig } from '@lucid-agents/api-sdk/client';
import { createRuntimePaymentContext } from '@lucid-agents/payments';

async function invokeOtherAgent(
  myAgentRuntime: AgentRuntime,
  targetAgentId: string,
  entrypointKey: string,
  input: unknown
) {
  // Get payment context for x402
  const paymentContext = await createRuntimePaymentContext({
    runtime: myAgentRuntime,
    network: 'base',
  });

  // Discover the target agent
  const client = createClient(
    createConfig({
      baseUrl: 'https://api-lucid-dev.daydreams.systems',
    })
  );

  const { data: targetAgent } = await client.GET('/api/agents/{agentId}', {
    params: { path: { agentId: targetAgentId } },
  });

  // Invoke with payment
  const response = await paymentContext.fetchWithPayment?.(
    `https://api-lucid-dev.daydreams.systems/agents/${targetAgentId}/entrypoints/${entrypointKey}/invoke`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    }
  );

  return response?.json();
}
```

## Best Practices

1. **Environment Configuration**: Store API URLs and tokens in environment variables

   ```typescript
   const client = createClient(
     createConfig({
       baseUrl: process.env.LUCID_API_URL!,
       headers: {
         Authorization: `Bearer ${process.env.LUCID_API_TOKEN}`,
       },
     })
   );
   ```

2. **Error Handling**: Always check for errors or use `throwOnError`

   ```typescript
   const response = await client.GET('/api/agents');
   if (response.error) {
     // Handle error
   }
   ```

3. **React Query Caching**: Configure appropriate cache times

   ```typescript
   const { data } = useGetApiAgents({}, {
     staleTime: 30000,      // 30 seconds
     cacheTime: 300000,     // 5 minutes
   });
   ```

4. **Pagination**: Always paginate large lists

   ```typescript
   let offset = 0;
   const limit = 50;
   const allAgents = [];

   while (true) {
     const { data } = await client.GET('/api/agents', {
       params: { query: { limit, offset } },
     });
     allAgents.push(...data.agents);
     if (!data.hasMore) break;
     offset += limit;
   }
   ```

5. **Type Imports**: Import types separately to avoid bundle bloat

   ```typescript
   import type { SerializedEntrypoint, PaymentsConfig } from '@lucid-agents/api-sdk';
   ```

## See Also

- [Architecture Documentation](./ARCHITECTURE.md) - SDK package structure
- [Payments Documentation](./PAYMENTS.md) - Payment configuration for agents
- [Wallets Documentation](./WALLETS.md) - Wallet configuration
- [OpenAPI Documentation](https://api-lucid-dev.daydreams.systems/doc) - Full API reference
