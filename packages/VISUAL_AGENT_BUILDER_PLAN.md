# Visual Agent Builder: Stateless Hono Runtime Plan

## Executive Summary

Build a new package `@lucid-agents/hono-runtime` that provides a **generic, stateless Hono server** capable of running **infinite agents** defined as database rows rather than deployed servers.

**Key Insight**: Agents become data (config in DB), not infrastructure (separate servers).

**API-First**: Uses `@hono/zod-openapi` for type-safe routes with auto-generated OpenAPI documentation.

---

## Current Architecture Analysis

### What Exists

The monorepo has a mature extension-based agent framework:

| Package | Purpose |
|---------|---------|
| `@lucid-agents/core` | AgentBuilder, extension system, runtime construction |
| `@lucid-agents/hono` | Hono adapter that creates routes for a **single agent** |
| `@lucid-agents/types` | Shared types (EntrypointDef, AgentRuntime, StreamEnvelope, etc.) |
| `@lucid-agents/payments` | x402 integration, policy groups, payment tracking |
| `@lucid-agents/a2a` | Agent-to-agent protocol, AgentCard, A2AClient |
| `@lucid-agents/wallet` | Wallet connectors (local, lucid, thirdweb) |
| `@lucid-agents/scheduler` | Hire/Job system for scheduled invocations |
| `@lucid-agents/http` | HTTP handlers, SSE streaming |
| `@lucid-agents/identity` | ERC-8004 on-chain identity |
| `@lucid-agents/analytics` | Payment analytics |

### Current Limitation

The existing `@lucid-agents/hono` package assumes:
- **1 agent = 1 Hono app = 1 server**
- Agent config is baked into code at build time
- Entrypoints are added programmatically via `addEntrypoint()`

This doesn't scale for a **platform** where users create agents via UI.

---

## Proposed Architecture

### New Package: `@lucid-agents/hono-runtime`

A generic agent runtime server that:

1. **Loads agent definitions from a database** at request time
2. **Routes requests by agent ID/slug** in the URL path
3. **Executes any agent** using the existing extension system
4. **Remains completely stateless** (all state in DB/Redis/S3)
5. **Scales horizontally** behind a load balancer

### Mental Model Shift

```
BEFORE: 1 agent = 1 server (deploy per agent)
AFTER:  1 agent = 1 row (configure, don't deploy)
```

---

## Implementation Plan

### Phase 1: Database Schema & Types

#### 1.1 Agent Definition Schema

```typescript
// packages/hono-runtime/src/schema/agent.ts

export interface AgentDefinition {
  id: string;                          // UUID
  ownerId: string;                     // Tenant/user who owns this agent
  slug: string;                        // URL-friendly unique name
  name: string;
  description: string;
  version: string;

  // Core config
  model: string;                       // 'gpt-4', 'claude-3', etc.
  systemPrompt: string;

  // Entrypoints (serialized)
  entrypoints: SerializedEntrypoint[];

  // Extension configs
  paymentsConfig?: SerializedPaymentsConfig;
  walletsConfig?: SerializedWalletsConfig;
  a2aConfig?: SerializedA2AConfig;
  schedulerConfig?: SerializedSchedulerConfig;
  identityConfig?: SerializedIdentityConfig;

  // Limits & policies
  limits: {
    maxTokensPerInvocation?: number;
    maxInvocationsPerDay?: number;
    maxConcurrentInvocations?: number;
  };

  // Metadata
  enabled: boolean;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedEntrypoint {
  key: string;
  description?: string;
  inputSchema: JsonSchema;             // Zod schema serialized to JSON Schema
  outputSchema: JsonSchema;
  streaming?: boolean;
  price?: string;
  network?: string;
  metadata?: Record<string, unknown>;

  // Handler reference (not inline code for security)
  handlerType: 'builtin' | 'llm' | 'graph' | 'webhook';
  handlerConfig: unknown;              // Type depends on handlerType
}
```

#### 1.2 Drizzle Schema

```typescript
// packages/hono-runtime/src/db/schema.ts

import { pgTable, text, jsonb, boolean, timestamp, integer } from 'drizzle-orm/pg-core';

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  slug: text('slug').unique().notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  version: text('version').notNull(),

  model: text('model').notNull(),
  systemPrompt: text('system_prompt').notNull(),

  entrypoints: jsonb('entrypoints').notNull().$type<SerializedEntrypoint[]>(),

  paymentsConfig: jsonb('payments_config').$type<SerializedPaymentsConfig>(),
  walletsConfig: jsonb('wallets_config').$type<SerializedWalletsConfig>(),
  a2aConfig: jsonb('a2a_config').$type<SerializedA2AConfig>(),
  schedulerConfig: jsonb('scheduler_config').$type<SerializedSchedulerConfig>(),
  identityConfig: jsonb('identity_config').$type<SerializedIdentityConfig>(),

  maxTokensPerInvocation: integer('max_tokens_per_invocation'),
  maxInvocationsPerDay: integer('max_invocations_per_day'),
  maxConcurrentInvocations: integer('max_concurrent_invocations'),

  enabled: boolean('enabled').default(true).notNull(),
  webhookUrl: text('webhook_url'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const agentSessions = pgTable('agent_sessions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  userId: text('user_id'),

  memory: jsonb('memory').$type<unknown>(),
  context: jsonb('context').$type<unknown>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const invocationLogs = pgTable('invocation_logs', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  sessionId: text('session_id').references(() => agentSessions.id),
  entrypointKey: text('entrypoint_key').notNull(),

  input: jsonb('input').notNull(),
  output: jsonb('output'),
  error: text('error'),

  durationMs: integer('duration_ms'),
  tokensUsed: integer('tokens_used'),

  metadata: jsonb('metadata').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Phase 2: Agent Loader & Runtime Factory

#### 2.1 Agent Loader

```typescript
// packages/hono-runtime/src/loader.ts

export interface AgentStore {
  getById(id: string): Promise<AgentDefinition | null>;
  getBySlug(slug: string): Promise<AgentDefinition | null>;
  getByOwner(ownerId: string): Promise<AgentDefinition[]>;

  create(def: Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentDefinition>;
  update(id: string, partial: Partial<AgentDefinition>): Promise<AgentDefinition>;
  delete(id: string): Promise<void>;
}

export function createDrizzleAgentStore(db: PostgresJsDatabase): AgentStore {
  return {
    async getById(id) {
      const [row] = await db.select().from(agents).where(eq(agents.id, id));
      return row ? deserializeAgent(row) : null;
    },
    async getBySlug(slug) {
      const [row] = await db.select().from(agents).where(eq(agents.slug, slug));
      return row ? deserializeAgent(row) : null;
    },
    // ... other methods
  };
}
```

#### 2.2 Runtime Factory

```typescript
// packages/hono-runtime/src/factory.ts

import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { wallets } from '@lucid-agents/wallet';
import { a2a } from '@lucid-agents/a2a';

export interface RuntimeFactoryConfig {
  // Shared resources across all agents
  defaultModel?: string;
  facilitatorUrl?: string;

  // Handler registry for custom handlers
  handlers?: HandlerRegistry;
}

export async function buildRuntimeForAgent(
  definition: AgentDefinition,
  config: RuntimeFactoryConfig
): Promise<AgentRuntime> {
  // Start with base agent
  let builder = createAgent({
    name: definition.name,
    version: definition.version,
    description: definition.description,
  });

  // Always add HTTP extension
  builder = builder.use(http());

  // Conditionally add extensions based on config
  if (definition.paymentsConfig) {
    builder = builder.use(payments({
      config: deserializePaymentsConfig(definition.paymentsConfig),
    }));
  }

  if (definition.walletsConfig) {
    builder = builder.use(wallets({
      config: deserializeWalletsConfig(definition.walletsConfig),
    }));
  }

  if (definition.a2aConfig) {
    builder = builder.use(a2a());
  }

  // Build the runtime
  const runtime = await builder.build();

  // Add entrypoints from definition
  for (const ep of definition.entrypoints) {
    const handler = await buildHandler(ep, definition, config);
    runtime.agent.addEntrypoint({
      key: ep.key,
      description: ep.description,
      input: jsonSchemaToZod(ep.inputSchema),
      output: jsonSchemaToZod(ep.outputSchema),
      streaming: ep.streaming,
      price: ep.price,
      network: ep.network,
      handler: ep.streaming ? undefined : handler,
      stream: ep.streaming ? handler : undefined,
    });
  }

  return runtime;
}
```

### Phase 3: Generic Hono Server with OpenAPI

We use `@hono/zod-openapi` for:
- **Type-safe route definitions** with Zod schemas
- **Auto-generated OpenAPI 3.0 documentation** at `/doc`
- **Runtime validation** of request/response bodies
- **Better DX** with IntelliSense for route params, bodies, and responses

#### 3.1 OpenAPI Schema Definitions

```typescript
// packages/hono-runtime/src/openapi/schemas.ts

import { z } from '@hono/zod-openapi';

// --- Common Schemas ---

export const ErrorSchema = z.object({
  error: z.string().openapi({ example: 'Agent not found' }),
  code: z.string().optional().openapi({ example: 'AGENT_NOT_FOUND' }),
  details: z.record(z.unknown()).optional(),
}).openapi('Error');

export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']).openapi({ example: 'ok' }),
  version: z.string().optional().openapi({ example: '1.0.0' }),
  timestamp: z.string().datetime().openapi({ example: '2024-01-15T10:30:00Z' }),
}).openapi('Health');

