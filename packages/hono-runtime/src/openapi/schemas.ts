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
    status: z.string().openapi({
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

export const AgentSearchQuerySchema = PaginationQuerySchema.extend({
  search: z.string().optional().openapi({
    example: 'trading',
    description: 'Search agents by name, slug, or description',
  }),
  enabled: z
    .enum(['true', 'false'])
    .optional()
    .transform(val => (val === undefined ? undefined : val === 'true'))
    .openapi({
      example: 'true',
      description: 'Filter by enabled status',
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

export const PaymentStorageConfigSchema = z
  .object({
    type: z.enum(['sqlite', 'postgres']).openapi({
      example: 'sqlite',
      description:
        'Storage backend type. SQLite is automatic (no configuration needed). Postgres requires a connection string.',
    }),
    postgres: z
      .object({
        connectionString: z.string().openapi({
          example: 'postgresql://user:pass@localhost:5432/dbname',
          description:
            'PostgreSQL connection string (required when type is postgres)',
        }),
      })
      .optional(),
  })
  .openapi('PaymentStorageConfig');

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
    storage: PaymentStorageConfigSchema.optional().openapi({
      description:
        'Payment storage configuration (for analytics). Defaults to SQLite if not specified.',
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
          description:
            'Private key for local wallet (required for type: local)',
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

export const AP2ConfigSchema = z
  .object({
    roles: z
      .array(
        z.enum([
          'merchant',
          'shopper',
          'credentials-provider',
          'payment-processor',
        ])
      )
      .min(1)
      .openapi({
        example: ['merchant', 'shopper'],
        description: 'AP2 payment roles this agent supports',
      }),
    description: z.string().optional().openapi({
      example: 'Payment-enabled agent for e-commerce',
      description: 'Optional description of AP2 capabilities',
    }),
    required: z.boolean().default(false).openapi({
      example: false,
      description: 'Whether AP2 payment is required for this agent',
    }),
  })
  .openapi('AP2Config');

export const AnalyticsConfigSchema = z
  .object({
    enabled: z.boolean().default(true).openapi({
      example: true,
      description: 'Whether analytics tracking is enabled (requires payments)',
    }),
  })
  .openapi('AnalyticsConfig');

export const IdentityConfigSchema = z
  .object({
    chainId: z.number().int().positive().optional().openapi({
      example: 84532,
      description:
        'Chain ID for ERC-8004 registry (defaults to Base Sepolia: 84532)',
    }),
    registryAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .optional()
      .openapi({
        example: '0x1234567890abcdef1234567890abcdef12345678',
        description:
          'ERC-8004 registry contract address (optional, falls back to env/default)',
      }),
    autoRegister: z.boolean().default(false).openapi({
      example: false,
      description: 'Whether to automatically register identity if not found',
    }),
    trustModels: z
      .array(z.string())
      .default(['feedback', 'inference-validation'])
      .openapi({
        example: ['feedback', 'inference-validation', 'tee-attestation'],
        description:
          'Trust models to advertise (e.g., feedback, inference-validation, tee-attestation)',
      }),
    trustOverrides: z
      .object({
        validationRequestsUri: z.string().url().optional().openapi({
          example: 'https://example.com/validation-requests',
          description: 'URL for validation requests mirror',
        }),
        validationResponsesUri: z.string().url().optional().openapi({
          example: 'https://example.com/validation-responses',
          description: 'URL for validation responses mirror',
        }),
        feedbackDataUri: z.string().url().optional().openapi({
          example: 'https://example.com/feedback-data',
          description: 'URL for feedback data mirror',
        }),
      })
      .optional()
      .openapi({
        description:
          'Optional custom trust config overrides (off-chain mirrors)',
      }),
  })
  .openapi('IdentityConfig');

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
    handlerType: z
      .enum(['builtin', 'llm', 'graph', 'webhook', 'js', 'url'])
      .default('builtin')
      .openapi({
        example: 'builtin',
        description:
          'Type of handler (builtin, js, url, llm, graph, webhook). Defaults to builtin.',
      }),
    handlerConfig: z
      .union([
        z
          .object({ name: z.string() })
          .catchall(z.unknown())
          .openapi({ description: 'Configuration for builtin handlers' }),
        z
          .object({
            code: z.string().min(1).openapi({
              description: 'Inline JavaScript to execute',
            }),
            timeoutMs: z.number().int().positive().optional().openapi({
              description: 'Execution timeout override in milliseconds',
              example: 1000,
            }),
            network: z
              .object({
                allowedHosts: z
                  .array(z.string())
                  .nonempty()
                  .openapi({
                    description: 'Allow-listed hosts for outbound fetch',
                    example: ['api.example.com', 'example.org'],
                  }),
                timeoutMs: z.number().int().positive().optional().openapi({
                  description: 'Network request timeout in milliseconds',
                  example: 1000,
                }),
              })
              .optional()
              .openapi({ description: 'Optional network allowlist for fetch' }),
          })
          .catchall(z.unknown())
          .openapi({ description: 'Configuration for js handlers' }),
        z
          .object({
            url: z.string().url().openapi({
              description: 'Absolute URL to fetch',
              example: 'https://api.example.com/data',
            }),
            method: z.enum(['GET', 'POST']).default('GET').openapi({
              description: 'HTTP method to use',
            }),
            headers: z.record(z.string(), z.string()).optional().openapi({
              description: 'Headers to include in the request',
            }),
            body: z.unknown().optional().openapi({
              description: 'Optional JSON-serializable body (for POST)',
            }),
            timeoutMs: z.number().int().positive().optional().openapi({
              description: 'Request timeout in milliseconds',
              example: 1000,
            }),
            allowedHosts: z
              .array(z.string())
              .nonempty()
              .openapi({
                description:
                  'Allow-listed hosts for outbound fetch. Use ["*"] to allow any host (not recommended).',
                example: ['api.example.com'],
              }),
          })
          .catchall(z.unknown())
          .openapi({ description: 'Configuration for url handlers' }),
        z.record(z.string(), z.unknown()),
      ])
      .openapi({
        description: 'Configuration for the handler',
        example: { name: 'echo' },
      }),
    price: z.string().optional().openapi({
      example: '1000',
      description:
        'Price in base units (smallest denomination). Must match the token\'s smallest denomination (e.g., "1000" = $0.001 USDC).',
    }),
    network: z.string().optional().openapi({
      example: 'base-sepolia',
      description:
        'Payment network override for this entrypoint (defaults to agent paymentsConfig.network)',
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
    ap2Config: AP2ConfigSchema.optional().openapi({
      description: 'AP2 (Agent Payments Protocol) configuration',
    }),
    analyticsConfig: AnalyticsConfigSchema.optional().openapi({
      description: 'Analytics configuration (requires payments to be enabled)',
    }),
    identityConfig: IdentityConfigSchema.optional().openapi({
      description:
        'ERC-8004 identity configuration (requires wallet to be configured)',
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
          url: z
            .string()
            .url()
            .openapi({ example: 'https://agent.example.com' }),
          protocolBinding: z.string().openapi({ example: 'https' }),
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
        extensions: z.array(z.record(z.string(), z.unknown())).optional(),
      })
      .optional(),
    securitySchemes: z.record(z.string(), z.unknown()).optional(),
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
          header: z.record(z.string(), z.unknown()).optional(),
        })
      )
      .optional(),
    iconUrl: z.string().url().optional(),
    payments: z.array(z.record(z.string(), z.unknown())).optional(),
    registrations: z.array(z.record(z.string(), z.unknown())).optional(),
    trustModels: z.array(z.string()).optional(),
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
export type AP2Config = z.infer<typeof AP2ConfigSchema>;
export type AnalyticsConfig = z.infer<typeof AnalyticsConfigSchema>;
export type IdentityConfig = z.infer<typeof IdentityConfigSchema>;
export type SerializedEntrypoint = z.infer<typeof SerializedEntrypointSchema>;
export type CreateAgent = z.infer<typeof CreateAgentSchema>;
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
export type UpdateAgent = z.infer<typeof UpdateAgentSchema>;
export type AgentListResponse = z.infer<typeof AgentListResponseSchema>;
export type InvokeRequest = z.infer<typeof InvokeRequestSchema>;
export type InvokeResponse = z.infer<typeof InvokeResponseSchema>;
export type AgentManifest = z.infer<typeof AgentManifestSchema>;
