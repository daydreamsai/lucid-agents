/**
 * Simplified initialization helpers for agent identity.
 * These functions provide a streamlined API for common use cases.
 */

import type { AgentRuntime } from '@lucid-agents/types/core';
import type { TrustConfig } from '@lucid-agents/types/identity';

import { getRegistryAddresses } from './config';
import {
  bootstrapIdentity,
  type BootstrapIdentityClientFactory,
  type BootstrapIdentityOptions,
  type BootstrapIdentityResult,
  createIdentityRegistryClient,
  type IdentityRegistryClient,
  makeViemClientsFromWallet,
  type PublicClientLike,
  type WalletClientLike,
} from './registries/identity';
import {
  createReputationRegistryClient,
  type ReputationRegistryClient,
} from './registries/reputation';
import {
  createValidationRegistryClient,
  type ValidationRegistryClient,
} from './registries/validation';
import { resolveAutoRegister, validateIdentityConfig } from './validation';

export type { BootstrapIdentityResult };

/**
 * Resolves chainId from parameter, env object, or process.env.
 * Throws if chainId cannot be resolved.
 */
function resolveRequiredChainId(
  chainId: number | undefined,
  env: Record<string, string | undefined> | undefined,
  context?: string
): number {
  const resolvedChainId =
    chainId ??
    (typeof env === 'object' && env?.CHAIN_ID
      ? parseInt(env.CHAIN_ID)
      : typeof process !== 'undefined' && process.env?.CHAIN_ID
        ? parseInt(process.env.CHAIN_ID)
        : undefined);

  if (!resolvedChainId) {
    const contextSuffix = context ? ` ${context}` : '';
    throw new Error(
      `[agent-kit-identity] CHAIN_ID is required${contextSuffix}. Provide it via chainId parameter or CHAIN_ID environment variable.`
    );
  }

  return resolvedChainId;
}

/**
 * Options for creating agent identity with automatic registration.
 */
export type CreateAgentIdentityOptions = {
  /**
   * Agent runtime instance (required).
   * Must have wallets.agent configured for identity operations.
   */
  runtime: AgentRuntime;

  /**
   * Agent domain (e.g., "agent.example.com").
   * Falls back to AGENT_DOMAIN env var if not provided.
   */
  domain?: string;

  /**
   * Whether to automatically register if not found in registry.
   * Defaults to true.
   */
  autoRegister?: boolean;

  /**
   * Chain ID for the ERC-8004 registry.
   * Falls back to CHAIN_ID env var or defaults to Base Sepolia (84532).
   */
  chainId?: number;

  /**
   * Registry contract address.
   * Falls back to IDENTITY_REGISTRY_ADDRESS env var.
   */
  registryAddress?: `0x${string}`;

  /**
   * RPC URL for blockchain connection.
   * Falls back to RPC_URL env var.
   */
  rpcUrl?: string;

  /**
   * Trust models to advertise (e.g., ["feedback", "inference-validation"]).
   * Defaults to ["feedback", "inference-validation"].
   */
  trustModels?: string[];

  /**
   * Optional custom trust config overrides.
   */
  trustOverrides?: {
    validationRequestsUri?: string;
    validationResponsesUri?: string;
    feedbackDataUri?: string;
  };

  /**
   * Custom environment variables object.
   * Defaults to process.env.
   */
  env?: Record<string, string | undefined>;

  /**
   * Optional client factory (useful for testing).
   * If provided, this will be used instead of makeViemClientsFromWallet.
   */
  makeClients?: BootstrapIdentityClientFactory;

  /**
   * Logger for diagnostic messages.
   */
  logger?: {
    info?(message: string): void;
    warn?(message: string, error?: unknown): void;
  };
};

/**
 * Registry clients for interacting with ERC-8004 contracts
 */
export type RegistryClients = {
  identity: IdentityRegistryClient;
  reputation: ReputationRegistryClient;
  validation: ValidationRegistryClient;
};

/**
 * Result of agent identity creation.
 */
export type AgentIdentity = BootstrapIdentityResult & {
  /**
   * Human-readable status message.
   */
  status: string;

  /**
   * The resolved domain.
   */
  domain?: string;

  /**
   * Whether this is the first registration.
   */
  isNewRegistration?: boolean;

  /**
   * Registry clients for all three ERC-8004 registries.
   * Available when registry address and clients are configured.
   */
  clients?: RegistryClients;
};