// --- Agent Schemas ---

export const AgentIdParamSchema = z.object({
  agentId: z.string().min(1).openapi({
    param: { name: 'agentId', in: 'path' },
    example: 'ag_abc123',
  }),
});

export const AgentSlugParamSchema = z.object({
  slug: z.string().min(1).openapi({
    param: { name: 'slug', in: 'path' },
    example: 'my-cool-agent',
  }),
});

export const EntrypointKeyParamSchema = z.object({
  key: z.string().min(1).openapi({
    param: { name: 'key', in: 'path' },
    example: 'chat',
  }),
});

export const TaskIdParamSchema = z.object({
  taskId: z.string().min(1).openapi({
    param: { name: 'taskId', in: 'path' },
    example: 'task_xyz789',
  }),
});

// --- Invocation Schemas ---

export const InvokeRequestSchema = z.object({
  input: z.unknown().openapi({
    description: 'Input payload matching entrypoint schema',
    example: { message: 'Hello, agent!' },
  }),
  sessionId: z.string().optional().openapi({
    description: 'Session ID for conversation continuity',
    example: 'sess_abc123',
  }),
  metadata: z.record(z.unknown()).optional().openapi({
    description: 'Additional metadata for the invocation',
    example: { source: 'web', userId: 'u_123' },
  }),
}).openapi('InvokeRequest');

export const InvokeResponseSchema = z.object({
  output: z.unknown().openapi({
    description: 'Output payload from the entrypoint handler',
    example: { response: 'Hello! How can I help?' },
  }),
  usage: z.object({
    total_tokens: z.number().optional(),
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
  }).optional().openapi('Usage'),
  sessionId: z.string().openapi({ example: 'sess_abc123' }),
  requestId: z.string().openapi({ example: 'req_xyz789' }),
}).openapi('InvokeResponse');

// --- Agent Definition Schemas (for CRUD) ---

export const SerializedEntrypointSchema = z.object({
  key: z.string().min(1).openapi({ example: 'chat' }),
  description: z.string().optional().openapi({ example: 'Chat with the agent' }),
  inputSchema: z.record(z.unknown()).openapi({
    description: 'JSON Schema for input validation',
  }),
  outputSchema: z.record(z.unknown()).openapi({
    description: 'JSON Schema for output validation',
  }),
  streaming: z.boolean().optional().default(false),
  price: z.string().optional().openapi({
    example: '1000',
    description: 'Price in base units (e.g., wei for ETH)',
  }),
  network: z.string().optional().openapi({ example: 'base-sepolia' }),
  handlerType: z.enum(['builtin', 'llm', 'graph', 'webhook', 'tool-call']),
  handlerConfig: z.unknown(),
  metadata: z.record(z.unknown()).optional(),
}).openapi('SerializedEntrypoint');

export const AgentLimitsSchema = z.object({
  maxTokensPerInvocation: z.number().optional().openapi({ example: 4096 }),
  maxInvocationsPerDay: z.number().optional().openapi({ example: 1000 }),
  maxConcurrentInvocations: z.number().optional().openapi({ example: 10 }),
}).openapi('AgentLimits');

export const CreateAgentSchema = z.object({
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/).openapi({
    example: 'my-cool-agent',
    description: 'URL-friendly unique identifier',
  }),
  name: z.string().min(1).max(128).openapi({ example: 'My Cool Agent' }),
  description: z.string().max(1024).openapi({
    example: 'An agent that helps with tasks',
  }),
  version: z.string().default('1.0.0').openapi({ example: '1.0.0' }),
  model: z.string().openapi({ example: 'gpt-4' }),
  systemPrompt: z.string().openapi({
    example: 'You are a helpful assistant.',
  }),
  entrypoints: z.array(SerializedEntrypointSchema).min(1),
  paymentsConfig: z.record(z.unknown()).optional(),
  walletsConfig: z.record(z.unknown()).optional(),
  a2aConfig: z.record(z.unknown()).optional(),
  limits: AgentLimitsSchema.optional(),
  enabled: z.boolean().default(true),
  webhookUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
}).openapi('CreateAgent');

export const AgentDefinitionSchema = CreateAgentSchema.extend({
  id: z.string().openapi({ example: 'ag_abc123' }),
  ownerId: z.string().openapi({ example: 'usr_xyz789' }),
  createdAt: z.string().datetime().openapi({ example: '2024-01-15T10:30:00Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2024-01-15T10:30:00Z' }),
}).openapi('AgentDefinition');

export const UpdateAgentSchema = CreateAgentSchema.partial().openapi('UpdateAgent');

export const AgentListResponseSchema = z.object({
  agents: z.array(AgentDefinitionSchema),
  total: z.number().openapi({ example: 42 }),
  offset: z.number().openapi({ example: 0 }),
  limit: z.number().openapi({ example: 20 }),
}).openapi('AgentListResponse');

// --- Task Schemas (A2A) ---

export const TaskStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]).openapi('TaskStatus');

export const CreateTaskSchema = z.object({
  skillId: z.string().openapi({ example: 'chat' }),
  input: z.unknown(),
  sessionId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
}).openapi('CreateTask');

export const TaskSchema = z.object({
  id: z.string().openapi({ example: 'task_xyz789' }),
  agentId: z.string().openapi({ example: 'ag_abc123' }),
  skillId: z.string().openapi({ example: 'chat' }),
  status: TaskStatusSchema,
  input: z.unknown(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
}).openapi('Task');

export const TaskListResponseSchema = z.object({
  tasks: z.array(TaskSchema),
  total: z.number(),
}).openapi('TaskListResponse');
```

#### 3.2 OpenAPI Route Definitions

```typescript
// packages/hono-runtime/src/openapi/routes.ts

import { createRoute } from '@hono/zod-openapi';
import * as schemas from './schemas';

// --- Health Route ---

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['Platform'],
  summary: 'Health check',
  responses: {
    200: {
      content: { 'application/json': { schema: schemas.HealthSchema } },
      description: 'Service is healthy',
    },
  },
});

// --- Agent CRUD Routes ---

export const listAgentsRoute = createRoute({
  method: 'get',
  path: '/api/agents',
  tags: ['Agents'],
  summary: 'List agents for current user',
  request: {
    query: z.object({
      offset: z.coerce.number().default(0),
      limit: z.coerce.number().default(20).max(100),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: schemas.AgentListResponseSchema } },
      description: 'List of agents',
    },
  },
});

export const createAgentRoute = createRoute({
  method: 'post',
  path: '/api/agents',
  tags: ['Agents'],
  summary: 'Create a new agent',
  request: {
    body: {
      content: { 'application/json': { schema: schemas.CreateAgentSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: schemas.AgentDefinitionSchema } },
      description: 'Agent created',
    },
    400: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Validation error',
    },
    409: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Slug already exists',
    },
  },
});

export const getAgentRoute = createRoute({
  method: 'get',
  path: '/api/agents/{agentId}',
  tags: ['Agents'],
  summary: 'Get agent by ID',
  request: { params: schemas.AgentIdParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: schemas.AgentDefinitionSchema } },
      description: 'Agent definition',
    },
    404: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Agent not found',
    },
  },
});

export const updateAgentRoute = createRoute({
  method: 'put',
  path: '/api/agents/{agentId}',
  tags: ['Agents'],
  summary: 'Update agent',
  request: {
    params: schemas.AgentIdParamSchema,
    body: {
      content: { 'application/json': { schema: schemas.UpdateAgentSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: schemas.AgentDefinitionSchema } },
      description: 'Agent updated',
    },
    404: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Agent not found',
    },
  },
});

