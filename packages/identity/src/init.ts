/**
 * Simplified initialization helpers for agent identity.
 * These functions provide a streamlined API for common use cases.
 */

import type { AgentRuntime } from '@lucid-agents/types/core';
import type { AgentRegistration, TrustConfig } from '@lucid-agents/types/identity';
import type {
  AgentWalletHandle,
  DeveloperWalletHandle,
} from '@lucid-agents/types/wallets';

import { getRegistryAddresses } from './config';
import {
  bootstrapIdentity,
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
import { type ValidationRegistryClient } from './registries/validation';
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
export type AgentRegistrationOptions = {
  name?: string;
  description?: string;
  image?: string;
  url?: string;
  services?: Array<{
    id?: string;
    type?: string;
    serviceEndpoint: string;
    description?: string;
    [key: string]: unknown;
  }>;
  x402Support?: boolean;
  active?: boolean;
  registrations?: TrustConfig['registrations'];
  supportedTrust?: TrustConfig['trustModels'];
};

export type CreateAgentIdentityOptions = {
  /**
   * Agent runtime instance (optional if walletHandle is provided).
   * If walletHandle is not provided, runtime.wallets.developer is required.
   */
  runtime?: AgentRuntime;

  /**
   * Optional wallet handle to use for identity operations.
   * Takes precedence over runtime.wallets.developer.
   * Useful when passing a browser-connected wallet (e.g., thirdweb account).
   */
  walletHandle?: AgentWalletHandle | DeveloperWalletHandle;

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
   * Optional registration file overrides for logging and generation.
   */
  registration?: AgentRegistrationOptions;

  /**
   * Custom environment variables object.
   * Defaults to process.env.
   */
  env?: Record<string, string | undefined>;

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
 *
 * @deprecated Validation Registry is under active development and will be revised
 * in a follow-up spec update later this year. It is excluded from default client
 * creation but can be manually created if needed for backward compatibility.
 */
export type RegistryClients = {
  identity: IdentityRegistryClient;
  reputation: ReputationRegistryClient;
  validation?: ValidationRegistryClient; // Deprecated - under active development
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
 * - Creation of registry clients (identity, reputation)
 * - Validation Registry is deprecated and not created by default (see note below)
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
 *     value: 90,
 *     valueDecimals: 0,
 *     tag1: "reliable",
 *     tag2: "fast",
 *     endpoint: "https://agent.example.com",
 *   });
 * }
 * ```
 *
 * @note Validation Registry is under active development and will be revised in
 * a follow-up spec update later this year. It is not included in default client
 * creation. If you need it for backward compatibility, you can manually create
 * a ValidationRegistryClient using createValidationRegistryClient().
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
  validateIdentityConfig(options, options.env);

  const {
    runtime,
    walletHandle: explicitWalletHandle,
    domain,
    chainId,
    registryAddress,
    rpcUrl,
    trustModels = ['feedback', 'inference-validation'],
    trustOverrides,
    env,
    logger,
  } = options;

  // Prefer explicit walletHandle, then developer wallet, then agent wallet (for backward compatibility)
  const walletHandle =
    explicitWalletHandle ??
    runtime?.wallets?.developer ??
    runtime?.wallets?.agent;

  if (!walletHandle) {
    throw new Error(
      'Either walletHandle or runtime.wallets.developer is required for identity operations. ' +
        'Provide walletHandle directly or configure runtime.wallets.developer in the runtime config.'
    );
  }

  const autoRegister = resolveAutoRegister(options, env);

  const viemFactory = await makeViemClientsFromWallet({
    env,
    rpcUrl,
    walletHandle,
  });

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
    domain ??
    (typeof env === 'object' && env?.AGENT_DOMAIN
      ? env.AGENT_DOMAIN
      : typeof process !== 'undefined' && process.env?.AGENT_DOMAIN
        ? process.env.AGENT_DOMAIN
        : undefined);

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

      const vClients:
        | {
            publicClient?: PublicClientLike;
            walletClient?: WalletClientLike;
            signer?: WalletClientLike;
          }
        | null
        | undefined = await viemFactory({
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
            publicClient: vClients.publicClient,
            walletClient: vClients.walletClient,
          }),
          reputation: createReputationRegistryClient({
            address: registryAddresses.REPUTATION_REGISTRY,
            chainId: resolvedChainId,
            publicClient: vClients.publicClient,
            walletClient: vClients.walletClient,
            identityRegistryAddress: identityAddress,
          }),
          // Validation Registry is deprecated and not created by default
          // It is under active development and will be revised in a follow-up spec update
          // validation: createValidationRegistryClient({ ... }),
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
    const registration = generateAgentRegistration(identity, options.registration);

    log.info?.('\nHost this registration file at your domain:');
    log.info?.(
      `   https://${identity.domain}/.well-known/agent-registration.json\n`
    );
    log.info?.(JSON.stringify(registration, null, 2));
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
 * Generate agent registration JSON for hosting at /.well-known/agent-registration.json
 *
 * @example
 * ```ts
 * const identity = await createAgentIdentity({ autoRegister: true });
 * const registration = generateAgentRegistration(identity, {
 *   name: "My Agent",
 *   description: "An intelligent assistant",
 *   image: "https://your-domain/og.png",
 *   services: [
 *     {
 *       id: "a2a",
 *       type: "a2a",
 *       serviceEndpoint: "https://your-domain/.well-known/agent-card.json"
 *     }
 *   ]
 * });
 * // Host this JSON at https://your-domain/.well-known/agent-registration.json
 * ```
 */
export function generateAgentRegistration(
  identity: AgentIdentity,
  options?: AgentRegistrationOptions
) {
  const registration: AgentRegistration = {
    type: 'agent',
    name: options?.name || 'Agent',
    description: options?.description || 'An AI agent',
    domain: identity.domain,
  };

  if (options?.image) {
    registration.image = options.image;
  }

  if (options?.url) {
    registration.url = options.url;
  }

  if (options?.services && options.services.length > 0) {
    registration.services = options.services;
  }

  if (options?.x402Support !== undefined) {
    registration.x402Support = options.x402Support;
  }

  if (options?.active !== undefined) {
    registration.active = options.active;
  }

  if (identity.record?.owner) {
    registration.owner = identity.record.owner;
  }

  const registrations = options?.registrations ?? identity.trust?.registrations;
  if (registrations && registrations.length > 0) {
    registration.registrations = registrations;
  }

  const supportedTrust = options?.supportedTrust ?? identity.trust?.trustModels;
  if (supportedTrust && supportedTrust.length > 0) {
    registration.supportedTrust = supportedTrust;
  }

  return registration;
}

/**
 * @deprecated Use generateAgentRegistration instead.
 */
export function generateAgentMetadata(
  identity: AgentIdentity,
  options?: {
    name?: string;
    description?: string;
    capabilities?: Array<{ name: string; description: string }>;
  }
) {
  return generateAgentRegistration(identity, {
    name: options?.name,
    description: options?.description,
  });
}
