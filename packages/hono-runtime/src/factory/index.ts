/**
 * Agent Runtime Factory
 *
 * Builds agent runtimes dynamically from stored definitions using
 * the @lucid-agents/core builder pattern.
 */

import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { a2a } from '@lucid-agents/a2a';
import { payments } from '@lucid-agents/payments';
import { wallets } from '@lucid-agents/wallet';
import { ap2 } from '@lucid-agents/ap2';
import { analytics } from '@lucid-agents/analytics';
import { z } from 'zod';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { AgentRuntime } from '@lucid-agents/types';
import type {
  PaymentsConfig,
  PaymentStorageConfig,
} from '@lucid-agents/types/payments';
import type { PaymentStorage } from '@lucid-agents/payments';
import type { AgentContext, EntrypointHandler } from '@lucid-agents/types/core';
import type { Network } from '@lucid-agents/types';
import type { AgentDefinition, SerializedEntrypoint } from '../store/types';
import { HandlerRegistry } from '../handlers/registry';
import { createJsHandler } from '../handlers/js';
import { createUrlHandler } from '../handlers/url';
import type { HandlerFn } from '../handlers';
import { createDrizzlePaymentStorage } from '../store/drizzle/payment-storage';
import type * as schema from '../store/drizzle/schema';

// =============================================================================
// Types
// =============================================================================

type PaymentStorageFactory = (
  storageConfig?: PaymentStorageConfig,
  agentId?: string
) => PaymentStorage;

export interface RuntimeFactoryConfig {
  /** Default payments configuration (if agent doesn't specify) */
  defaultPaymentsConfig?: {
    payTo: string;
    network: string;
    facilitatorUrl: string;
    storage?: {
      type: 'sqlite' | 'in-memory' | 'postgres';
      sqlite?: {
        dbPath?: string;
      };
      postgres?: {
        connectionString: string;
      };
    };
  };

  /** Default wallets configuration (if agent doesn't specify) */
  defaultWalletsConfig?: {
    agent?: {
      type: 'local';
      privateKey: string;
    };
  };

  /** Drizzle database instance (for shared payment storage when using Postgres) */
  drizzleDb?: PostgresJsDatabase<typeof schema>;
}

// =============================================================================
// Network Validation
// =============================================================================

/**
 * Known supported networks (EVM and Solana).
 * This list should match x402/types SupportedEVMNetworks and SupportedSVMNetworks.
 */
const KNOWN_SUPPORTED_NETWORKS: readonly string[] = [
  // EVM networks
  'base',
  'base-sepolia',
  'ethereum',
  'sepolia',
  // Solana networks
  'solana',
  'solana-devnet',
];

/**
 * Validate and narrow network string to Network type.
 * Returns undefined if network is not provided or not supported.
 * Logs a warning for unsupported networks but doesn't throw.
 */
function validateNetwork(network: string | undefined): Network | undefined {
  if (!network) {
    return undefined;
  }

  if (KNOWN_SUPPORTED_NETWORKS.includes(network as string)) {
    return network as Network;
  }

  console.warn(
    `[hono-runtime] Unsupported network "${network}" for entrypoint. ` +
      `Supported networks: ${KNOWN_SUPPORTED_NETWORKS.join(', ')}`
  );

  return undefined;
}

// =============================================================================
// Runtime Factory
// =============================================================================

/**
 * Build an AgentRuntime from a stored AgentDefinition.
 *
 * This uses the @lucid-agents/core builder pattern to compose
 * extensions (http, a2a, payments, wallets) based on the agent's config.
 */