export const deleteAgentRoute = createRoute({
  method: 'delete',
  path: '/api/agents/{agentId}',
  tags: ['Agents'],
  summary: 'Delete agent',
  request: { params: schemas.AgentIdParamSchema },
  responses: {
    204: { description: 'Agent deleted' },
    404: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Agent not found',
    },
  },
});

// --- Agent Invocation Routes ---

export const getAgentManifestRoute = createRoute({
  method: 'get',
  path: '/agents/{agentId}/.well-known/agent.json',
  tags: ['Agent Invocation'],
  summary: 'Get agent manifest/card',
  request: { params: schemas.AgentIdParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.record(z.unknown()) } },
      description: 'Agent Card (A2A format)',
    },
    404: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Agent not found',
    },
  },
});

export const listEntrypointsRoute = createRoute({
  method: 'get',
  path: '/agents/{agentId}/entrypoints',
  tags: ['Agent Invocation'],
  summary: 'List agent entrypoints',
  request: { params: schemas.AgentIdParamSchema },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(schemas.SerializedEntrypointSchema),
        },
      },
      description: 'List of entrypoints',
    },
    404: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Agent not found',
    },
  },
});

export const invokeEntrypointRoute = createRoute({
  method: 'post',
  path: '/agents/{agentId}/entrypoints/{key}/invoke',
  tags: ['Agent Invocation'],
  summary: 'Invoke an entrypoint',
  description: 'Execute an agent entrypoint synchronously and return the result.',
  request: {
    params: schemas.AgentIdParamSchema.merge(schemas.EntrypointKeyParamSchema),
    body: {
      content: { 'application/json': { schema: schemas.InvokeRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: schemas.InvokeResponseSchema } },
      description: 'Invocation result',
    },
    400: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Validation error',
    },
    402: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Payment required (x402)',
    },
    404: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Agent or entrypoint not found',
    },
  },
});

export const streamEntrypointRoute = createRoute({
  method: 'post',
  path: '/agents/{agentId}/entrypoints/{key}/stream',
  tags: ['Agent Invocation'],
  summary: 'Stream from an entrypoint (SSE)',
  description: 'Execute an agent entrypoint and stream results via Server-Sent Events.',
  request: {
    params: schemas.AgentIdParamSchema.merge(schemas.EntrypointKeyParamSchema),
    body: {
      content: { 'application/json': { schema: schemas.InvokeRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'text/event-stream': { schema: z.string() } },
      description: 'SSE stream of StreamEnvelope events',
    },
    400: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Streaming not supported for this entrypoint',
    },
    402: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Payment required (x402)',
    },
    404: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Agent or entrypoint not found',
    },
  },
});

// --- A2A Task Routes ---

export const createTaskRoute = createRoute({
  method: 'post',
  path: '/agents/{agentId}/tasks',
  tags: ['A2A Tasks'],
  summary: 'Create an async task',
  request: {
    params: schemas.AgentIdParamSchema,
    body: {
      content: { 'application/json': { schema: schemas.CreateTaskSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: schemas.TaskSchema } },
      description: 'Task created',
    },
    404: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Agent not found',
    },
  },
});

export const listTasksRoute = createRoute({
  method: 'get',
  path: '/agents/{agentId}/tasks',
  tags: ['A2A Tasks'],
  summary: 'List tasks for an agent',
  request: {
    params: schemas.AgentIdParamSchema,
    query: z.object({
      status: schemas.TaskStatusSchema.optional(),
      limit: z.coerce.number().default(20).max(100),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: schemas.TaskListResponseSchema } },
      description: 'List of tasks',
    },
  },
});

export const getTaskRoute = createRoute({
  method: 'get',
  path: '/agents/{agentId}/tasks/{taskId}',
  tags: ['A2A Tasks'],
  summary: 'Get task status',
  request: {
    params: schemas.AgentIdParamSchema.merge(schemas.TaskIdParamSchema),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: schemas.TaskSchema } },
      description: 'Task details',
    },
    404: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Task not found',
    },
  },
});

export const cancelTaskRoute = createRoute({
  method: 'post',
  path: '/agents/{agentId}/tasks/{taskId}/cancel',
  tags: ['A2A Tasks'],
  summary: 'Cancel a task',
  request: {
    params: schemas.AgentIdParamSchema.merge(schemas.TaskIdParamSchema),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: schemas.TaskSchema } },
      description: 'Task cancelled',
    },
    404: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Task not found',
    },
    409: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Task cannot be cancelled (already completed/failed)',
    },
  },
});

export const subscribeTaskRoute = createRoute({
  method: 'get',
  path: '/agents/{agentId}/tasks/{taskId}/subscribe',
  tags: ['A2A Tasks'],
  summary: 'Subscribe to task updates (SSE)',
  request: {
    params: schemas.AgentIdParamSchema.merge(schemas.TaskIdParamSchema),
  },
  responses: {
    200: {
      content: { 'text/event-stream': { schema: z.string() } },
      description: 'SSE stream of task status updates',
    },
    404: {
      content: { 'application/json': { schema: schemas.ErrorSchema } },
      description: 'Task not found',
    },
  },
});
```

#### 3.3 Main App with OpenAPIHono

```typescript
// packages/hono-runtime/src/app.ts

import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { swaggerUI } from '@hono/swagger-ui';
import * as routes from './openapi/routes';

export interface HonoRuntimeConfig {
  store: AgentStore;
  factory: RuntimeFactoryConfig;

  // Optional middleware
  auth?: AuthMiddleware;
  rateLimit?: RateLimitConfig;

  // Caching
  runtimeCache?: RuntimeCache;

  // OpenAPI config
  openapi?: {
    title?: string;
    version?: string;
    description?: string;
  };
}

