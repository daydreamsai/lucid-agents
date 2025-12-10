import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';

// =============================================================================
// Serialized Entrypoint (stored in DB/memory)
// =============================================================================

export interface SerializedEntrypoint {
  key: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  handlerType: 'builtin' | 'llm' | 'graph' | 'webhook' | 'js' | 'url';
  handlerConfig?:
    | {
        /** Builtin handler name (echo, passthrough, etc.) */
        name: string;
        [key: string]: unknown;
      }
    | {
        /** Inline JavaScript to execute */
        code: string;
        /** Optional execution timeout override (ms) */
        timeoutMs?: number;
        network?: {
          /** Allow-listed hosts for outbound fetch */
          allowedHosts: string[];
          /** Optional per-request network timeout (ms) */
          timeoutMs?: number;
        };
        [key: string]: unknown;
      }
    | {
        /** Absolute URL to fetch and return */
        url: string;
        /** HTTP method to use (defaults to GET) */
        method?: 'GET' | 'POST';
        /** Optional headers to include */
        headers?: Record<string, string>;
        /** Optional JSON-serializable body (for POST) */
        body?: unknown;
        /** Optional request timeout in milliseconds */
        timeoutMs?: number;
        /** Allowed hosts for this URL handler; use [\"*\"] to allow any host (not recommended) */
        allowedHosts: string[];
        [key: string]: unknown;
      }
    | Record<string, unknown>;
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
  storage?: {
    type: 'sqlite' | 'postgres';
    postgres?: { connectionString: string };
  };
  policyGroups?: PaymentPolicyGroup[];
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

export interface SerializedAP2Config {
  roles: string[];
  description?: string;
  required?: boolean;
}

export interface SerializedAnalyticsConfig {
  enabled: boolean;
}

export interface SerializedIdentityConfig {
  chainId?: number;
  registryAddress?: string;
  autoRegister?: boolean;
  trustModels?: string[];
  trustOverrides?: {
    validationRequestsUri?: string;
    validationResponsesUri?: string;
    feedbackDataUri?: string;
  };
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
  ap2Config?: SerializedAP2Config;
  analyticsConfig?: SerializedAnalyticsConfig;
  identityConfig?: SerializedIdentityConfig;

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
  ap2Config?: SerializedAP2Config;
  analyticsConfig?: SerializedAnalyticsConfig;
  identityConfig?: SerializedIdentityConfig;
}

// =============================================================================
// Agent Store Interface
// =============================================================================

export interface ListOptions {
  offset?: number;
  limit?: number;
  /** Search agents by name, slug, or description */
  search?: string;
  /** Filter by enabled status */
  enabled?: boolean;
}

export interface AgentStore {
  // Read operations
  getById(id: string): Promise<AgentDefinition | null>;
  getBySlug(slug: string): Promise<AgentDefinition | null>;
  list(ownerId: string, opts?: ListOptions): Promise<AgentDefinition[]>;
  count(ownerId: string, opts?: Pick<ListOptions, 'search' | 'enabled'>): Promise<number>;

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
