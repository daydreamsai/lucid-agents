import { z } from '@hono/zod-openapi';

// =============================================================================
// Common Schemas
// =============================================================================

export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'Agent not found' }),
    code: z.string().optional().openapi({ example: 'NOT_FOUND' }),
    details: z.record(z.string(), z.any()).optional(),
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
// Extension Config Schemas
// =============================================================================

export const PaymentsConfigSchema = z
  .object({
    payTo: z.string().openapi({
      example: '0x1234567890abcdef1234567890abcdef12345678',
      description: 'Wallet address to receive payments',
    }),
    network: z.string().openapi({
      example: 'base-sepolia',
      description: 'Payment network (e.g., base-sepolia, base, solana-devnet)',
    }),
    facilitatorUrl: z.string().url().openapi({
      example: 'https://facilitator.example.com',
      description: 'URL of the x402 facilitator service',
    }),
  })
  .openapi('PaymentsConfig');

export const WalletsConfigSchema = z
  .object({
    agent: z
      .object({
        type: z.enum(['local', 'thirdweb', 'signer']).openapi({
          example: 'local',
          description: 'Wallet type',
        }),
        privateKey: z.string().optional().openapi({
          description: 'Private key for local wallet (required for type: local)',
        }),
        secretKey: z.string().optional().openapi({
          description: 'Thirdweb secret key (for type: thirdweb)',
        }),
        clientId: z.string().optional().openapi({
          description: 'Thirdweb client ID (for type: thirdweb)',
        }),
        walletLabel: z.string().optional().openapi({
          description: 'Wallet label (for type: thirdweb)',
        }),
        chainId: z.number().optional().openapi({
          description: 'Chain ID (for type: thirdweb)',
        }),
      })
      .optional()
      .openapi({
        description: 'Agent wallet configuration for making payments',
      }),
  })
  .openapi('WalletsConfig');

