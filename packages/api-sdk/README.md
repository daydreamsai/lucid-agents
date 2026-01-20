# @lucid-agents/api-sdk

TypeScript SDK for the [Lucid Agents Runtime API](https://github.com/daydreamsai/lucid-client). This SDK is automatically generated from the OpenAPI specification.

## Installation

```bash
npm install @lucid-agents/api-sdk
# or
bun add @lucid-agents/api-sdk
# or
pnpm add @lucid-agents/api-sdk
```

## Usage

### Basic Client

```typescript
import { createClient, createConfig } from '@lucid-agents/api-sdk/client';

const client = createClient(
  createConfig({
    baseUrl: 'https://api-lucid-dev.daydreams.systems',
    // Optional: Add authentication headers
    headers: {
      'Authorization': 'Bearer your-token',
    },
  })
);

// List agents
const agents = await client.GET('/api/agents', {
  params: {
    query: {
      limit: 10,
      offset: 0,
    },
  },
});

// Create an agent
const newAgent = await client.POST('/api/agents', {
  body: {
    name: 'My Agent',
    slug: 'my-agent',
    description: 'A test agent',
    version: '1.0.0',
    entrypoints: [],
  },
});

// Invoke an entrypoint
const result = await client.POST('/agents/{agentId}/entrypoints/{entrypointKey}/invoke', {
  params: {
    path: {
      agentId: 'agent-123',
      entrypointKey: 'echo',
    },
  },
  body: {
    input: { text: 'Hello, world!' },
  },
});
```

### React Query Integration

If you're using React Query, you can use the generated hooks:

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { getApiAgentsOptions, useGetApiAgents } from '@lucid-agents/api-sdk/react-query';

// Using the hook directly
function AgentsList() {
  const { data, isLoading, error } = useGetApiAgents({
    params: {
      query: {
        limit: 10,
      },
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data?.agents.map(agent => (
        <li key={agent.id}>{agent.name}</li>
      ))}
    </ul>
  );
}

// Or using query options for more control
function AgentsListAdvanced() {
  const queryOptions = getApiAgentsOptions({
    params: {
      query: { limit: 10 },
    },
  });

  const { data } = useQuery(queryOptions);
  // ...
}
```

### Authentication

The SDK supports multiple authentication methods:

#### Session-based (Better Auth)

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

#### Token-based

```typescript
const client = createClient(
  createConfig({
    baseUrl: 'https://api-lucid-dev.daydreams.systems',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })
);
```

#### Payment-based (x402)

For agent-to-agent authentication via x402 payments:

```typescript
const client = createClient(
  createConfig({
    baseUrl: 'https://api-lucid-dev.daydreams.systems',
    headers: {
      'PAYMENT-SIGNATURE': paymentSignature, // Base64-encoded payment signature
    },
  })
);
```

## API Reference

The SDK provides type-safe access to all endpoints defined in the OpenAPI specification:

- **Agents**: Create, read, update, delete agents
- **Invocation**: Invoke agent entrypoints
- **Analytics**: Get usage and payment analytics
- **Identity**: Manage ERC-8004 agent identity
- **Rankings**: Get live agent rankings
- **Secrets**: Manage encrypted secrets (if enabled)

See the [OpenAPI documentation](https://api-lucid-dev.daydreams.systems/doc) for full endpoint details.

## Generating the SDK

To regenerate the SDK from the OpenAPI spec:

```bash
# Set the OpenAPI URL (defaults to https://api-lucid-dev.daydreams.systems/doc)
export OPENAPI_URL=https://api.example.com/doc

# Generate the SDK
bun run generate
```

The SDK is automatically regenerated via CI when the API specification changes.

## Type Safety

All request and response types are automatically generated from the OpenAPI schema, ensuring full type safety:

```typescript
// Type-safe - TypeScript will catch errors
const result = await client.POST('/api/agents', {
  body: {
    name: 'My Agent',
    slug: 'my-agent',
    // TypeScript error: missing required field 'entrypoints'
  },
});

// Response types are inferred
const agents = await client.GET('/api/agents');
// agents.data is typed as AgentListResponse
```

## Error Handling

The SDK uses standard HTTP status codes. Check the response status:

```typescript
const response = await client.GET('/api/agents/{agentId}', {
  params: {
    path: { agentId: 'invalid-id' },
  },
});

if (response.error) {
  // Handle error
  console.error(response.error);
} else {
  // Use data
  console.log(response.data);
}
```

## License

MIT