export async function buildRuntimeForAgent(
  definition: AgentDefinition,
  factoryConfig?: RuntimeFactoryConfig
): Promise<AgentRuntime> {
  const handlerRegistry = new HandlerRegistry();
  handlerRegistry.registerJsFactory(createJsHandler);
  handlerRegistry.registerUrlFactory(createUrlHandler);

  // Start with base agent metadata
  let builder = createAgent({
    name: definition.name,
    version: definition.version,
    description: definition.description,
  });

  // Always add HTTP extension (required for API)
  builder = builder.use(http());

  // Always add A2A extension (for agent discovery/interop)
  builder = builder.use(a2a());

  // Add payments if agent has payment config or factory has default
  const paymentsConfig =
    definition.paymentsConfig ?? factoryConfig?.defaultPaymentsConfig;
  if (paymentsConfig) {
    const paymentsExtensionConfig: PaymentsConfig = {
      payTo: paymentsConfig.payTo as PaymentsConfig['payTo'],
      network: paymentsConfig.network as PaymentsConfig['network'],
      facilitatorUrl:
        paymentsConfig.facilitatorUrl as PaymentsConfig['facilitatorUrl'],
      ...(paymentsConfig.storage && { storage: paymentsConfig.storage }),
      ...('policyGroups' in paymentsConfig &&
        paymentsConfig.policyGroups && {
          policyGroups: paymentsConfig.policyGroups,
        }),
    };

    // Use Drizzle payment storage if available and Postgres is configured
    let storageFactory: PaymentStorageFactory | undefined;

    if (
      factoryConfig?.drizzleDb &&
      paymentsConfig.storage?.type === 'postgres'
    ) {
      storageFactory = (_storageConfig, agentId) => {
        return createDrizzlePaymentStorage(factoryConfig!.drizzleDb!, agentId);
      };
    }

    builder = builder.use(
      payments({
        config: paymentsExtensionConfig,
        agentId: definition.id,
        storageFactory,
      })
    );
  }

  // Add wallets if agent has wallet config or factory has default
  const walletsConfig =
    definition.walletsConfig ?? factoryConfig?.defaultWalletsConfig;
  if (walletsConfig?.agent) {
    const agentWallet = walletsConfig.agent;
    // Construct proper AgentWalletConfig based on type
    if (agentWallet.type === 'local' && agentWallet.privateKey) {
      builder = builder.use(
        wallets({
          config: {
            agent: {
              type: 'local',
              privateKey: agentWallet.privateKey,
            },
          },
        })
      );
    } else if (agentWallet.type === 'thirdweb') {
      builder = builder.use(
        wallets({
          config: {
            agent: {
              type: 'thirdweb',
              secretKey: agentWallet.secretKey ?? '',
              clientId: agentWallet.clientId,
              walletLabel: agentWallet.walletLabel ?? '',
              chainId: agentWallet.chainId ?? 84532,
            },
          },
        })
      );
    }
    // Note: 'signer' type requires code-level integration, not supported in platform
  }

  // Add AP2 extension if configured
  if (definition.ap2Config) {
    builder = builder.use(
      ap2({
        roles: definition.ap2Config.roles as any,
        description: definition.ap2Config.description,
        required: definition.ap2Config.required ?? false,
      })
    );
  }

  // Add analytics extension if payments are enabled (analytics depends on payments)
  if (paymentsConfig && definition.analyticsConfig?.enabled) {
    builder = builder.use(analytics());
  }

  // Build the runtime
  const runtime = await builder.build();

  // Add entrypoints from definition
  for (const ep of definition.entrypoints) {
    addEntrypointToRuntime(runtime, ep, definition, handlerRegistry);
  }

  return runtime;
}

/**
 * Add an entrypoint from a serialized definition to the runtime
 */
function addEntrypointToRuntime(
  runtime: AgentRuntime,
  entrypoint: SerializedEntrypoint,
  agent: AgentDefinition,
  handlerRegistry: HandlerRegistry
): void {
  // Build Zod schemas from JSON Schema (simplified - just accept any for MVP)
  const inputSchema = z.unknown();
  const outputSchema = z.unknown();

  // Create handler based on handler type
  const handler = handlerRegistry.resolveHandler(
    entrypoint.handlerType,
    entrypoint.handlerConfig
  ) as HandlerFn;

  // Wrap HandlerFn to the EntrypointHandler shape expected by runtime
  const wrappedHandler: EntrypointHandler<
    typeof inputSchema,
    typeof outputSchema
  > = async ctx => {
    const handlerCtx = {
      agentId: agent.id,
      entrypointKey: entrypoint.key,
      input: ctx.input,
      sessionId:
        (ctx.metadata &&
        typeof (ctx.metadata as Record<string, unknown>).sessionId === 'string'
          ? ((ctx.metadata as Record<string, unknown>).sessionId as string)
          : undefined) ||
        (typeof ctx.runId === 'string' ? ctx.runId : undefined) ||
        crypto.randomUUID(),
      requestId: ctx.runId ?? crypto.randomUUID(),
      metadata: (ctx.metadata as Record<string, unknown>) ?? {},
    };

    const result = await handler(handlerCtx);

    return {
      output: result.output,
      usage: result.usage,
      model: undefined,
    };
  };

  // Validate and narrow network type
  const network = validateNetwork(entrypoint.network);

  // Add to runtime
  runtime.entrypoints.add({
    key: entrypoint.key,
    description: entrypoint.description,
    input: inputSchema,
    output: outputSchema,
    price: entrypoint.price,
    network,
    handler: wrappedHandler,
  });
}

// =============================================================================
// Runtime Cache
// =============================================================================

/**
 * Simple FIFO cache for agent runtimes
 */
export class RuntimeCache {
  private cache = new Map<string, { runtime: AgentRuntime; version: string }>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(agentId: string, version: string): AgentRuntime | null {
    const entry = this.cache.get(agentId);
    if (entry && entry.version === version) {
      return entry.runtime;
    }
    return null;
  }

  set(agentId: string, version: string, runtime: AgentRuntime): void {
    // Simple eviction: remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(agentId, { runtime, version });
  }

  delete(agentId: string): void {
    this.cache.delete(agentId);
  }

  clear(): void {
    this.cache.clear();
  }
}