export const A2AConfigSchema = z
  .object({
    enabled: z.boolean().default(true).openapi({
      example: true,
      description: 'Whether A2A protocol is enabled for this agent',
    }),
  })
  .openapi('A2AConfig');

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
    inputSchema: z.record(z.string(), z.any()).default({}).openapi({
      description: 'JSON Schema for input validation (empty = accept any)',
    }),
    outputSchema: z.record(z.string(), z.any()).default({}).openapi({
      description: 'JSON Schema for output validation (empty = accept any)',
    }),
    handlerType: z
      .enum(['builtin', 'llm', 'graph', 'webhook'])
      .default('builtin')
      .openapi({
        example: 'builtin',
        description:
          'Type of handler (e.g., builtin, llm, graph, webhook). Defaults to builtin.',
    }),
    handlerConfig: z
      .object({ name: z.string() })
      .catchall(z.unknown())
      .openapi({
        description: 'Configuration for the handler',
        example: { name: 'echo', model: 'gpt-4o' },
      }),
    price: z.string().optional().openapi({
      example: '0.01',
      description: 'Price in USD to invoke this entrypoint (e.g., "0.01" = $0.01)',
    }),
    network: z.string().optional().openapi({
      example: 'base-sepolia',
      description: 'Payment network override for this entrypoint (defaults to agent paymentsConfig.network)',
    }),
    metadata: z.record(z.string(), z.any()).optional().openapi({
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
    metadata: z.record(z.string(), z.any()).optional().openapi({
      description: 'Additional metadata',
    }),
    // Extension configurations
    paymentsConfig: PaymentsConfigSchema.optional().openapi({
      description: 'Payment configuration for monetizing entrypoints',
    }),
    walletsConfig: WalletsConfigSchema.optional().openapi({
      description: 'Wallet configuration for agent to make payments',
    }),
    a2aConfig: A2AConfigSchema.optional().openapi({
      description: 'Agent-to-agent protocol configuration',
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
    output: z.any().openapi({
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
    protocolVersion: z.string().optional().openapi({ example: '1.0' }),
    name: z.string().openapi({ example: 'My Echo Agent' }),
    description: z.string().optional().openapi({
      example: 'An agent that echoes input',
    }),
    url: z.string().url().optional().openapi({
      example: 'https://agent.example.com',
      description: 'Canonical URL of the agent',
    }),
    supportedInterfaces: z
      .array(
        z.object({
          url: z.string().url().openapi({ example: 'https://agent.example.com' }),
          protocolBinding: z
            .string()
            .openapi({ example: 'https' }),
        })
      )
      .optional(),
    provider: z
      .object({
        organization: z.string().optional(),
        url: z.string().url().optional(),
      })
      .optional(),
    version: z.string().optional().openapi({ example: '1.0.0' }),
    documentationUrl: z.string().url().optional(),
    capabilities: z
      .object({
        streaming: z.boolean().optional(),
        pushNotifications: z.boolean().optional(),
        stateTransitionHistory: z.boolean().optional(),
        extensions: z.array(z.record(z.string(), z.any())).optional(),
      })
      .optional(),
    securitySchemes: z.record(z.string(), z.any()).optional(),
    security: z.array(z.unknown()).optional(),
    defaultInputModes: z.array(z.string()).optional(),
    defaultOutputModes: z.array(z.string()).optional(),
    skills: z
      .array(
        z.object({
          id: z.string().openapi({ example: 'echo' }),
          name: z.string().optional(),
          description: z.string().optional(),
          tags: z.array(z.string()).optional(),
          examples: z.array(z.string()).optional(),
          inputModes: z.array(z.string()).optional(),
          outputModes: z.array(z.string()).optional(),
          security: z.array(z.unknown()).optional(),
        })
      )
      .optional(),
    supportsAuthenticatedExtendedCard: z.boolean().optional(),
    signatures: z
      .array(
        z.object({
          protected: z.string(),
          signature: z.string(),
          header: z.record(z.string(), z.any()).optional(),
        })
      )
      .optional(),
    iconUrl: z.string().url().optional(),
    payments: z.array(z.record(z.string(), z.any())).optional(),
    registrations: z.array(z.record(z.string(), z.any())).optional(),
    trustModels: z.array(z.record(z.string(), z.any())).optional(),
    ValidationRequestsURI: z.string().url().optional(),
    ValidationResponsesURI: z.string().url().optional(),
    FeedbackDataURI: z.string().url().optional(),
    entrypoints: z
      .record(
        z.string(),
        z
          .object({
            description: z.string().optional(),
            streaming: z.boolean(),
            input_schema: z.unknown().optional(),
            output_schema: z.unknown().optional(),
            pricing: z
              .object({
                invoke: z.string().optional(),
                stream: z.string().optional(),
              })
              .optional(),
          })
          .passthrough()
      )
      .openapi({ description: 'Entrypoint definitions keyed by skill id' }),
  })
  .passthrough()
  .openapi('AgentManifest');

// =============================================================================
// Type Exports (inferred from schemas)
// =============================================================================

export type Error = z.infer<typeof ErrorSchema>;
export type Health = z.infer<typeof HealthSchema>;
export type PaymentsConfig = z.infer<typeof PaymentsConfigSchema>;
export type WalletsConfig = z.infer<typeof WalletsConfigSchema>;
export type A2AConfig = z.infer<typeof A2AConfigSchema>;
export type SerializedEntrypoint = z.infer<typeof SerializedEntrypointSchema>;
export type CreateAgent = z.infer<typeof CreateAgentSchema>;
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
export type UpdateAgent = z.infer<typeof UpdateAgentSchema>;
export type AgentListResponse = z.infer<typeof AgentListResponseSchema>;
export type InvokeRequest = z.infer<typeof InvokeRequestSchema>;
export type InvokeResponse = z.infer<typeof InvokeResponseSchema>;
export type AgentManifest = z.infer<typeof AgentManifestSchema>;