export function createHonoRuntime(config: HonoRuntimeConfig): OpenAPIHono {
  const app = new OpenAPIHono();

  // Global middleware
  app.use('*', cors());
  app.use('*', logger());

  // Auth middleware (if provided)
  if (config.auth) {
    app.use('*', config.auth);
  }

  // --- OpenAPI Documentation ---

  app.doc('/doc', {
    openapi: '3.0.0',
    info: {
      title: config.openapi?.title ?? 'Lucid Agents Runtime API',
      version: config.openapi?.version ?? '1.0.0',
      description: config.openapi?.description ??
        'Stateless multi-agent runtime with x402 payments and A2A protocol support.',
    },
    tags: [
      { name: 'Platform', description: 'Platform health and metadata' },
      { name: 'Agents', description: 'Agent CRUD operations' },
      { name: 'Agent Invocation', description: 'Invoke agent entrypoints' },
      { name: 'A2A Tasks', description: 'Async task management (A2A protocol)' },
    ],
  });

  // Swagger UI
  app.get('/swagger', swaggerUI({ url: '/doc' }));

  // --- Health Route ---

  app.openapi(routes.healthRoute, (c) => {
    return c.json({
      status: 'ok',
      version: config.openapi?.version ?? '1.0.0',
      timestamp: new Date().toISOString(),
    }, 200);
  });

  // --- Agent CRUD Routes ---

  app.openapi(routes.listAgentsRoute, async (c) => {
    const { offset, limit } = c.req.valid('query');
    const user = c.get('user');

    const agents = await config.store.getByOwner(user.id, { offset, limit });
    const total = await config.store.countByOwner(user.id);

    return c.json({ agents, total, offset, limit }, 200);
  });

  app.openapi(routes.createAgentRoute, async (c) => {
    const body = c.req.valid('json');
    const user = c.get('user');

    // Check slug uniqueness
    const existing = await config.store.getBySlug(body.slug);
    if (existing) {
      return c.json({ error: 'Slug already exists', code: 'SLUG_EXISTS' }, 409);
    }

    const agent = await config.store.create({
      ...body,
      ownerId: user.id,
    });

    return c.json(agent, 201);
  });

  app.openapi(routes.getAgentRoute, async (c) => {
    const { agentId } = c.req.valid('param');
    const user = c.get('user');

    const agent = await config.store.getById(agentId);
    if (!agent || agent.ownerId !== user.id) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    return c.json(agent, 200);
  });

  app.openapi(routes.updateAgentRoute, async (c) => {
    const { agentId } = c.req.valid('param');
    const body = c.req.valid('json');
    const user = c.get('user');

    const agent = await config.store.getById(agentId);
    if (!agent || agent.ownerId !== user.id) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    const updated = await config.store.update(agentId, body);

    // Invalidate runtime cache
    config.runtimeCache?.delete(agentId);

    return c.json(updated, 200);
  });

  app.openapi(routes.deleteAgentRoute, async (c) => {
    const { agentId } = c.req.valid('param');
    const user = c.get('user');

    const agent = await config.store.getById(agentId);
    if (!agent || agent.ownerId !== user.id) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    await config.store.delete(agentId);
    config.runtimeCache?.delete(agentId);

    return c.body(null, 204);
  });

  // --- Agent Resolution Middleware ---

  const resolveAgent = async (c: any, agentId: string) => {
    // Check cache first
    let runtime = config.runtimeCache?.get(agentId);

    if (!runtime) {
      const definition = await config.store.getById(agentId);
      if (!definition) return null;
      if (!definition.enabled) return null;

      runtime = await buildRuntimeForAgent(definition, config.factory);
      config.runtimeCache?.set(agentId, runtime);
    }

    return runtime;
  };

  // --- Agent Invocation Routes ---

  app.openapi(routes.getAgentManifestRoute, async (c) => {
    const { agentId } = c.req.valid('param');
    const runtime = await resolveAgent(c, agentId);

    if (!runtime) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    return c.json(runtime.manifest.get(), 200);
  });

  app.openapi(routes.listEntrypointsRoute, async (c) => {
    const { agentId } = c.req.valid('param');
    const runtime = await resolveAgent(c, agentId);

    if (!runtime) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    return c.json(runtime.agent.listEntrypoints(), 200);
  });

  app.openapi(routes.invokeEntrypointRoute, async (c) => {
    const { agentId, key } = c.req.valid('param');
    const body = c.req.valid('json');
    const runtime = await resolveAgent(c, agentId);

    if (!runtime) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    const entrypoint = runtime.agent.getEntrypoint(key);
    if (!entrypoint) {
      return c.json({ error: 'Entrypoint not found', code: 'ENTRYPOINT_NOT_FOUND' }, 404);
    }

    // Build invocation context
    const sessionId = body.sessionId ?? crypto.randomUUID();
    const requestId = crypto.randomUUID();

    const ctx = {
      agentId,
      entrypointKey: key,
      input: body.input,
      sessionId,
      requestId,
      user: c.get('user'),
      metadata: {
        ...body.metadata,
        source: 'http',
        tenantId: c.req.header('x-tenant-id'),
      },
    };

    const result = await runtime.handlers.invoke(c.req.raw, { key });

    return result;
  });

  app.openapi(routes.streamEntrypointRoute, async (c) => {
    const { agentId, key } = c.req.valid('param');
    const runtime = await resolveAgent(c, agentId);

    if (!runtime) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    const entrypoint = runtime.agent.getEntrypoint(key);
    if (!entrypoint) {
      return c.json({ error: 'Entrypoint not found', code: 'ENTRYPOINT_NOT_FOUND' }, 404);
    }

    if (!entrypoint.streaming) {
      return c.json({
        error: 'Streaming not supported',
        code: 'STREAM_NOT_SUPPORTED',
      }, 400);
    }

    return runtime.handlers.stream(c.req.raw, { key });
  });

  // --- A2A Task Routes ---

  app.openapi(routes.createTaskRoute, async (c) => {
    const { agentId } = c.req.valid('param');
    const body = c.req.valid('json');
    const runtime = await resolveAgent(c, agentId);

    if (!runtime) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    return runtime.handlers.tasks(c.req.raw);
  });

  app.openapi(routes.listTasksRoute, async (c) => {
    const { agentId } = c.req.valid('param');
    const runtime = await resolveAgent(c, agentId);

    if (!runtime) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    return runtime.handlers.listTasks(c.req.raw);
  });

  app.openapi(routes.getTaskRoute, async (c) => {
    const { agentId, taskId } = c.req.valid('param');
    const runtime = await resolveAgent(c, agentId);

    if (!runtime) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    return runtime.handlers.getTask(c.req.raw, { taskId });
  });

  app.openapi(routes.cancelTaskRoute, async (c) => {
    const { agentId, taskId } = c.req.valid('param');
    const runtime = await resolveAgent(c, agentId);

    if (!runtime) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    return runtime.handlers.cancelTask(c.req.raw, { taskId });
  });

  app.openapi(routes.subscribeTaskRoute, async (c) => {
    const { agentId, taskId } = c.req.valid('param');
    const runtime = await resolveAgent(c, agentId);

    if (!runtime) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    return runtime.handlers.subscribeTask(c.req.raw, { taskId });
  });

  // --- Slug-based Routes (aliases) ---
  // These mirror the ID-based routes but use slug for nicer URLs

  const slugRoutes = new OpenAPIHono();

  slugRoutes.use('*', async (c, next) => {
    const slug = c.req.param('slug');
    const definition = await config.store.getBySlug(slug);

    if (!definition) {
      return c.json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    }

    // Rewrite to use agentId internally
    c.set('agentId', definition.id);
    c.set('agentDefinition', definition);

    await next();
  });

  // Mount slug routes at /a/:slug
  app.route('/a/:slug', slugRoutes);

  return app;
}
```

#### 3.4 Usage Example

```typescript
// server.ts

import { createHonoRuntime, createDrizzleAgentStore } from '@lucid-agents/hono-runtime';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { LRUCache } from 'lru-cache';

// Database
const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql);

// Agent store
const store = createDrizzleAgentStore(db);

// Runtime cache
const runtimeCache = new LRUCache<string, AgentRuntime>({
  max: 100,
  ttl: 1000 * 60 * 5, // 5 minutes
});

// Create app
const app = createHonoRuntime({
  store,
  factory: {
    defaultModel: 'gpt-4',
    facilitatorUrl: process.env.FACILITATOR_URL,
  },
  runtimeCache,
  openapi: {
    title: 'My Agent Platform API',
    version: '1.0.0',
    description: 'Multi-agent platform with OpenAPI documentation',
  },
});

// Start server
Bun.serve({
  port: 8787,
  fetch: app.fetch,
});

console.log('Server running at http://localhost:8787');
console.log('OpenAPI docs at http://localhost:8787/swagger');
console.log('OpenAPI JSON at http://localhost:8787/doc');
```

### Phase 4: Handler System

#### 4.1 Handler Types

Entrypoints don't contain arbitrary code. Instead, they reference handler types:

```typescript
// packages/hono-runtime/src/handlers/types.ts

export type HandlerType = 'builtin' | 'llm' | 'graph' | 'webhook' | 'tool-call';

export interface BuiltinHandlerConfig {
  type: 'builtin';
  name: string;  // Reference to registered builtin
}

export interface LLMHandlerConfig {
  type: 'llm';
  model: string;
  systemPrompt?: string;  // Override agent's default
  temperature?: number;
  maxTokens?: number;
  tools?: ToolReference[];
}

export interface GraphHandlerConfig {
  type: 'graph';
  nodes: GraphNode[];
  edges: GraphEdge[];
  startNode: string;
}

export interface WebhookHandlerConfig {
  type: 'webhook';
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  transform?: {
    input?: string;   // JSONPath or template
    output?: string;
  };
}

export interface ToolCallHandlerConfig {
  type: 'tool-call';
  toolId: string;
  inputMapping?: Record<string, string>;
}
```

#### 4.2 Handler Registry

```typescript
// packages/hono-runtime/src/handlers/registry.ts

export interface HandlerRegistry {
  builtins: Map<string, BuiltinHandler>;
  tools: Map<string, ToolDefinition>;
}

export function createHandlerRegistry(): HandlerRegistry {
  const registry: HandlerRegistry = {
    builtins: new Map(),
    tools: new Map(),
  };

  // Register default builtins
  registry.builtins.set('echo', {
    handler: async (ctx) => ({ output: ctx.input }),
  });

  registry.builtins.set('passthrough', {
    handler: async (ctx) => ({ output: ctx.input }),
  });

  return registry;
}

