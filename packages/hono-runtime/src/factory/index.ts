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
import { z } from 'zod';
import type { AgentRuntime } from '@lucid-agents/types';
import type { AgentDefinition, SerializedEntrypoint } from '../store/types';

// =============================================================================
// Types
// =============================================================================

export interface RuntimeFactoryConfig {
  /** Default payments configuration (if agent doesn't specify) */
  defaultPaymentsConfig?: {
    payTo: string;
    network: string;
    facilitatorUrl: string;
  };

  /** Default wallets configuration (if agent doesn't specify) */
  defaultWalletsConfig?: {
    agent?: {
      type: 'local';
      privateKey: string;
    };
  };
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
  const paymentsConfig = definition.paymentsConfig ?? factoryConfig?.defaultPaymentsConfig;
  if (paymentsConfig) {
    builder = builder.use(
      payments({
        config: {
          payTo: paymentsConfig.payTo,
          network: paymentsConfig.network as any, // Network type is strict, cast for flexibility
          facilitatorUrl: paymentsConfig.facilitatorUrl as `${string}://${string}`,
        },
      })
    );
  }

  // Add wallets if agent has wallet config or factory has default
  const walletsConfig = definition.walletsConfig ?? factoryConfig?.defaultWalletsConfig;
  if (walletsConfig?.agent) {
    // Cast to any to handle the union type mismatch between serialized and runtime config
    builder = builder.use(wallets({ config: { agent: walletsConfig.agent as any } }));
  }

  // Build the runtime
  const runtime = await builder.build();

  // Add entrypoints from definition
  for (const ep of definition.entrypoints) {
    addEntrypointToRuntime(runtime, ep, definition);
  }

  return runtime;
}

/**
 * Add an entrypoint from a serialized definition to the runtime
 */
function addEntrypointToRuntime(
  runtime: AgentRuntime,
  entrypoint: SerializedEntrypoint,
  _agent: AgentDefinition
): void {
  // Build Zod schemas from JSON Schema (simplified - just accept any for MVP)
  const inputSchema = z.unknown();
  const outputSchema = z.unknown();

  // Create handler based on handler type
  const handler = createHandler(entrypoint);

  // Add to runtime
  runtime.entrypoints.add({
    key: entrypoint.key,
    description: entrypoint.description,
    input: inputSchema,
    output: outputSchema,
    price: entrypoint.price,
    network: entrypoint.network as any, // Network type is strict, cast for flexibility
    handler,
  });
}

/**
 * Create a handler function from entrypoint config
 */
function createHandler(entrypoint: SerializedEntrypoint) {
  const { handlerType, handlerConfig } = entrypoint;

  if (handlerType === 'builtin') {
    const name = handlerConfig.name;

    if (name === 'echo' || name === 'passthrough') {
      return async (ctx: { input: unknown }) => {
        return {
          output: ctx.input,
          usage: { total_tokens: 0 },
        };
      };
    }

    throw new Error(`Unknown builtin handler: ${name}`);
  }

  // Future: add 'llm', 'graph', 'webhook' handlers
  throw new Error(`Unknown handler type: ${handlerType}`);
}

// =============================================================================
// Runtime Cache
// =============================================================================

/**
 * Simple LRU-style cache for agent runtimes
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
