/**
 * Simplified initialization helpers for agent identity.
 * These functions provide a streamlined API for common use cases.
 */

import type { AgentRuntime } from '@lucid-agents/types/core';
import type {
  AgentRegistration,
  AgentService,
  OASFRecord,
  OASFStructuredConfig,
  TrustConfig,
} from '@lucid-agents/types/identity';
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

const REGISTRATION_TYPE_V1 =
  'https://eips.ethereum.org/EIPS/eip-8004#registration-v1' as const;
const DEFAULT_A2A_VERSION = '0.3.0';
const DEFAULT_OASF_VERSION = '0.8.0';
const DEFAULT_OASF_RECORD_PATH = '/.well-known/oasf-record.json';

export type RegistrationServiceName =
  | 'A2A'
  | 'web'
  | 'OASF'
  | 'twitter'
  | 'email';

export type OASFServiceInput = OASFStructuredConfig;

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
  type?: AgentRegistration['type'];
  name?: string;
  description?: string;
  image?: string;
  url?: string;
  services?: AgentService[];
  selectedServices?: RegistrationServiceName[];
  a2aEndpoint?: string;
  a2aVersion?: string;
  website?: string;
  twitter?: string;
  email?: string;
  oasf?: string | OASFServiceInput;
  oasfVersion?: string;
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
   * Custom agent URI to use for registration.
   * If not provided, defaults to `https://{domain}/.well-known/agent-registration.json`
   * Example: `https://api.example.com/agents/ag_xxx/.well-known/agent-card.json`
   */
  agentURI?: string;

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

  /**
   * Optional generated registration document from provided registration options.
   */
  registration?: AgentRegistration;

  /**
   * Optional generated OASF record when OASF is enabled in registration.
   */
  oasfRecord?: OASFRecord;
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
    registration: registrationOptions,
    agentURI,
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
    agentURI,
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

  if (registrationOptions) {
    identity.registration = generateAgentRegistration(
      identity,
      registrationOptions
    );
    identity.oasfRecord = generateOASFRecord(
      identity,
      registrationOptions,
      runtime
    );
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

function sanitizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function resolveDomainOrigin(domain: string | undefined): string | undefined {
  const normalized = sanitizeString(domain);
  if (!normalized) return undefined;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized.replace(/\/+$/, '');
  }
  return `https://${normalized}`.replace(/\/+$/, '');
}

function normalizeTwitterEndpoint(
  twitter: string | undefined
): string | undefined {
  const normalized = sanitizeString(twitter);
  if (!normalized) return undefined;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized;
  }
  const handle = normalized.replace(/^@+/, '');
  return handle ? `https://x.com/${handle}` : undefined;
}

function normalizeServiceInput(
  service: AgentService
): AgentService | undefined {
  const name = sanitizeString(
    service.name ?? service.type ?? service.id ?? undefined
  );
  const endpoint = sanitizeString(
    service.endpoint ?? service.serviceEndpoint ?? undefined
  );

  if (!name || !endpoint) {
    return undefined;
  }

  const normalized: AgentService = {
    ...service,
    name,
    endpoint,
  };

  delete (normalized as { id?: string }).id;
  delete (normalized as { type?: string }).type;
  delete (normalized as { serviceEndpoint?: string }).serviceEndpoint;

  return normalized;
}

function createService(
  name: string,
  endpoint: string,
  extras?: Partial<AgentService>
): AgentService {
  return {
    name,
    endpoint,
    ...(extras ?? {}),
  };
}

function shouldIncludeService(
  selected: Set<string> | undefined,
  name: RegistrationServiceName,
  hasExplicitValue: boolean,
  includeByDefault: boolean
): boolean {
  if (selected) {
    return selected.has(name.toLowerCase());
  }

  if (hasExplicitValue) {
    return true;
  }

  return includeByDefault;
}

