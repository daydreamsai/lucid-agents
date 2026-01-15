---
name: lucid-client-api
description: |
  Skill for interacting with the Lucid Client API (multi-agent runtime).
  The API is hosted in the lucid-client codebase and provides endpoints for
  managing agents, invoking entrypoints, handling payments, and more.

  Activate when: user wants to interact with the Lucid Client API, manage agents,
  invoke agent entrypoints, or work with the multi-agent runtime system.

see-also:
  - ../lucid-client/AGENTS.md: Full documentation of the lucid-client architecture
  - ../lucid-client/CLAUDE.md: Development guide for lucid-client
---

# Lucid Client API Skill

This skill provides capabilities to interact with the Lucid Client API, which is a multi-agent runtime system hosted in the `lucid-client` codebase.

## API Base URL

The API base URL is typically:
- **Development**: `http://localhost:8787`
- **Production**: Configured via `VITE_API_URL` environment variable

## Authentication

Most endpoints require authentication via Better Auth:
- Session cookies are automatically sent with requests
- Protected routes: `/api/agents/*`, `/api/secrets/*`
- Public routes: `/agents/{slug}`, `/agents/{agentId}/.well-known/agent-card.json`

## Key Endpoints

### Agent Management

#### List Agents
```http
GET /api/agents
Query params: ?page=1&limit=10&search=query&enabled=true
```
Returns paginated list of agents for the authenticated owner.

#### Create Agent
```http
POST /api/agents
Content-Type: application/json

{
  "slug": "my-agent",
  "name": "My Agent",
  "description": "Agent description",
  "version": "1.0.0",
  "entrypoints": [...],
  "paymentsConfig": {...},
  "walletsConfig": {...}
}
```

#### Get Agent
```http
GET /api/agents/{agentId}
```

#### Update Agent
```http
PUT /api/agents/{agentId}
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description",
  ...
}
```

#### Delete Agent
```http
DELETE /api/agents/{agentId}
```

#### Get Public Agent by Slug
```http
GET /agent/{slug}
```
Public endpoint (no auth required). Returns enabled agents only.

### Agent Invocation

#### Get Agent Manifest
```http
GET /agents/{agentId}/.well-known/agent-card.json
```
Returns A2A-compatible agent manifest/card.

#### List Entrypoints
```http
GET /agents/{agentId}/entrypoints
```
Returns all entrypoints for an agent.

#### Invoke Entrypoint
```http
POST /agents/{agentId}/entrypoints/{key}/invoke
Content-Type: application/json

{
  "input": {
    "field1": "value1",
    "field2": "value2"
  },
  "metadata": {
    "requestId": "optional-request-id"
  }
}
```

**Payment Handling:**
- If entrypoint requires payment, returns `402 Payment Required`
- Response includes x402 payment headers:
  - `X-Payment-Required`: `true`
  - `X-Payment-Price`: `"$0.001"`
  - `X-Payment-Network`: `"eip155:84532"`
  - `X-Payment-PayTo`: `"0x..."`
- Client must complete payment and retry with payment headers:
  - `PAYMENT-REQUIRED`: Payment amount
  - `PAYMENT-SIGNATURE`: Payment signature
  - `PAYMENT-RESPONSE`: Payment response

### Secrets Management

#### List Secrets
```http
GET /api/agents/{agentId}/secrets
```

#### Create Secret
```http
POST /api/agents/{agentId}/secrets
Content-Type: application/json

{
  "key": "API_KEY",
  "value": "secret-value"
}
```

#### Get Secret
```http
GET /api/agents/{agentId}/secrets/{key}
```

#### Update Secret
```http
PUT /api/agents/{agentId}/secrets/{key}
Content-Type: application/json

{
  "value": "new-secret-value"
}
```

#### Delete Secret
```http
DELETE /api/agents/{agentId}/secrets/{key}
```

### Analytics

#### Get Analytics Summary
```http
GET /api/agents/{agentId}/analytics/summary
Query params: ?startDate=2024-01-01&endDate=2024-01-31
```

#### Get Analytics Transactions
```http
GET /api/agents/{agentId}/analytics/transactions
Query params: ?page=1&limit=10&startDate=...&endDate=...
```

### Invocations

#### List Invocations
```http
GET /api/agents/{agentId}/invocations
Query params: ?page=1&limit=10&status=success&entrypointKey=echo
```

#### Get Invocation
```http
GET /api/agents/{agentId}/invocations/{invocationId}
```

#### Get Invocation Stats
```http
GET /api/agents/{agentId}/invocations/stats
Query params: ?startDate=...&endDate=...
```

### Identity

#### Retry Identity Registration
```http
POST /api/agents/{agentId}/identity/retry
```

#### Update Identity Metadata
```http
PUT /api/agents/{agentId}/identity/metadata
Content-Type: application/json

{
  "metadata": {
    "key": "value"
  }
}
```

### Rankings

#### Get Rankings
```http
GET /api/rankings
Query params: ?window=24h&limit=10
```

#### Stream Rankings
```http
GET /api/rankings/stream
Query params: ?window=24h
```
Server-Sent Events stream of live rankings.

### Health & Stats

#### Health Check
```http
GET /health
```

#### Redis Health
```http
GET /health/redis
```

#### Network Stats
```http
GET /api/stats/network
```

## OpenAPI Documentation

The API provides full OpenAPI documentation:
- **OpenAPI Spec**: `GET /doc` (JSON)
- **Swagger UI**: Available when served (typically at `/swagger`)

## Common Patterns

### Making Authenticated Requests

When making requests from code, include credentials:

```typescript
const response = await fetch(`${API_URL}/api/agents`, {
  method: 'GET',
  credentials: 'include', // Important for cookies
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### Handling Payment-Required Responses

```typescript
let response = await fetch(`${API_URL}/agents/${agentId}/entrypoints/${key}/invoke`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ input: {...} }),
});

if (response.status === 402) {
  // Extract payment details from headers
  const price = response.headers.get('X-Payment-Price');
  const network = response.headers.get('X-Payment-Network');
  const payTo = response.headers.get('X-Payment-PayTo');
  
  // Complete payment using x402 client
  const paymentResponse = await completePayment({ price, network, payTo });
  
  // Retry with payment headers
  response = await fetch(`${API_URL}/agents/${agentId}/entrypoints/${key}/invoke`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-REQUIRED': price,
      'PAYMENT-SIGNATURE': paymentResponse.signature,
      'PAYMENT-RESPONSE': paymentResponse.response,
    },
    body: JSON.stringify({ input: {...} }),
  });
}
```

### Error Handling

The API returns standard error responses:

```typescript
{
  "error": "Error type",
  "message": "Human-readable error message",
  "details": {...} // Optional additional details
}
```

Common status codes:
- `400`: Validation error
- `401`: Unauthorized (not authenticated)
- `402`: Payment required
- `404`: Resource not found
- `409`: Conflict (e.g., slug already exists)
- `500`: Internal server error

## When to Use This Skill

Use this skill when:
- User wants to interact with the Lucid Client API
- User needs to manage agents programmatically
- User wants to invoke agent entrypoints
- User needs to handle payments for agent invocations
- User wants to query analytics or rankings
- User needs to manage agent secrets

## Notes

- The API is in the `lucid-client` codebase, not `lucid-agents`
- The API uses Hono with OpenAPI validation
- All agent operations are scoped to the authenticated owner
- Payments use the x402 protocol (HTTP-native payments)
- The runtime is stateless - agents are built dynamically from stored definitions