export async function buildHandler(
  entrypoint: SerializedEntrypoint,
  agent: AgentDefinition,
  config: RuntimeFactoryConfig
): Promise<EntrypointHandler> {
  const handlerConfig = entrypoint.handlerConfig;

  switch (entrypoint.handlerType) {
    case 'builtin': {
      const builtin = config.handlers?.builtins.get(handlerConfig.name);
      if (!builtin) throw new Error(`Unknown builtin: ${handlerConfig.name}`);
      return builtin.handler;
    }

    case 'llm': {
      return createLLMHandler({
        model: handlerConfig.model ?? agent.model,
        systemPrompt: handlerConfig.systemPrompt ?? agent.systemPrompt,
        temperature: handlerConfig.temperature,
        maxTokens: handlerConfig.maxTokens,
        tools: handlerConfig.tools,
      });
    }

    case 'graph': {
      return createGraphHandler(handlerConfig);
    }

    case 'webhook': {
      return createWebhookHandler(handlerConfig);
    }

    case 'tool-call': {
      const tool = config.handlers?.tools.get(handlerConfig.toolId);
      if (!tool) throw new Error(`Unknown tool: ${handlerConfig.toolId}`);
      return createToolCallHandler(tool, handlerConfig);
    }

    default:
      throw new Error(`Unknown handler type: ${entrypoint.handlerType}`);
  }
}
```

### Phase 5: Session & Memory Management

#### 5.1 Session Store

```typescript
// packages/hono-runtime/src/session/store.ts

export interface SessionStore {
  get(sessionId: string): Promise<AgentSession | null>;
  set(sessionId: string, session: AgentSession): Promise<void>;
  delete(sessionId: string): Promise<void>;

  // Memory operations
  getMemory(sessionId: string): Promise<unknown>;
  appendMemory(sessionId: string, entry: MemoryEntry): Promise<void>;
  clearMemory(sessionId: string): Promise<void>;
}

export interface AgentSession {
  id: string;
  agentId: string;
  userId?: string;

  memory: MemoryEntry[];
  context: Record<string, unknown>;

  createdAt: Date;
  lastAccessedAt: Date;
}

export interface MemoryEntry {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
```

### Phase 6: Integration with Existing Extensions

#### 6.1 Payment Integration

The runtime will use the existing `@lucid-agents/payments` extension, but with dynamic config:

```typescript
// Deserialize payments config from DB
function deserializePaymentsConfig(serialized: SerializedPaymentsConfig): PaymentsConfig {
  return {
    payTo: serialized.payTo,
    facilitatorUrl: serialized.facilitatorUrl,
    network: serialized.network,
    policyGroups: serialized.policyGroups,
    storage: createSharedPaymentStorage(),  // Use platform-wide storage
  };
}
```

#### 6.2 Scheduler Integration

For scheduled agents, the existing `@lucid-agents/scheduler` can be used:

```typescript
// Worker process (separate from HTTP server)
async function runSchedulerWorker(config: HonoRuntimeConfig) {
  const scheduler = createSchedulerRuntime({ store: createSchedulerStore() });

  while (true) {
    // Find due jobs
    const jobs = await scheduler.tick();

    for (const job of jobs) {
      // Load agent and invoke
      const agent = await config.store.getById(job.agentId);
      if (!agent) continue;

      const runtime = await buildRuntimeForAgent(agent, config.factory);

      await runtime.handlers.invoke({
        agentId: agent.id,
        entrypointKey: job.entrypointKey,
        input: job.input,
        sessionId: job.sessionId,
        requestId: job.id,
        metadata: { source: 'scheduler', jobId: job.id },
      });
    }

    await sleep(1000);
  }
}
```

### Phase 7: Proxy Metadata Pattern

#### 7.1 Header-Based Context

```typescript
// packages/hono-runtime/src/middleware/proxy-context.ts

export function proxyContextMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    // Read metadata from proxy headers
    const proxyContext: ProxyContext = {
      tenantId: c.req.header('x-tenant-id'),
      userId: c.req.header('x-user-id'),
      agentId: c.req.header('x-agent-id'),
      invocationId: c.req.header('x-invocation-id') ?? crypto.randomUUID(),
      isPaid: c.req.header('x-paid') === 'true',
      paymentAmount: c.req.header('x-payment-amount'),
      traceId: c.req.header('x-trace-id'),
    };

    c.set('proxyContext', proxyContext);

    await next();
  };
}
```

---

## Package Structure

```
packages/hono-runtime/
├── package.json
├── tsconfig.json
├── drizzle.config.ts            # Drizzle Kit config
├── src/
│   ├── index.ts                 # Main exports
│   ├── app.ts                   # createHonoRuntime() with OpenAPIHono
│   │
│   ├── openapi/
│   │   ├── schemas.ts           # Zod schemas with .openapi() metadata
│   │   ├── routes.ts            # createRoute() definitions
│   │   └── index.ts             # Re-exports
│   │
│   ├── schema/
│   │   ├── agent.ts             # AgentDefinition types
│   │   └── session.ts           # Session types
│   │
│   ├── db/
│   │   ├── schema.ts            # Drizzle schema
│   │   ├── migrations/          # DB migrations
│   │   └── store.ts             # AgentStore implementation
│   │
│   ├── factory/
│   │   ├── index.ts             # buildRuntimeForAgent()
│   │   ├── deserialize.ts       # Config deserialization
│   │   └── schema-convert.ts    # JSON Schema <-> Zod
│   │
│   ├── handlers/
│   │   ├── types.ts             # Handler type definitions
│   │   ├── registry.ts          # Handler registry
│   │   ├── builtin.ts           # Builtin handlers
│   │   ├── llm.ts               # LLM handler
│   │   ├── graph.ts             # Graph handler
│   │   └── webhook.ts           # Webhook handler
│   │
│   ├── session/
│   │   ├── store.ts             # Session store interface
│   │   ├── postgres.ts          # Postgres implementation
│   │   └── redis.ts             # Redis implementation
│   │
│   ├── middleware/
│   │   ├── auth.ts              # Auth middleware
│   │   ├── proxy-context.ts     # Proxy header parsing
│   │   ├── rate-limit.ts        # Rate limiting
│   │   └── logging.ts           # Request logging
│   │
│   └── worker/
│       ├── scheduler.ts         # Scheduler worker
│       └── cleanup.ts           # Session cleanup worker
│
└── README.md
```

### Dependencies

```json
{
  "dependencies": {
    "@hono/zod-openapi": "^0.18.0",
    "@hono/swagger-ui": "^0.4.0",
    "hono": "^4.6.0",
    "zod": "^3.23.0",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.0",
    "lru-cache": "^11.0.0",
    "@lucid-agents/core": "workspace:*",
    "@lucid-agents/types": "workspace:*",
    "@lucid-agents/http": "workspace:*",
    "@lucid-agents/payments": "workspace:*",
    "@lucid-agents/wallet": "workspace:*",
    "@lucid-agents/a2a": "workspace:*"
  },
  "devDependencies": {
    "drizzle-kit": "^0.28.0",
    "@types/bun": "latest"
  }
}
```

---

## API Surface

### HTTP Endpoints

```
# OpenAPI Documentation
GET    /doc                                 OpenAPI 3.0 JSON spec
GET    /swagger                             Swagger UI

# Platform Routes
GET    /health                              Health check

# Agent CRUD (authenticated)
GET    /api/agents                          List agents (for owner)
POST   /api/agents                          Create agent
GET    /api/agents/{agentId}                Get agent definition
PUT    /api/agents/{agentId}                Update agent
DELETE /api/agents/{agentId}                Delete agent

# Agent Invocation (by ID)
GET    /agents/{agentId}/.well-known/agent.json    Agent Card
GET    /agents/{agentId}/entrypoints               List entrypoints
POST   /agents/{agentId}/entrypoints/{key}/invoke  Invoke entrypoint
POST   /agents/{agentId}/entrypoints/{key}/stream  Stream entrypoint (SSE)

# A2A Tasks (async operations)
POST   /agents/{agentId}/tasks                     Create task
GET    /agents/{agentId}/tasks                     List tasks
GET    /agents/{agentId}/tasks/{taskId}            Get task status
POST   /agents/{agentId}/tasks/{taskId}/cancel     Cancel task
GET    /agents/{agentId}/tasks/{taskId}/subscribe  Subscribe to task (SSE)

# Agent Routes (by slug - nice URLs)
GET    /a/{slug}/.well-known/agent.json
POST   /a/{slug}/entrypoints/{key}/invoke
POST   /a/{slug}/entrypoints/{key}/stream
# ... mirrors all /agents/{agentId} routes
```

### OpenAPI Tags

| Tag | Description |
|-----|-------------|
| `Platform` | Health and system metadata |
| `Agents` | Agent CRUD operations |
| `Agent Invocation` | Invoke agent entrypoints |
| `A2A Tasks` | Async task management (Google A2A protocol) |

### TypeScript API

```typescript
import { createHonoRuntime, createDrizzleAgentStore } from '@lucid-agents/hono-runtime';

