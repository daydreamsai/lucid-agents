// =============================================================================
// Serialized Entrypoint (stored in DB/memory)
// =============================================================================

export interface SerializedEntrypoint {
  key: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  handlerType: 'builtin' | 'llm' | 'graph' | 'webhook';
  handlerConfig: {
    name: string;
    [key: string]: unknown;
  };
  /** Price in base units (e.g., "1000" = $0.001 USDC) */
  price?: string;
  /** Payment network (e.g., "base-sepolia") */
  network?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Extension Configs (serialized for storage)
// =============================================================================

export interface SerializedPaymentsConfig {
  payTo: string;
  network: string;
  facilitatorUrl: string;
}

export interface SerializedWalletsConfig {
  agent?: {
    type: 'local' | 'thirdweb' | 'signer';
    privateKey?: string;
    // thirdweb fields
    secretKey?: string;
    clientId?: string;
    walletLabel?: string;
    chainId?: number;
  };
}

export interface SerializedA2AConfig {
  enabled: boolean;
}

// =============================================================================
// Agent Definition (full record)
// =============================================================================

export interface AgentDefinition {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  entrypoints: SerializedEntrypoint[];
  enabled: boolean;
  metadata: Record<string, unknown>;

  // Extension configs (optional)
  paymentsConfig?: SerializedPaymentsConfig;
  walletsConfig?: SerializedWalletsConfig;
  a2aConfig?: SerializedA2AConfig;

  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Create Agent Input (what the user provides)
// =============================================================================

export interface CreateAgentInput {
  slug: string;
  name: string;
  description?: string;
  entrypoints: SerializedEntrypoint[];
  enabled?: boolean;
  metadata?: Record<string, unknown>;

  // Extension configs (optional)
  paymentsConfig?: SerializedPaymentsConfig;
  walletsConfig?: SerializedWalletsConfig;
  a2aConfig?: SerializedA2AConfig;
}

// =============================================================================
// Agent Store Interface
// =============================================================================

export interface ListOptions {
  offset?: number;
  limit?: number;
}

export interface AgentStore {
  // Read operations
  getById(id: string): Promise<AgentDefinition | null>;
  getBySlug(slug: string): Promise<AgentDefinition | null>;
  list(ownerId: string, opts?: ListOptions): Promise<AgentDefinition[]>;
  count(ownerId: string): Promise<number>;

  // Write operations
  create(
    agent: CreateAgentInput & { ownerId: string }
  ): Promise<AgentDefinition>;
  update(
    id: string,
    partial: Partial<CreateAgentInput>
  ): Promise<AgentDefinition | null>;
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// Error Types
// =============================================================================

export class SlugExistsError extends Error {
  constructor(slug: string) {
    super(`Slug "${slug}" already exists`);
    this.name = 'SlugExistsError';
  }
}