/**
 * Create agent identity with automatic registration and sensible defaults.
 *
 * This is the recommended way to set up ERC-8004 identity for your agent.
 * It handles:
 * - Viem client creation from environment variables
 * - Automatic registry lookup
 * - Optional auto-registration when not found
 * - Domain proof signature generation
 * - Creation of all three registry clients (identity, reputation, validation)
 *
 * @example
 * ```ts
 * import { createAgentIdentity } from "@lucid-agents/identity";
 *
 * // Minimal usage - uses env vars for everything
 * const identity = await createAgentIdentity({ autoRegister: true });
 *
 * if (identity.trust) {
 *   console.log("Agent registered with ID:", identity.record?.agentId);
 * }
 *
 * // Use registry clients
 * if (identity.clients) {
 *   // Give feedback to another agent
 *   await identity.clients.reputation.giveFeedback({
 *     toAgentId: 42n,
 *     score: 90,
 *     tags: ["reliable", "fast"],
 *   });
 *
 *   // Request validation
 *   await identity.clients.validation.createRequest({
 *     validatorAddress: "0x...",
 *     agentId: identity.record!.agentId,
 *     requestUri: "ipfs://...",
 *     requestHash: "0x...",
 *   });
 * }
 * ```
 *
 * @example
 * ```ts
 * // With explicit config
 * const identity = await createAgentIdentity({
 *   domain: "agent.example.com",
 *   registryAddress: "0x1234...",
 *   chainId: 84532,
 *   autoRegister: true,
 *   trustModels: ["feedback", "inference-validation", "tee-attestation"]
 * });
 *
 * console.log(identity.status);
 * // Use identity.trust in your agent manifest
 * // Use identity.clients for reputation and validation
 * ```
 */
export async function createAgentIdentity(
  options: CreateAgentIdentityOptions
): Promise<AgentIdentity> {
  if (!options.runtime) {
    throw new Error(
      'runtime is required for createAgentIdentity. Pass the AgentRuntime instance from createAgentHttpRuntime or createAgentRuntime.'
    );
  }

  if (!options.runtime.wallets?.agent) {
    throw new Error(
      'runtime.wallets.agent is required for identity operations. Configure a wallet in the runtime config.'
    );
  }

  validateIdentityConfig(options, options.env);

  const {
    runtime,
    domain,
    chainId,
    registryAddress,
    rpcUrl,
    trustModels = ['feedback', 'inference-validation'],
    trustOverrides,
    env,
    logger,
    makeClients,
  } = options;

  const autoRegister = resolveAutoRegister(options, env);

  const viemFactory =
    makeClients ??
    (await makeViemClientsFromWallet({
      env,
      rpcUrl,
      walletHandle: runtime.wallets.agent,
    }));

  const resolvedChainId = resolveRequiredChainId(chainId, env);
  const resolvedRegistryAddress =
    registryAddress ??
    (typeof env === 'object' && env?.IDENTITY_REGISTRY_ADDRESS
      ? (env.IDENTITY_REGISTRY_ADDRESS as `0x${string}`)
      : undefined) ??
    getRegistryAddresses(resolvedChainId).IDENTITY_REGISTRY;

  const bootstrapOptions: BootstrapIdentityOptions = {
    domain,
    chainId: resolvedChainId,
    registryAddress: resolvedRegistryAddress,
    rpcUrl,
    env,
    logger,
    makeClients: viemFactory,
    registerIfMissing: autoRegister,
    trustOverrides: {
      trustModels,
      ...trustOverrides,
    },
  };

  const result = await bootstrapIdentity(bootstrapOptions);

  let status: string;
  let isNewRegistration = false;

  if (result.didRegister) {
    status = 'Successfully registered agent in ERC-8004 registry';
    if (result.signature) {
      status += ' (with domain proof signature)';
    }
    isNewRegistration = true;
  } else if (result.record) {
    status = 'Found existing registration in ERC-8004 registry';
    if (result.signature) {
      status += ' (with domain proof signature)';
    }
  } else if (result.trust) {
    status = 'ERC-8004 identity configured';
  } else {
    status = 'No ERC-8004 identity - agent will run without on-chain identity';
  }

  const resolvedDomain =
    domain ?? (typeof env === 'object' ? env?.AGENT_DOMAIN : undefined);

  let clients: RegistryClients | undefined;

  if (viemFactory) {
    try {
      const resolvedChainId = resolveRequiredChainId(
        chainId,
        env,
        'for registry clients'
      );

      const resolvedRpcUrl =
        rpcUrl ??
        (typeof env === 'object' && env?.RPC_URL
          ? env.RPC_URL
          : typeof process !== 'undefined' && process.env?.RPC_URL
            ? process.env.RPC_URL
            : undefined);

      if (!resolvedRpcUrl) {
        throw new Error(
          '[agent-kit-identity] RPC_URL is required for registry clients. Provide it via rpcUrl parameter or RPC_URL environment variable.'
        );
      }

      const vClients = await viemFactory({
        chainId: resolvedChainId,
        rpcUrl: resolvedRpcUrl,
        env: env ?? {},
      });

      if (vClients?.publicClient) {
        const registryAddresses = getRegistryAddresses(resolvedChainId);
        const identityAddress =
          registryAddress ?? registryAddresses.IDENTITY_REGISTRY;

        clients = {
          identity: createIdentityRegistryClient({
            address: identityAddress,
            chainId: resolvedChainId,
            publicClient: vClients.publicClient as PublicClientLike,
            walletClient: vClients.walletClient as WalletClientLike | undefined,
          }),
          reputation: createReputationRegistryClient({
            address: registryAddresses.REPUTATION_REGISTRY,
            chainId: resolvedChainId,
            publicClient: vClients.publicClient as PublicClientLike,
            walletClient: vClients.walletClient as WalletClientLike | undefined,
            identityRegistryAddress: identityAddress,
          }),
          validation: createValidationRegistryClient({
            address: registryAddresses.VALIDATION_REGISTRY,
            chainId: resolvedChainId,
            publicClient: vClients.publicClient as PublicClientLike,
            walletClient: vClients.walletClient as WalletClientLike | undefined,
            identityRegistryAddress: identityAddress,
          }),
        };
      }
    } catch (error) {
      // Failed to create clients, but that's okay - agent can still work without them
      const log = logger ?? { warn: console.warn };
      log.warn?.(
        '[agent-kit-identity] Failed to create registry clients',
        error
      );
    }
  }

  const identity: AgentIdentity = {
    ...result,
    status,
    domain: resolvedDomain,
    isNewRegistration,
    clients,
  };

  if (identity.didRegister && identity.domain) {
    const log = logger ?? { info: console.log };
    const metadata = generateAgentMetadata(identity);

    log.info?.('\nHost this metadata at your domain:');
    log.info?.(
      `   https://${identity.domain}/.well-known/agent-metadata.json\n`
    );
    log.info?.(JSON.stringify(metadata, null, 2));
    log.info?.('');
  }

  return identity;
}