// Create store
const store = createDrizzleAgentStore(db);

// Create runtime
const app = createHonoRuntime({
  store,
  factory: {
    defaultModel: 'gpt-4',
    facilitatorUrl: 'https://facilitator.daydreams.systems',
  },
  auth: jwtAuth({ secret: process.env.JWT_SECRET }),
  runtimeCache: new LRUCache({ max: 100 }),
});

// Deploy
Bun.serve({ port: 8787, fetch: app.fetch });
```

---

## Migration Path

### From Existing `@lucid-agents/hono`

The existing package remains for:
- Simple single-agent deployments
- Development/testing
- Edge functions (Cloudflare Workers, etc.)

The new `@lucid-agents/hono-runtime` is for:
- Multi-agent platforms
- SaaS deployments
- Dynamic agent creation via UI

Both can coexist. The runtime package builds on the same core types.

---

## Security Considerations

1. **No arbitrary code execution**: Handlers are predefined types, not user-submitted JS
2. **Policy enforcement**: Per-agent limits enforced at runtime
3. **Tenant isolation**: Agents can only be accessed by their owners
4. **Rate limiting**: Per-agent, per-user, and global rate limits
5. **Payment limits**: x402 policy groups prevent runaway spending

---

## MVP Phased Rollout

### Milestone 1: Core API + Agent CRUD + Invocation (MVP)

**Goal**: A working server where you can create agents via API and invoke them.

**Scope**:
- OpenAPI Hono server with Swagger docs
- Agent CRUD (create, read, update, delete, list)
- Single handler type: `builtin` (echo, passthrough)
- Basic invoke endpoint (no streaming yet)
- In-memory store (no DB required for testing)
- No auth (add API key later)

---

#### Phase 1.1: Package Scaffolding
**Files to create:**

```
packages/hono-runtime/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   └── __tests__/
│       └── app.test.ts
```

**Tasks:**
- [ ] Create package directory
- [ ] Initialize `package.json` with dependencies
- [ ] Configure `tsconfig.json` extending base
- [ ] Add to workspace root `pnpm-workspace.yaml` if needed
- [ ] Verify package builds with `pnpm build`

**package.json:**
```json
{
  "name": "@lucid-agents/hono-runtime",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "bun run src/server.ts",
    "test": "bun test"
  },
  "dependencies": {
    "@hono/zod-openapi": "^0.18.0",
    "@hono/swagger-ui": "^0.4.1",
    "hono": "^4.6.0",
    "zod": "^3.23.0",
    "@lucid-agents/core": "workspace:*",
    "@lucid-agents/types": "workspace:*",
    "@lucid-agents/http": "workspace:*"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Deliverable**: Empty package that builds and can be imported.

---

#### Phase 1.2: OpenAPI Schemas
**Files to create:**

```
src/openapi/
├── schemas.ts      # All Zod schemas with OpenAPI metadata
└── index.ts        # Re-exports
```

**Tasks:**
- [ ] Create `ErrorSchema` - standard error response
- [ ] Create `HealthSchema` - health check response
- [ ] Create `AgentIdParamSchema` - path parameter
- [ ] Create `EntrypointKeyParamSchema` - path parameter
- [ ] Create `SerializedEntrypointSchema` - entrypoint definition
- [ ] Create `CreateAgentSchema` - create agent request body
- [ ] Create `AgentDefinitionSchema` - full agent (extends Create + id, timestamps)
- [ ] Create `UpdateAgentSchema` - partial update
- [ ] Create `AgentListResponseSchema` - paginated list
- [ ] Create `InvokeRequestSchema` - invoke request body
- [ ] Create `InvokeResponseSchema` - invoke response

**Key Schema: CreateAgentSchema**
```typescript
export const CreateAgentSchema = z.object({
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/).openapi({
    example: 'my-echo-agent',
    description: 'URL-friendly unique identifier',
  }),
  name: z.string().min(1).max(128).openapi({ example: 'Echo Agent' }),
  description: z.string().max(1024).default('').openapi({
    example: 'An agent that echoes input',
  }),
  entrypoints: z.array(SerializedEntrypointSchema).min(1).openapi({
    description: 'At least one entrypoint required',
  }),
  enabled: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
}).openapi('CreateAgent');
```

**Key Schema: SerializedEntrypointSchema (MVP)**
```typescript
export const SerializedEntrypointSchema = z.object({
  key: z.string().min(1).openapi({ example: 'echo' }),
  description: z.string().optional().openapi({ example: 'Echo the input' }),
  inputSchema: z.record(z.unknown()).default({}).openapi({
    description: 'JSON Schema for input (empty = any)',
  }),
  outputSchema: z.record(z.unknown()).default({}).openapi({
    description: 'JSON Schema for output (empty = any)',
  }),
  // MVP: only builtin handlers
  handlerType: z.literal('builtin').default('builtin'),
  handlerConfig: z.object({
    name: z.enum(['echo', 'passthrough']).openapi({ example: 'echo' }),
  }),
}).openapi('SerializedEntrypoint');
```

**Deliverable**: All schemas importable, with OpenAPI metadata.

---

#### Phase 1.3: OpenAPI Route Definitions
**Files to create:**

```
src/openapi/
├── routes/
│   ├── health.ts       # Health check route
│   ├── agents.ts       # Agent CRUD routes
│   ├── invoke.ts       # Invocation routes
│   └── index.ts        # Re-exports all routes
```

**Tasks:**
- [ ] Create `healthRoute` - GET /health
- [ ] Create `listAgentsRoute` - GET /api/agents
- [ ] Create `createAgentRoute` - POST /api/agents
- [ ] Create `getAgentRoute` - GET /api/agents/{agentId}
- [ ] Create `updateAgentRoute` - PUT /api/agents/{agentId}
- [ ] Create `deleteAgentRoute` - DELETE /api/agents/{agentId}
- [ ] Create `getAgentManifestRoute` - GET /agents/{agentId}/.well-known/agent.json
- [ ] Create `listEntrypointsRoute` - GET /agents/{agentId}/entrypoints
- [ ] Create `invokeEntrypointRoute` - POST /agents/{agentId}/entrypoints/{key}/invoke

**Example Route Definition:**
```typescript
// src/openapi/routes/invoke.ts
import { createRoute } from '@hono/zod-openapi';
import {
  AgentIdParamSchema,
  EntrypointKeyParamSchema,
  InvokeRequestSchema,
  InvokeResponseSchema,
  ErrorSchema
} from '../schemas';

export const invokeEntrypointRoute = createRoute({
  method: 'post',
  path: '/agents/{agentId}/entrypoints/{key}/invoke',
  tags: ['Invocation'],
  summary: 'Invoke an agent entrypoint',
  description: 'Execute an entrypoint handler and return the result synchronously.',
  request: {
    params: AgentIdParamSchema.merge(EntrypointKeyParamSchema),
    body: {
      content: { 'application/json': { schema: InvokeRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: InvokeResponseSchema } },
      description: 'Invocation successful',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invalid input',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Agent or entrypoint not found',
    },
  },
});
```

**Deliverable**: All route definitions ready to be registered.

---

#### Phase 1.4: In-Memory Agent Store
**Files to create:**

```
src/store/
├── types.ts        # AgentStore interface
├── memory.ts       # In-memory implementation
└── index.ts        # Re-exports
```

**Tasks:**
- [ ] Define `AgentStore` interface
- [ ] Implement `createMemoryAgentStore()`
- [ ] Add ID generation (nanoid or crypto.randomUUID)
- [ ] Add slug uniqueness check
- [ ] Add pagination support for list

**AgentStore Interface:**
```typescript
// src/store/types.ts
export interface AgentStore {
  // Read
  getById(id: string): Promise<AgentDefinition | null>;
  getBySlug(slug: string): Promise<AgentDefinition | null>;
  list(ownerId: string, opts?: { offset?: number; limit?: number }): Promise<AgentDefinition[]>;
  count(ownerId: string): Promise<number>;

  // Write
  create(agent: CreateAgentInput & { ownerId: string }): Promise<AgentDefinition>;
  update(id: string, partial: Partial<CreateAgentInput>): Promise<AgentDefinition | null>;
  delete(id: string): Promise<boolean>;
}

export interface CreateAgentInput {
  slug: string;
  name: string;
  description: string;
  entrypoints: SerializedEntrypoint[];
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}
```

**Memory Store Implementation:**
```typescript
// src/store/memory.ts
export function createMemoryAgentStore(): AgentStore {
  const agents = new Map<string, AgentDefinition>();
  const slugIndex = new Map<string, string>(); // slug -> id

  return {
    async getById(id) {
      return agents.get(id) ?? null;
    },

    async getBySlug(slug) {
      const id = slugIndex.get(slug);
      return id ? agents.get(id) ?? null : null;
    },

    async list(ownerId, opts = {}) {
      const { offset = 0, limit = 20 } = opts;
      return Array.from(agents.values())
        .filter(a => a.ownerId === ownerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(offset, offset + limit);
    },

    async count(ownerId) {
      return Array.from(agents.values())
        .filter(a => a.ownerId === ownerId)
        .length;
    },

    async create(input) {
      // Check slug uniqueness
      if (slugIndex.has(input.slug)) {
        throw new Error('SLUG_EXISTS');
      }

      const id = `ag_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const now = new Date();

      const agent: AgentDefinition = {
        id,
        ownerId: input.ownerId,
        slug: input.slug,
        name: input.name,
        description: input.description ?? '',
        version: '1.0.0',
        entrypoints: input.entrypoints,
        enabled: input.enabled ?? true,
        metadata: input.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      };

      agents.set(id, agent);
      slugIndex.set(input.slug, id);

      return agent;
    },

    async update(id, partial) {
      const existing = agents.get(id);
      if (!existing) return null;

      // Handle slug change
      if (partial.slug && partial.slug !== existing.slug) {
        if (slugIndex.has(partial.slug)) {
          throw new Error('SLUG_EXISTS');
        }
        slugIndex.delete(existing.slug);
        slugIndex.set(partial.slug, id);
      }

      const updated: AgentDefinition = {
        ...existing,
        ...partial,
        id: existing.id, // Prevent id change
        ownerId: existing.ownerId, // Prevent owner change
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      };

      agents.set(id, updated);
      return updated;
    },

    async delete(id) {
      const existing = agents.get(id);
      if (!existing) return false;

      slugIndex.delete(existing.slug);
      agents.delete(id);
      return true;
    },
  };
}
```

**Deliverable**: Working in-memory store with full CRUD operations.

---

#### Phase 1.5: Builtin Handler Registry
**Files to create:**

```
src/handlers/
├── types.ts        # Handler types
├── registry.ts     # Handler registry
├── builtins.ts     # Builtin handlers (echo, passthrough)
└── index.ts        # Re-exports
```

**Tasks:**
- [ ] Define `HandlerFn` type
- [ ] Create `HandlerRegistry` class
- [ ] Implement `echo` handler - returns input as output
- [ ] Implement `passthrough` handler - same as echo
- [ ] Add handler lookup by name

**Handler Types:**
```typescript
// src/handlers/types.ts
export interface HandlerContext {
  agentId: string;
  entrypointKey: string;
  input: unknown;
  sessionId: string;
  requestId: string;
  metadata: Record<string, unknown>;
}

