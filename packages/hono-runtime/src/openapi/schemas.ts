import { z } from '@hono/zod-openapi';

// =============================================================================
// Common Schemas
// =============================================================================

export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'Agent not found' }),
    code: z.string().optional().openapi({ example: 'NOT_FOUND' }),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('Error');

export const HealthSchema = z
  .object({
    status: z
      .string()
      .openapi({
        example: 'ok',
        description: 'Health status: ok, degraded, or down',
      }),
    version: z.string().optional().openapi({ example: '0.1.0' }),
    timestamp: z
      .string()
      .datetime()
      .openapi({ example: '2024-01-15T10:30:00Z' }),
  })
  .openapi('Health');

// =============================================================================
// Path Parameter Schemas
// =============================================================================

export const AgentIdParamSchema = z.object({
  agentId: z
    .string()
    .min(1)
    .openapi({
      param: { name: 'agentId', in: 'path' },
      example: 'ag_abc123def456',
    }),
});

export const EntrypointKeyParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .openapi({
      param: { name: 'key', in: 'path' },
      example: 'echo',
    }),
});

// =============================================================================
// Query Parameter Schemas
// =============================================================================

export const PaginationQuerySchema = z.object({
  offset: z.coerce.number().min(0).default(0).openapi({
    example: 0,
    description: 'Number of items to skip',
  }),
  limit: z.coerce.number().min(1).max(100).default(20).openapi({
    example: 20,
    description: 'Maximum number of items to return',
  }),
});

// =============================================================================
// Handler Config Schemas (MVP: only builtin)
// =============================================================================

export const BuiltinHandlerConfigSchema = z
  .object({
    name: z.enum(['echo', 'passthrough']).openapi({
      type: 'string',
      enum: ['echo', 'passthrough'],
      example: 'echo',
      description: 'Name of the builtin handler',
    }),
  })
  .openapi('BuiltinHandlerConfig');

// =============================================================================
// Entrypoint Schema
// =============================================================================

export const SerializedEntrypointSchema = z
  .object({
    key: z.string().min(1).max(64).openapi({
      example: 'echo',
      description: 'Unique identifier for this entrypoint',
    }),
    description: z.string().max(512).optional().openapi({
      example: 'Echo the input back',
      description: 'Human-readable description',
    }),
    inputSchema: z.record(z.string(), z.unknown()).default({}).openapi({
      description: 'JSON Schema for input validation (empty = accept any)',
    }),
    outputSchema: z.record(z.string(), z.unknown()).default({}).openapi({
      description: 'JSON Schema for output validation (empty = accept any)',
    }),
    handlerType: z.literal('builtin').default('builtin').openapi({
      example: 'builtin',
      description: 'Type of handler (MVP: only builtin supported)',
    }),
    handlerConfig: BuiltinHandlerConfigSchema.openapi({
      description: 'Configuration for the handler',
    }),
    metadata: z.record(z.string(), z.unknown()).optional().openapi({
      description: 'Additional metadata',
    }),
  })
  .openapi('SerializedEntrypoint');

// =============================================================================
// Agent Schemas
// =============================================================================

export const CreateAgentSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
      .openapi({
        example: 'my-echo-agent',
        description: 'URL-friendly unique identifier',
      }),
    name: z.string().min(1).max(128).openapi({
      example: 'My Echo Agent',
      description: 'Human-readable name',
    }),
    description: z.string().max(1024).default('').openapi({
      example: 'An agent that echoes input back to the caller',
      description: 'Human-readable description',
    }),
    entrypoints: z.array(SerializedEntrypointSchema).min(1).openapi({
      description: 'At least one entrypoint is required',
    }),
    enabled: z.boolean().default(true).openapi({
      example: true,
      description: 'Whether the agent can be invoked',
    }),
    metadata: z.record(z.string(), z.unknown()).optional().openapi({
      description: 'Additional metadata',
    }),
  })
  .openapi('CreateAgent');

export const AgentDefinitionSchema = CreateAgentSchema.extend({
  id: z.string().openapi({
    example: 'ag_abc123def456',
    description: 'Unique identifier',
  }),
  ownerId: z.string().openapi({
    example: 'usr_xyz789',
    description: 'Owner identifier',
  }),
  version: z.string().openapi({
    example: '1.0.0',
    description: 'Agent version',
  }),
  createdAt: z.string().datetime().openapi({
    example: '2024-01-15T10:30:00Z',
  }),
  updatedAt: z.string().datetime().openapi({
    example: '2024-01-15T10:30:00Z',
  }),
}).openapi('AgentDefinition');

export const UpdateAgentSchema =
  CreateAgentSchema.partial().openapi('UpdateAgent');

export const AgentListResponseSchema = z
  .object({
    agents: z.array(AgentDefinitionSchema),
    total: z.number().openapi({ example: 42 }),
    offset: z.number().openapi({ example: 0 }),
    limit: z.number().openapi({ example: 20 }),
  })
  .openapi('AgentListResponse');

// =============================================================================
// Invocation Schemas
// =============================================================================

export const InvokeRequestSchema = z
  .object({
    input: z.unknown().openapi({
      description: 'Input payload for the entrypoint',
      example: { message: 'Hello, agent!' },
    }),
    sessionId: z.string().optional().openapi({
      example: 'sess_abc123',
      description: 'Session ID for conversation continuity',
    }),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .openapi({
        description: 'Additional metadata for the invocation',
        example: { source: 'api' },
      }),
  })
  .openapi('InvokeRequest');

export const UsageSchema = z
  .object({
    total_tokens: z.number().optional().openapi({ example: 0 }),
    prompt_tokens: z.number().optional().openapi({ example: 0 }),
    completion_tokens: z.number().optional().openapi({ example: 0 }),
  })
  .openapi('Usage');

export const InvokeResponseSchema = z
  .object({
    output: z.unknown().openapi({
      description: 'Output from the entrypoint handler',
      example: { message: 'Hello, agent!' },
    }),
    usage: UsageSchema.optional(),
    sessionId: z.string().openapi({
      example: 'sess_abc123',
      description: 'Session ID used for this invocation',
    }),
    requestId: z.string().openapi({
      example: 'req_xyz789',
      description: 'Unique request identifier',
    }),
  })
  .openapi('InvokeResponse');

// =============================================================================
// Manifest Schema (simplified A2A-style)
// =============================================================================

export const AgentManifestSchema = z
  .object({
    name: z.string().openapi({ example: 'My Echo Agent' }),
    description: z.string().openapi({ example: 'An agent that echoes input' }),
    version: z.string().openapi({ example: '1.0.0' }),
    skills: z.array(
      z.object({
        id: z.string().openapi({ example: 'echo' }),
        description: z
          .string()
          .optional()
          .openapi({ example: 'Echo the input' }),
      })
    ),
  })
  .openapi('AgentManifest');

// =============================================================================
// Type Exports (inferred from schemas)
// =============================================================================

export type Error = z.infer<typeof ErrorSchema>;
export type Health = z.infer<typeof HealthSchema>;
export type SerializedEntrypoint = z.infer<typeof SerializedEntrypointSchema>;
export type CreateAgent = z.infer<typeof CreateAgentSchema>;
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
export type UpdateAgent = z.infer<typeof UpdateAgentSchema>;
export type AgentListResponse = z.infer<typeof AgentListResponseSchema>;
export type InvokeRequest = z.infer<typeof InvokeRequestSchema>;
export type InvokeResponse = z.infer<typeof InvokeResponseSchema>;
export type AgentManifest = z.infer<typeof AgentManifestSchema>;