/**
 * Quick registration helper for agents.
 * This is a convenience wrapper around createAgentIdentity that forces registration.
 *
 * @example
 * ```ts
 * import { registerAgent } from "@lucid-agents/identity";
 *
 * const result = await registerAgent({
 *   domain: "my-agent.example.com"
 * });
 *
 * if (result.isNewRegistration) {
 *   console.log("Registered! TX:", result.transactionHash);
 * } else {
 *   console.log("Already registered with ID:", result.record?.agentId);
 * }
 * ```
 */
export async function registerAgent(
  options: CreateAgentIdentityOptions
): Promise<AgentIdentity> {
  return createAgentIdentity({
    ...options,
    autoRegister: true,
  });
}

/**
 * Helper to extract trust config from created identity.
 * Useful when you need just the trust config for your agent manifest.
 *
 * @example
 * ```ts
 * import { createAgentIdentity, getTrustConfig } from "@lucid-agents/identity";
 *
 * const identity = await createAgentIdentity({ autoRegister: true });
 * const trustConfig = getTrustConfig(identity);
 *
 * // Use in createAgentApp
 * createAgentApp({ name: "my-agent", version: "1.0.0" }, {
 *   trust: trustConfig
 * });
 * ```
 */
export function getTrustConfig(result: AgentIdentity): TrustConfig | undefined {
  return result.trust;
}

/**
 * Generate agent metadata JSON for hosting at /.well-known/agent-metadata.json
 *
 * @example
 * ```ts
 * const identity = await createAgentIdentity({ autoRegister: true });
 * const metadata = generateAgentMetadata(identity, {
 *   name: "My Agent",
 *   description: "An intelligent assistant",
 *   capabilities: [{ name: "chat", description: "Natural language conversation" }]
 * });
 * // Host this JSON at https://your-domain/.well-known/agent-metadata.json
 * ```
 */
export function generateAgentMetadata(
  identity: AgentIdentity,
  options?: {
    name?: string;
    description?: string;
    capabilities?: Array<{ name: string; description: string }>;
  }
) {
  const metadata: Record<string, unknown> = {
    name: options?.name || 'Agent',
    description: options?.description || 'An AI agent',
    domain: identity.domain,
  };

  if (identity.record?.owner) {
    metadata.address = identity.record.owner;
  }

  if (options?.capabilities && options.capabilities.length > 0) {
    metadata.capabilities = options.capabilities;
  }

  if (identity.trust?.trustModels && identity.trust.trustModels.length > 0) {
    metadata.trustModels = identity.trust.trustModels;
  }

  return metadata;
}