export interface HandlerResult {
  output: unknown;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export type HandlerFn = (ctx: HandlerContext) => Promise<HandlerResult>;

export interface BuiltinHandlerConfig {
  name: string;
}
```

**Builtin Handlers:**
```typescript
// src/handlers/builtins.ts
import type { HandlerFn } from './types';

export const echoHandler: HandlerFn = async (ctx) => {
  return {
    output: ctx.input,
    usage: { total_tokens: 0 },
  };
};

export const passthroughHandler: HandlerFn = async (ctx) => {
  return {
    output: ctx.input,
    usage: { total_tokens: 0 },
  };
};

export const builtinHandlers: Record<string, HandlerFn> = {
  echo: echoHandler,
  passthrough: passthroughHandler,
};
```

**Handler Registry:**
```typescript
// src/handlers/registry.ts
import type { HandlerFn, BuiltinHandlerConfig } from './types';
import { builtinHandlers } from './builtins';

export class HandlerRegistry {
  private builtins: Map<string, HandlerFn>;

  constructor() {
    this.builtins = new Map(Object.entries(builtinHandlers));
  }

  registerBuiltin(name: string, handler: HandlerFn): void {
    this.builtins.set(name, handler);
  }

  getBuiltin(name: string): HandlerFn | undefined {
    return this.builtins.get(name);
  }

  resolveHandler(
    handlerType: string,
    handlerConfig: unknown
  ): HandlerFn {
    if (handlerType === 'builtin') {
      const config = handlerConfig as BuiltinHandlerConfig;
      const handler = this.getBuiltin(config.name);
      if (!handler) {
        throw new Error(`Unknown builtin handler: ${config.name}`);
      }
      return handler;
    }

    throw new Error(`Unknown handler type: ${handlerType}`);
  }
}
```

**Deliverable**: Handler registry with echo/passthrough builtins.

---

#### Phase 1.6: Main Hono App
**Files to create:**

```
src/
├── app.ts          # createHonoRuntime()
├── server.ts       # Dev server entry point
└── index.ts        # Public exports
```

**Tasks:**
- [ ] Create `HonoRuntimeConfig` interface
- [ ] Implement `createHonoRuntime()` function
- [ ] Register OpenAPI doc endpoint at `/doc`
- [ ] Register Swagger UI at `/swagger`
- [ ] Register health route
- [ ] Register agent CRUD routes
- [ ] Register invoke route
- [ ] Add agent resolution middleware
- [ ] Create dev server with example usage

**Main App Structure:**
```typescript
// src/app.ts
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import type { AgentStore } from './store/types';
import { HandlerRegistry } from './handlers/registry';
import * as routes from './openapi/routes';

export interface HonoRuntimeConfig {
  store: AgentStore;

  // Optional: custom handler registry
  handlers?: HandlerRegistry;

  // Optional: OpenAPI metadata
  openapi?: {
    title?: string;
    version?: string;
    description?: string;
  };