function buildRegistrationServices(
  identity: AgentIdentity,
  options?: AgentRegistrationOptions
): AgentService[] | undefined {
  const serviceMap = new Map<string, AgentService>();
  const selected =
    options?.selectedServices && options.selectedServices.length > 0
      ? new Set(options.selectedServices.map(name => name.toLowerCase()))
      : undefined;
  const origin = resolveDomainOrigin(identity.domain);

  const a2aEndpoint =
    sanitizeString(options?.a2aEndpoint) ??
    (origin ? `${origin}/.well-known/agent-card.json` : undefined);
  if (
    a2aEndpoint &&
    shouldIncludeService(selected, 'A2A', Boolean(options?.a2aEndpoint), true)
  ) {
    serviceMap.set(
      'a2a',
      createService('A2A', a2aEndpoint, {
        version: options?.a2aVersion ?? DEFAULT_A2A_VERSION,
      })
    );
  }

  const websiteEndpoint =
    sanitizeString(options?.website) ?? (origin ? `${origin}/` : undefined);
  if (
    websiteEndpoint &&
    shouldIncludeService(selected, 'web', Boolean(options?.website), true)
  ) {
    serviceMap.set('web', createService('web', websiteEndpoint));
  }

  const twitterEndpoint = normalizeTwitterEndpoint(options?.twitter);
  if (
    twitterEndpoint &&
    shouldIncludeService(
      selected,
      'twitter',
      Boolean(sanitizeString(options?.twitter)),
      false
    )
  ) {
    serviceMap.set('twitter', createService('twitter', twitterEndpoint));
  }

  const emailEndpoint = sanitizeString(options?.email);
  if (
    emailEndpoint &&
    shouldIncludeService(selected, 'email', Boolean(options?.email), false)
  ) {
    serviceMap.set('email', createService('email', emailEndpoint));
  }

  const rawOasfEndpoint =
    typeof options?.oasf === 'string' ? options.oasf : options?.oasf?.endpoint;
  const oasfEndpoint =
    sanitizeString(rawOasfEndpoint) ??
    (origin ? `${origin}${DEFAULT_OASF_RECORD_PATH}` : undefined);
  if (
    oasfEndpoint &&
    shouldIncludeService(
      selected,
      'OASF',
      Boolean(sanitizeString(rawOasfEndpoint)),
      false
    )
  ) {
    const oasfInput =
      typeof options?.oasf === 'object' ? options.oasf : undefined;
    const oasfService = createService('OASF', oasfEndpoint, {
      version:
        oasfInput?.version ?? options?.oasfVersion ?? DEFAULT_OASF_VERSION,
    });
    if (Array.isArray(oasfInput?.skills) && oasfInput.skills.length > 0) {
      oasfService.skills = oasfInput.skills;
    }
    if (Array.isArray(oasfInput?.domains) && oasfInput.domains.length > 0) {
      oasfService.domains = oasfInput.domains;
    }
    serviceMap.set('oasf', oasfService);
  }

  for (const service of options?.services ?? []) {
    const normalized = normalizeServiceInput(service);
    if (!normalized) continue;
    serviceMap.set(normalized.name.toLowerCase(), normalized);
  }

  const services = Array.from(serviceMap.values());
  return services.length > 0 ? services : undefined;
}

function hasSelectedService(
  selectedServices: RegistrationServiceName[] | undefined,
  serviceName: RegistrationServiceName
): boolean {
  if (!Array.isArray(selectedServices)) {
    return false;
  }

  return selectedServices.some(
    service => service.toLowerCase() === serviceName.toLowerCase()
  );
}

function normalizeStringArray(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function resolveOASFInput(
  options?: AgentRegistrationOptions
): OASFStructuredConfig {
  if (typeof options?.oasf === 'string') {
    return {
      endpoint: sanitizeString(options.oasf),
      version: sanitizeString(options.oasfVersion),
      authors: [],
      skills: [],
      domains: [],
      modules: [],
      locators: [],
    };
  }

  return {
    endpoint: sanitizeString(options?.oasf?.endpoint),
    version:
      sanitizeString(options?.oasf?.version) ??
      sanitizeString(options?.oasfVersion),
    authors: normalizeStringArray(options?.oasf?.authors),
    skills: normalizeStringArray(options?.oasf?.skills),
    domains: normalizeStringArray(options?.oasf?.domains),
    modules: normalizeStringArray(options?.oasf?.modules),
    locators: normalizeStringArray(options?.oasf?.locators),
  };
}

export function generateOASFRecord(
  identity: AgentIdentity,
  options: AgentRegistrationOptions | undefined,
  runtime?: AgentRuntime
): OASFRecord | undefined {
  const includeOASF =
    hasSelectedService(options?.selectedServices, 'OASF') ||
    Boolean(options?.oasf);

  if (!includeOASF) {
    return undefined;
  }

  const origin = resolveDomainOrigin(identity.domain);
  const oasfInput = resolveOASFInput(options);
  const endpoint =
    oasfInput.endpoint ??
    (origin
      ? `${origin}${DEFAULT_OASF_RECORD_PATH}`
      : DEFAULT_OASF_RECORD_PATH);
  const version = oasfInput.version ?? DEFAULT_OASF_VERSION;
  const entrypoints = runtime?.entrypoints.snapshot() ?? [];
  const derivedSkills = entrypoints.map(entry => entry.key);

  return {
    type: 'https://docs.agntcy.org/oasf/oasf-server/',
    name: options?.name ?? 'Agent',
    description: options?.description ?? 'An AI agent',
    version,
    endpoint,
    authors: oasfInput.authors ?? [],
    skills:
      oasfInput.skills && oasfInput.skills.length > 0
        ? oasfInput.skills
        : derivedSkills,
    domains: oasfInput.domains ?? [],
    modules: oasfInput.modules ?? [],
    locators: oasfInput.locators ?? [],
    entrypoints: entrypoints.map(entry => ({
      key: entry.key,
      description: entry.description,
      streaming: Boolean(entry.stream ?? entry.streaming),
      input: entry.input,
      output: entry.output,
    })),
  };
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
    type: options?.type ?? REGISTRATION_TYPE_V1,
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

  const services = buildRegistrationServices(identity, options);
  if (services) {
    registration.services = services;
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