  // Optional: default owner for unauthenticated requests (dev mode)
  defaultOwnerId?: string;
}

export function createHonoRuntime(config: HonoRuntimeConfig) {
  const app = new OpenAPIHono();
  const handlers = config.handlers ?? new HandlerRegistry();
  const defaultOwnerId = config.defaultOwnerId ?? 'default-owner';

  // Middleware
  app.use('*', cors());
  app.use('*', logger());

  // OpenAPI Documentation
  app.doc('/doc', {
    openapi: '3.0.0',
    info: {
      title: config.openapi?.title ?? 'Lucid Agents Runtime',
      version: config.openapi?.version ?? '0.1.0',
      description: config.openapi?.description ??
        'Stateless multi-agent runtime API',
    },
    tags: [
      { name: 'Platform', description: 'Health and system info' },
      { name: 'Agents', description: 'Agent CRUD operations' },
      { name: 'Invocation', description: 'Invoke agent entrypoints' },
    ],
  });

  app.get('/swagger', swaggerUI({ url: '/doc' }));

  // --- Routes ---

  // Health
  app.openapi(routes.healthRoute, (c) => {
    return c.json({
      status: 'ok',
      version: config.openapi?.version ?? '0.1.0',
      timestamp: new Date().toISOString(),
    }, 200);
  });

  // List agents
  app.openapi(routes.listAgentsRoute, async (c) => {
    const { offset, limit } = c.req.valid('query');
    const ownerId = defaultOwnerId; // TODO: from auth

    const agents = await config.store.list(ownerId, { offset, limit });
    const total = await config.store.count(ownerId);

    return c.json({ agents, total, offset, limit }, 200);
  });

  // Create agent
  app.openapi(routes.createAgentRoute, async (c) => {
    const body = c.req.valid('json');
    const ownerId = defaultOwnerId; // TODO: from auth

    try {
      const agent = await config.store.create({ ...body, ownerId });
      return c.json(agent, 201);
    } catch (err) {
      if (err instanceof Error && err.message === 'SLUG_EXISTS') {
        return c.json({ error: 'Slug already exists', code: 'SLUG_EXISTS' }, 409);
      }
      throw err;
    }
  });

  // Get agent
  app.openapi(routes.getAgentRoute, async (c) => {
    const { agentId } = c.req.valid('param');

    const agent = await config.store.getById(agentId);
    if (!agent) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    return c.json(agent, 200);
  });

  // Update agent
  app.openapi(routes.updateAgentRoute, async (c) => {
    const { agentId } = c.req.valid('param');
    const body = c.req.valid('json');

    try {
      const agent = await config.store.update(agentId, body);
      if (!agent) {
        return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
      }
      return c.json(agent, 200);
    } catch (err) {
      if (err instanceof Error && err.message === 'SLUG_EXISTS') {
        return c.json({ error: 'Slug already exists', code: 'SLUG_EXISTS' }, 409);
      }
      throw err;
    }
  });

  // Delete agent
  app.openapi(routes.deleteAgentRoute, async (c) => {
    const { agentId } = c.req.valid('param');

    const deleted = await config.store.delete(agentId);
    if (!deleted) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    return c.body(null, 204);
  });

  // Get manifest
  app.openapi(routes.getAgentManifestRoute, async (c) => {
    const { agentId } = c.req.valid('param');

    const agent = await config.store.getById(agentId);
    if (!agent || !agent.enabled) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    // Build simple manifest
    const manifest = {
      name: agent.name,
      description: agent.description,
      version: agent.version,
      skills: agent.entrypoints.map(ep => ({
        id: ep.key,
        description: ep.description,
      })),
    };

    return c.json(manifest, 200);
  });

  // List entrypoints
  app.openapi(routes.listEntrypointsRoute, async (c) => {
    const { agentId } = c.req.valid('param');

    const agent = await config.store.getById(agentId);
    if (!agent || !agent.enabled) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    return c.json(agent.entrypoints, 200);
  });

  // Invoke entrypoint
  app.openapi(routes.invokeEntrypointRoute, async (c) => {
    const { agentId, key } = c.req.valid('param');
    const body = c.req.valid('json');

    // Load agent
    const agent = await config.store.getById(agentId);
    if (!agent || !agent.enabled) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    // Find entrypoint
    const entrypoint = agent.entrypoints.find(ep => ep.key === key);
    if (!entrypoint) {
      return c.json({ error: 'Entrypoint not found', code: 'ENTRYPOINT_NOT_FOUND' }, 404);
    }

    // Resolve handler
    const handler = handlers.resolveHandler(
      entrypoint.handlerType,
      entrypoint.handlerConfig
    );

    // Build context
    const sessionId = body.sessionId ?? crypto.randomUUID();
    const requestId = crypto.randomUUID();

    const ctx = {
      agentId,
      entrypointKey: key,
      input: body.input,
      sessionId,
      requestId,
      metadata: body.metadata ?? {},
    };

    // Execute
    const result = await handler(ctx);

    return c.json({
      output: result.output,
      usage: result.usage,
      sessionId,
      requestId,
    }, 200);
  });

  return app;
}
```

**Dev Server:**
```typescript
// src/server.ts
import { createHonoRuntime } from './app';
import { createMemoryAgentStore } from './store/memory';

const store = createMemoryAgentStore();

const app = createHonoRuntime({
  store,
  openapi: {
    title: 'Lucid Agents Runtime (Dev)',
    version: '0.1.0',
  },
});

const port = parseInt(process.env.PORT ?? '8787');

console.log(`Starting server on http://localhost:${port}`);
console.log(`Swagger UI: http://localhost:${port}/swagger`);
console.log(`OpenAPI spec: http://localhost:${port}/doc`);

Bun.serve({
  port,
  fetch: app.fetch,
});
```

**Deliverable**: Working API server with Swagger UI.

---

#### Phase 1.7: Integration Tests
**Files to create:**

```
src/__tests__/
├── app.test.ts         # Full API tests
├── store.test.ts       # Store tests
└── handlers.test.ts    # Handler tests
```

**Test Cases:**

```typescript
// src/__tests__/app.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { createHonoRuntime } from '../app';
import { createMemoryAgentStore } from '../store/memory';

describe('Hono Runtime API', () => {
  let app: ReturnType<typeof createHonoRuntime>;
  let store: ReturnType<typeof createMemoryAgentStore>;

  beforeEach(() => {
    store = createMemoryAgentStore();
    app = createHonoRuntime({ store });
  });

  describe('GET /health', () => {
    it('returns ok status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
    });
  });

  describe('POST /api/agents', () => {
    it('creates an agent', async () => {
      const res = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'test-agent',
          name: 'Test Agent',
          description: 'A test agent',
          entrypoints: [{
            key: 'echo',
            handlerType: 'builtin',
            handlerConfig: { name: 'echo' },
          }],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.slug).toBe('test-agent');
      expect(body.id).toMatch(/^ag_/);
    });

    it('rejects duplicate slug', async () => {
      const payload = {
        slug: 'duplicate',
        name: 'Agent',
        entrypoints: [{ key: 'x', handlerType: 'builtin', handlerConfig: { name: 'echo' } }],
      };

      await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /agents/{agentId}/entrypoints/{key}/invoke', () => {
    it('invokes echo handler', async () => {
      // Create agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'echo-agent',
          name: 'Echo Agent',
          entrypoints: [{
            key: 'echo',
            handlerType: 'builtin',
            handlerConfig: { name: 'echo' },
          }],
        }),
      });
      const agent = await createRes.json();

      // Invoke
      const invokeRes = await app.request(
        `/agents/${agent.id}/entrypoints/echo/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { message: 'Hello!' },
          }),
        }
      );

      expect(invokeRes.status).toBe(200);
      const result = await invokeRes.json();
      expect(result.output).toEqual({ message: 'Hello!' });
      expect(result.sessionId).toBeDefined();
      expect(result.requestId).toBeDefined();
    });

    it('returns 404 for unknown agent', async () => {
      const res = await app.request(
        '/agents/ag_nonexistent/entrypoints/echo/invoke',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(404);
    });

    it('returns 404 for unknown entrypoint', async () => {
      // Create agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'test',
          name: 'Test',
          entrypoints: [{
            key: 'echo',
            handlerType: 'builtin',
            handlerConfig: { name: 'echo' },
          }],
        }),
      });
      const agent = await createRes.json();

      // Try unknown entrypoint
      const res = await app.request(
        `/agents/${agent.id}/entrypoints/unknown/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('GET /swagger', () => {
    it('returns swagger UI', async () => {
      const res = await app.request('/swagger');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });
  });

  describe('GET /doc', () => {
    it('returns OpenAPI spec', async () => {
      const res = await app.request('/doc');
      expect(res.status).toBe(200);
      const spec = await res.json();
      expect(spec.openapi).toBe('3.0.0');
      expect(spec.paths).toBeDefined();
    });
  });
});
```

**Deliverable**: Passing test suite for all MVP functionality.

---

### MVP Milestone 1 Summary

| Phase | Deliverable | Files |
|-------|-------------|-------|
| 1.1 | Package scaffolding | `package.json`, `tsconfig.json` |
| 1.2 | OpenAPI schemas | `src/openapi/schemas.ts` |
| 1.3 | Route definitions | `src/openapi/routes/*.ts` |
| 1.4 | In-memory store | `src/store/*.ts` |
| 1.5 | Handler registry | `src/handlers/*.ts` |
| 1.6 | Main app | `src/app.ts`, `src/server.ts` |
| 1.7 | Tests | `src/__tests__/*.ts` |

**Total estimated files**: ~15 files
**What works after Milestone 1**:
- ✅ Create agents via API
- ✅ List/get/update/delete agents
- ✅ Invoke agents with echo/passthrough handlers
- ✅ Swagger UI documentation
- ✅ OpenAPI JSON spec

**What's NOT included (future milestones)**:
- ❌ Database persistence (Postgres)
- ❌ Authentication
- ❌ Streaming (SSE)
- ❌ LLM handlers
- ❌ Graph handlers
- ❌ Payments (x402)
- ❌ A2A tasks
- ❌ Scheduler

---

## Future Milestones

### Milestone 2: Persistence + Auth
- Drizzle schema + Postgres store
- JWT/API key authentication
- Rate limiting middleware

### Milestone 3: LLM Handlers
- OpenAI/Anthropic handler type
- Tool calling support
- Streaming (SSE)

### Milestone 4: Payments + A2A
- x402 payment integration
- A2A task routes
- Session/memory management

### Milestone 5: Scheduler + Production
- Scheduler worker
- Graph handlers
- Production hardening

---

## Open Questions

1. **Runtime caching strategy**: LRU? TTL-based? Invalidation on agent update?
2. **Graph handler implementation**: Use existing state machine library? Build custom?
3. **Tool sandbox**: If users can configure tools, how to isolate execution?
4. **Multi-region**: How to handle agent definitions across regions?
