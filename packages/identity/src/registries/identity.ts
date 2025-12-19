import type {
  RegistrationEntry,
  TrustConfig,
} from '@lucid-agents/types/identity';
import type {
  AgentWalletHandle,
  DeveloperWalletHandle,
  LocalEoaSigner,
} from '@lucid-agents/types/wallets';
import type { Hex } from '@lucid-agents/wallet';
import { normalizeAddress, toCaip10, ZERO_ADDRESS } from '@lucid-agents/wallet';

import { normalizeDomain } from '../utils';
import { signDomainProof } from './signatures';
import { waitForConfirmation } from './utils';

export { toCaip10 } from '@lucid-agents/wallet';

import type {
  IdentityRegistryReadFunctionName,
  IdentityRegistryWriteFunctionName,
} from '../abi/types';
import { IDENTITY_REGISTRY_ABI } from '../abi/types';
import { DEFAULT_NAMESPACE, DEFAULT_TRUST_MODELS } from '../config';

export type IdentityRegistryClientOptions<
  PublicClient extends PublicClientLike,
  WalletClient extends WalletClientLike | undefined = undefined,
> = {
  address: Hex;
  chainId: number;
  publicClient: PublicClient;
  walletClient?: WalletClient;
  namespace?: string;
};

/**
 * Identity record for an ERC-8004 agent
 * In v1.0, agents are ERC-721 NFTs with metadata stored off-chain
 */
export type IdentityRecord = {
  agentId: bigint;
  owner: Hex;
  tokenURI: string;
};

type AgentIdentifierInput = bigint | number | string;

type RegistrationEntryParams = {
  agentId: AgentIdentifierInput;
  address: string;
  chainId: number | string;
  namespace?: string;
  signature?: string;
  tokenURI?: string;
  agentRegistry?: Hex;
};

type TrustOverridesInput = Partial<
  Pick<
    TrustConfig,
    | 'trustModels'
    | 'validationRequestsUri'
    | 'validationResponsesUri'
    | 'feedbackDataUri'
  >
>;

function normalizeAgentId(agentId: AgentIdentifierInput): string {
  if (typeof agentId === 'bigint') {
    if (agentId < 0n) {
      throw new Error('agentId must be non-negative');
    }
    return agentId.toString(10);
  }
  if (typeof agentId === 'number') {
    if (
      !Number.isFinite(agentId) ||
      !Number.isInteger(agentId) ||
      agentId < 0
    ) {
      throw new Error('agentId must be a non-negative integer');
    }
    if (!Number.isSafeInteger(agentId)) {
      throw new Error(
        'agentId number must be a safe integer; use string or bigint for larger values'
      );
    }
    return agentId.toString(10);
  }
  const normalized = `${agentId ?? ''}`.trim();
  if (!normalized) {
    throw new Error('agentId is required');
  }
  return normalized;
}

function createRegistrationEntry(
  params: RegistrationEntryParams
): RegistrationEntry {
  const entry: RegistrationEntry = {
    agentId: normalizeAgentId(params.agentId),
    agentAddress: toCaip10({
      namespace: params.namespace,
      chainId: params.chainId,
      address: params.address,
    }),
  };
  if (params.signature) {
    entry.signature = params.signature;
  }
  if (params.tokenURI) {
    entry.tokenURI = params.tokenURI;
  }
  if (params.agentRegistry) {
    entry.agentRegistry = params.agentRegistry;
  }
  return entry;
}

function createTrustConfig(
  params: RegistrationEntryParams,
  overrides?: TrustOverridesInput
): TrustConfig {
  return {
    registrations: [createRegistrationEntry(params)],
    ...overrides,
  };
}

export type IdentityRegistryClient = {
  readonly address: Hex;
  readonly chainId: number;

  get(agentId: bigint | number | string): Promise<IdentityRecord | null>;
  getMetadata(
    agentId: bigint | number | string,
    key: string
  ): Promise<Uint8Array | null>;
  register(input: RegisterAgentInput): Promise<RegisterAgentResult>;
  setMetadata(
    agentId: bigint | number | string,
    key: string,
    value: Uint8Array
  ): Promise<Hex>;
  toRegistrationEntry(
    record: IdentityRecord,
    signature?: string
  ): RegistrationEntry;
};

export type PublicClientLike = {
  readContract(args: {
    address: Hex;
    abi: typeof IDENTITY_REGISTRY_ABI;
    functionName: IdentityRegistryReadFunctionName;
    args?: readonly unknown[];
  }): Promise<any>;
};

export type WalletClientLike = {
  account?: { address?: Hex };
  writeContract(args: {
    address: Hex;
    abi: typeof IDENTITY_REGISTRY_ABI;
    functionName: IdentityRegistryWriteFunctionName;
    args?: readonly unknown[];
  }): Promise<Hex>;
};

export type RegisterAgentInput = {
  tokenURI: string;
  metadata?: Array<{ key: string; value: Uint8Array }>;
};

export type RegisterAgentResult = {
  transactionHash: Hex;
  agentAddress: Hex;
  agentId?: bigint;
};

export function createIdentityRegistryClient<
  PublicClient extends PublicClientLike,
  WalletClient extends WalletClientLike | undefined = undefined,
>(
  options: IdentityRegistryClientOptions<PublicClient, WalletClient>
): IdentityRegistryClient {
  const {
    address,
    chainId,
    publicClient,
    walletClient,
    namespace = 'eip155',
  } = options;

  async function get(
    agentId: bigint | number | string
  ): Promise<IdentityRecord | null> {
    const id = BigInt(agentId);

    let owner: string;
    try {
      owner = (await publicClient.readContract({
        address,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'ownerOf',
        args: [id],
      })) as string;
    } catch {
      return null;
    }

    const uri = (await publicClient.readContract({
      address,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'tokenURI',
      args: [id],
    })) as string;

    return {
      agentId: id,
      owner: normalizeAddress(owner),
      tokenURI: uri,
    };
  }

  async function getMetadata(
    agentId: bigint | number | string,
    key: string
  ): Promise<Uint8Array | null> {
    const id = BigInt(agentId);

    try {
      const metadata = (await publicClient.readContract({
        address,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'getMetadata',
        args: [id, key],
      })) as Hex;

      if (!metadata || metadata === '0x') {
        return null;
      }

      const hexWithoutPrefix = metadata.slice(2);
      const bytes = new Uint8Array(hexWithoutPrefix.length / 2);
      for (let i = 0; i < hexWithoutPrefix.length; i += 2) {
        bytes[i / 2] = parseInt(hexWithoutPrefix.slice(i, i + 2), 16);
      }

      return bytes;
    } catch {
      return null;
    }
  }

  async function register(
    input: RegisterAgentInput
  ): Promise<RegisterAgentResult> {
    if (!walletClient) {
      throw new Error('Wallet client required for register');
    }
    if (!input.tokenURI) {
      throw new Error('tokenURI is required');
    }

    if (!walletClient.account?.address) {
      throw new Error('wallet account address is required');
    }

    const agentAddress = normalizeAddress(walletClient.account.address);

    const args = input.metadata
      ? [input.tokenURI, input.metadata]
      : [input.tokenURI];

    const txHash = await walletClient.writeContract({
      address,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args,
    });

    // Wait for transaction and get receipt to parse agentId from Registered event
    let agentId: bigint | undefined;
    try {
      const receipt = await waitForConfirmation(publicClient, txHash);

      const REGISTERED_EVENT_SIGNATURE =
        '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a';

      // topics[0] = event signature hash
      // topics[1] = agentId (indexed uint256)
      // topics[2] = owner (indexed address)
      if (receipt?.logs) {
        for (const log of receipt.logs) {
          if (
            log.address.toLowerCase() === address.toLowerCase() &&
            log.topics[0] === REGISTERED_EVENT_SIGNATURE &&
            log.topics.length >= 2
          ) {
            agentId = BigInt(log.topics[1]);
            break;
          }
        }
      }
    } catch (error) {
      agentId = undefined;
    }

    return {
      transactionHash: txHash,
      agentAddress,
      agentId,
    };
  }

  async function setMetadata(
    agentId: bigint | number | string,
    key: string,
    value: Uint8Array
  ): Promise<Hex> {
    if (!walletClient) {
      throw new Error('Wallet client required for setMetadata');
    }

    const id = BigInt(agentId);

    // Convert Uint8Array to hex string if needed (viem expects hex for bytes type)
    let bytesValue: `0x${string}` | Uint8Array = value;
    if (value instanceof Uint8Array) {
      bytesValue = `0x${Array.from(value)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')}` as `0x${string}`;
    }

    const txHash = await walletClient.writeContract({
      address,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'setMetadata',
      args: [id, key, bytesValue],
    });

    await waitForConfirmation(publicClient, txHash);

    return txHash;
  }

  function toRegistrationEntry(
    record: IdentityRecord,
    signature?: string
  ): RegistrationEntry {
    return createRegistrationEntry({
      agentId: record.agentId,
      address: record.owner,
      chainId,
      namespace,
      signature,
      tokenURI: record.tokenURI,
      agentRegistry: address,
    });
  }

  return {
    address,
    chainId,
    get,
    getMetadata,
    register,
    setMetadata,
    toRegistrationEntry,
  };
}

export type SignAgentDomainProofOptions = {
  domain: string;
  address: Hex;
  chainId: number;
  signer: MessageSignerLike;
  nonce?: string;
};

export type MessageSignerLike = WalletClientLike;

export async function signAgentDomainProof(
  options: SignAgentDomainProofOptions
): Promise<string> {
  const { domain, address, chainId, nonce, signer } = options;
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) throw new Error('domain is required');
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress || normalizedAddress === ZERO_ADDRESS) {
    throw new Error('address must be a valid hex address');
  }

  return signDomainProof(signer as any, {
    domain: normalizedDomain,
    address: normalizedAddress,
    chainId,
    nonce,
  });
}

export function buildTrustConfigFromIdentity(
  record: IdentityRecord,
  options?: {
    signature?: string;
    chainId: number | string;
    namespace?: string;
    trustOverrides?: TrustOverridesInput;
  }
): TrustConfig {
  const chainRef = options?.chainId;
  if (chainRef == null) {
    throw new Error(
      'chainId is required to generate trust config registration entry'
    );
  }

  return createTrustConfig(
    {
      agentId: record.agentId,
      address: record.owner,
      chainId: chainRef,
      namespace: options?.namespace,
      signature: options?.signature,
    },
    options?.trustOverrides
  );
}

// Helper functions moved to signatures.ts for better organization

export type BootstrapTrustMissingContext = {
  client: IdentityRegistryClient;
  normalizedDomain: string;
};

export type BootstrapTrustOptions = {
  domain: string;
  chainId: number;
  registryAddress: Hex;
  publicClient: PublicClientLike;
  walletClient?: WalletClientLike;
  namespace?: string;
  signer?: MessageSignerLike;
  signatureNonce?: string;
  registerIfMissing?: boolean;
  skipRegister?: boolean;
  trustOverrides?: TrustOverridesInput;
  onMissing?: (
    context: BootstrapTrustMissingContext
  ) =>
    | Promise<IdentityRecord | null | undefined>
    | IdentityRecord
    | null
    | undefined;
};

export type BootstrapTrustResult = {
  trust?: TrustConfig;
  record?: IdentityRecord | null;
  transactionHash?: Hex;
  signature?: string;
  didRegister?: boolean;
};

/**
 * Constructs the metadata URI for an agent's domain
 * Points to /.well-known/agent-metadata.json
 */
export function buildMetadataURI(domain: string): string {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    throw new Error('domain is required');
  }

  // If domain already has protocol, use it; otherwise assume https
  const origin = normalized.startsWith('http')
    ? normalized
    : `https://${normalized}`;

  return `${origin}/.well-known/agent-metadata.json`;
}

export async function bootstrapTrust(
  options: BootstrapTrustOptions
): Promise<BootstrapTrustResult> {
  const normalizedDomain = normalizeDomain(options.domain);
  if (!normalizedDomain) {
    throw new Error('domain is required to bootstrap trust state');
  }

  const shouldRegister = Boolean(
    options.registerIfMissing && !options.skipRegister
  );

  const client = createIdentityRegistryClient({
    address: options.registryAddress,
    chainId: options.chainId,
    publicClient: options.publicClient,
    walletClient: options.walletClient,
    namespace: options.namespace,
  });

  let record: IdentityRecord | null = null;
  let transactionHash: Hex | undefined;
  let didRegister = false;

  if (options.onMissing) {
    const handled = await options.onMissing({
      client,
      normalizedDomain,
    });
    if (handled) {
      record = handled;
    }
  }

  if (!record && shouldRegister) {
    const tokenURI = buildMetadataURI(normalizedDomain);
    const registration = await client.register({ tokenURI });
    transactionHash = registration.transactionHash;
    didRegister = true;

    if (registration.agentId != null) {
      record = {
        agentId: registration.agentId,
        owner: registration.agentAddress,
        tokenURI,
      } satisfies IdentityRecord;
    }
  }

  if (!record) {
    return {
      trust: undefined,
      record: null,
      transactionHash,
      didRegister,
    };
  }

  let signature: string | undefined;
  if (options.signer) {
    try {
      signature = await signAgentDomainProof({
        domain: normalizedDomain,
        address: record.owner,
        chainId: options.chainId,
        signer: options.signer,
        nonce: options.signatureNonce,
      });
      // Debug: Confirm signature was generated
      if (signature) {
        defaultLogger.info?.(
          `[agent-kit-identity] Generated domain proof signature: ${signature.slice(
            0,
            10
          )}...`
        );
      }
    } catch (error) {
      defaultLogger.warn?.(
        '[agent-kit-identity] Failed to generate domain proof signature',
        error
      );
    }
  } else {
    defaultLogger.info?.(
      '[agent-kit-identity] No signer provided - skipping domain proof signature'
    );
  }

  const trust = buildTrustConfigFromIdentity(record, {
    chainId: options.chainId,
    namespace: options.namespace,
    signature,
    trustOverrides: options.trustOverrides,
  });

  return {
    trust,
    record,
    transactionHash,
    signature,
    didRegister,
  } satisfies BootstrapTrustResult;
}

const defaultLogger = {
  info:
    typeof console !== 'undefined' && typeof console.info === 'function'
      ? console.info.bind(console)
      : () => {},
  warn:
    typeof console !== 'undefined' && typeof console.warn === 'function'
      ? console.warn.bind(console)
      : () => {},
};

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.trunc(parsed);
}

function resolveTrustOverrides(
  domain: string | undefined,
  overrides?: TrustOverridesInput,
  fallback?: TrustOverridesInput
): TrustOverridesInput | undefined {
  const result: TrustOverridesInput = {};

  if (domain) {
    result.trustModels = [...DEFAULT_TRUST_MODELS]; // Copy to avoid readonly issues
    const origin = domain.startsWith('http') ? domain : `https://${domain}`;
    result.validationRequestsUri = `${origin}/validation/requests.json`;
    result.validationResponsesUri = `${origin}/validation/responses.json`;
    result.feedbackDataUri = `${origin}/feedback.json`;
  }

  if (fallback) {
    if (fallback.trustModels !== undefined) {
      result.trustModels = fallback.trustModels;
    }
    if (fallback.validationRequestsUri !== undefined) {
      result.validationRequestsUri = fallback.validationRequestsUri;
    }
    if (fallback.validationResponsesUri !== undefined) {
      result.validationResponsesUri = fallback.validationResponsesUri;
    }
    if (fallback.feedbackDataUri !== undefined) {
      result.feedbackDataUri = fallback.feedbackDataUri;
    }
  }

  if (overrides) {
    if (overrides.trustModels !== undefined) {
      result.trustModels = overrides.trustModels;
    }
    if (overrides.validationRequestsUri !== undefined) {
      result.validationRequestsUri = overrides.validationRequestsUri;
    }
    if (overrides.validationResponsesUri !== undefined) {
      result.validationResponsesUri = overrides.validationResponsesUri;
    }
    if (overrides.feedbackDataUri !== undefined) {
      result.feedbackDataUri = overrides.feedbackDataUri;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

type InferLogger = {
  info?(message: string): void;
  warn?(message: string, error?: unknown): void;
};

export type BootstrapIdentityClients = {
  publicClient: PublicClientLike;
  walletClient?: WalletClientLike;
  signer?: MessageSignerLike;
};

export type BootstrapIdentityClientFactory = (params: {
  chainId: number;
  rpcUrl: string;
  env: Record<string, string | undefined>;
}) =>
  | BootstrapIdentityClients
  | null
  | undefined
  | Promise<BootstrapIdentityClients | null | undefined>;

export type BootstrapIdentityOptions = {
  domain?: string;
  chainId?: number;
  registryAddress?: Hex;
  namespace?: string;
  publicClient?: PublicClientLike;
  walletClient?: WalletClientLike;
  signer?: MessageSignerLike;
  rpcUrl?: string;
  makeClients?: BootstrapIdentityClientFactory;
  registerIfMissing?: boolean;
  skipRegister?: boolean;
  signatureNonce?: string;
  trustOverrides?: TrustOverridesInput;
  env?: Record<string, string | undefined>;
  logger?: InferLogger;
};

export type BootstrapIdentityResult = BootstrapTrustResult & {
  synthetic?: boolean;
};

export async function bootstrapIdentity(
  options: BootstrapIdentityOptions = {}
): Promise<BootstrapIdentityResult> {
  const env =
    options.env ??
    (typeof process !== 'undefined' && typeof process.env === 'object'
      ? (process.env as Record<string, string | undefined>)
      : {});

  const logger = {
    info: options.logger?.info ?? defaultLogger.info,
    warn: options.logger?.warn ?? defaultLogger.warn,
  } satisfies InferLogger;

  // Resolve chainId - required, no defaults
  const resolvedChainId = options.chainId ?? parsePositiveInteger(env.CHAIN_ID);

  if (!resolvedChainId) {
    throw new Error(
      '[agent-kit-identity] CHAIN_ID is required for bootstrap. Provide it via chainId parameter or CHAIN_ID environment variable.'
    );
  }

  const domain = options.domain ?? env.AGENT_DOMAIN;
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;
  const registryAddress =
    options.registryAddress ??
    (env.IDENTITY_REGISTRY_ADDRESS as Hex | undefined);
  const rpcUrl = options.rpcUrl ?? env.RPC_URL;

  let publicClient = options.publicClient;
  let walletClient = options.walletClient;
  let signer = options.signer;

  if (!publicClient && options.makeClients && rpcUrl) {
    const produced = await options.makeClients({
      chainId: resolvedChainId,
      rpcUrl,
      env,
    });
    if (produced?.publicClient) {
      publicClient = produced.publicClient;
      walletClient = walletClient ?? produced.walletClient;
      signer = signer ?? produced.signer ?? (produced.walletClient as any);
    }
  }

  if (!signer && walletClient) {
    signer = walletClient as any;
  }

  const resolvedOverrides = resolveTrustOverrides(
    domain,
    options.trustOverrides,
    undefined
  );

  if (domain && registryAddress && publicClient) {
    try {
      const result = await bootstrapTrust({
        domain,
        chainId: resolvedChainId,
        registryAddress,
        namespace,
        publicClient,
        walletClient,
        signer,
        signatureNonce: options.signatureNonce ?? env.IDENTITY_SIGNATURE_NONCE,
        registerIfMissing:
          options.registerIfMissing ?? env.REGISTER_IDENTITY === 'true',
        skipRegister: options.skipRegister,
        trustOverrides: resolvedOverrides,
      });

      if (result.trust || result.didRegister || result.transactionHash) {
        return result;
      }

      logger.warn(
        '[agent-kit-identity] identity not found in registry and registration not enabled'
      );
    } catch (error) {
      logger.warn(
        '[agent-kit-identity] failed to bootstrap ERC-8004 identity',
        error
      );
    }
  }

  logger.info('[agent-kit-identity] agent will run without ERC-8004 identity');

  return {};
}

export type MakeViemClientsFromWalletOptions = {
  env?: Record<string, string | undefined>;
  rpcUrl?: string;
  walletHandle: AgentWalletHandle | DeveloperWalletHandle;
};

export type MakeViemClientsFromEnvOptions = {
  env?: Record<string, string | undefined>;
  rpcUrl?: string;
};

async function importViemModules(): Promise<{
  createPublicClient: (...args: any[]) => any;
  createWalletClient: (...args: any[]) => any;
  http: (url: string) => any;
  privateKeyToAccount: (key: `0x${string}`) => any;
  getChainById: (
    chainId: number
  ) => ({ id: number } & Record<string, unknown>) | null;
} | null> {
  try {
    const viem = await import('viem');
    const accounts = await import('viem/accounts');
    const chains = await import('viem/chains').catch(() => ({}));

    // Helper to find a chain definition by chainId from viem's chains
    const getChainById = (chainId: number) => {
      if (!chains || typeof chains !== 'object') {
        return null;
      }
      // Try to find a chain that matches the chainId
      // viem exports chains as named exports, so we iterate through them
      for (const key in chains) {
        const chain = (chains as any)[key];
        if (chain && typeof chain === 'object' && chain.id === chainId) {
          return chain;
        }
      }
      return null;
    };

    return {
      createPublicClient: (viem as any).createPublicClient,
      createWalletClient: (viem as any).createWalletClient,
      http: (viem as any).http,
      privateKeyToAccount: (accounts as any).privateKeyToAccount,
      getChainById,
    };
  } catch (error) {
    defaultLogger.warn(
      '[agent-kit] viem helpers unavailable; install viem to use viem clients',
      error
    );
    return null;
  }
}

function resolveEnvObject(
  env?: Record<string, string | undefined>
): Record<string, string | undefined> {
  if (env) return env;
  if (typeof process !== 'undefined' && typeof process.env === 'object') {
    return process.env as Record<string, string | undefined>;
  }
  return {};
}

/**
 * Create viem clients from a wallet handle.
 * For local wallets, this creates a wallet client that can write contracts.
 * For server orchestrator wallets, contract writes are not supported (returns undefined walletClient).
 */
export async function makeViemClientsFromWallet(
  options: MakeViemClientsFromWalletOptions
): Promise<BootstrapIdentityClientFactory | undefined> {
  const env = resolveEnvObject(options.env);
  const modules = await importViemModules();
  if (!modules) return undefined;

  const walletHandle = options.walletHandle;
  const connector = walletHandle.connector;

  return async ({ chainId, rpcUrl, env: runtimeEnv }) => {
    const effectiveRpcUrl = options.rpcUrl ?? rpcUrl ?? env.RPC_URL;
    if (!effectiveRpcUrl) {
      defaultLogger.warn(
        '[agent-kit] RPC_URL missing for viem client factory; skipping'
      );
      return null;
    }

    const transport = modules.http(effectiveRpcUrl);
    // Get chain definition from viem if available, but ensure we use our RPC URL
    // Override any RPC URLs in the chain definition with our explicit transport
    const chainTemplate = modules.getChainById(chainId);
    const chain = chainTemplate
      ? { ...chainTemplate, id: chainId }
      : { id: chainId };
    const publicClient = modules.createPublicClient({ chain, transport });

    // For local wallets, try to extract the signer to create a wallet client
    // For server orchestrator wallets, we can't create a wallet client for contract writes
    let walletClient: any = undefined;
    let signer: any = undefined;

    if (walletHandle.kind === 'local') {
      // For local wallets, try to access the signer from the connector
      // This is a type assertion because the signer is private
      const localConnector = connector as any;
      const localSigner = localConnector.signer as LocalEoaSigner | undefined;

      if (localSigner) {
        // Create a viem account wrapper that uses the connector's signer
        // For contract writes, we need a full viem account, so we'll create a wrapper
        try {
          // Get address from wallet metadata
          const metadata = await connector.getWalletMetadata();
          const address = metadata?.address;

          if (address) {
            // Create a viem account wrapper that uses the signer's methods directly
            // Use signer's methods if available, otherwise fall back to challenge-based signing
            const accountLike: any = {
              address: address as `0x${string}`,
              type: 'local',
              async signMessage({ message }: { message: string | Uint8Array }) {
                // Use the signer's signMessage directly if available
                if (localSigner.signMessage) {
                  return await localSigner.signMessage(message);
                }
                // Fallback to challenge-based signing
                const payloadStr =
                  typeof message === 'string'
                    ? message
                    : `0x${Array.from(message)
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('')}`;
                const challenge = {
                  id:
                    typeof crypto?.randomUUID === 'function'
                      ? crypto.randomUUID()
                      : globalThis?.crypto?.randomUUID
                        ? globalThis.crypto.randomUUID()
                        : `${Date.now()}-${Math.random()}`,
                  nonce: `${Date.now()}-${Math.random()}`,
                  issued_at: new Date().toISOString(),
                  expires_at: new Date(Date.now() + 3600000).toISOString(),
                  payload: payloadStr,
                  scopes: ['wallet.sign'],
                };
                return await connector.signChallenge(challenge);
              },
              async signTypedData(params: any) {
                // Use the signer's signTypedData directly if available
                if (localSigner.signTypedData) {
                  const typedPayload = {
                    domain: params.domain,
                    types: params.types,
                    message: params.message,
                    primaryType: params.primaryType,
                  };
                  return await localSigner.signTypedData(typedPayload);
                }
                // Fallback to challenge-based signing
                const challengePayload = {
                  typedData: {
                    domain: params.domain,
                    types: params.types,
                    message: params.message,
                    primaryType: params.primaryType,
                  },
                };
                const challenge = {
                  id:
                    typeof crypto?.randomUUID === 'function'
                      ? crypto.randomUUID()
                      : globalThis?.crypto?.randomUUID
                        ? globalThis.crypto.randomUUID()
                        : `${Date.now()}-${Math.random()}`,
                  nonce: `${Date.now()}-${Math.random()}`,
                  issued_at: new Date().toISOString(),
                  expires_at: new Date(Date.now() + 3600000).toISOString(),
                  payload: challengePayload,
                  scopes: ['wallet.sign'],
                };
                return await connector.signChallenge(challenge);
              },
              // For transaction signing (needed for contract writes)
              // Viem calls this when writeContract is used
              async signTransaction(transaction: any) {
                // Use the signer's signTransaction if available (e.g., from private key signer)
                if (localSigner.signTransaction) {
                  return await localSigner.signTransaction(transaction);
                }

                // Transaction signing is required for contract writes
                // If the signer doesn't support it, we can't proceed
                throw new Error(
                  '[agent-kit-identity] Contract writes (writeContract) require transaction signing support. The wallet signer must implement signTransaction(). Local wallets created from private keys support this automatically.'
                );
              },
            };

            // Try to create a wallet client with this account
            // Note: This may not fully support writeContract, but will support signing
            walletClient = modules.createWalletClient({
              chain,
              account: accountLike,
              transport,
            });
            signer = walletClient;
          }
        } catch (error) {
          defaultLogger.warn(
            '[agent-kit] failed to configure viem wallet client from wallet handle',
            error
          );
        }
      }
    }

    return {
      publicClient,
      walletClient,
      signer: signer ?? walletClient,
    } satisfies BootstrapIdentityClients;
  };
}

/**
 * @deprecated Use makeViemClientsFromWallet instead. This function is kept for backward compatibility but will be removed.
 */
export async function makeViemClientsFromEnv(
  options: MakeViemClientsFromEnvOptions = {}
): Promise<BootstrapIdentityClientFactory | undefined> {
  const env = resolveEnvObject(options.env);
  const modules = await importViemModules();
  if (!modules) return undefined;

  return ({ chainId, rpcUrl, env: runtimeEnv }) => {
    const effectiveRpcUrl = options.rpcUrl ?? rpcUrl ?? env.RPC_URL;
    if (!effectiveRpcUrl) {
      defaultLogger.warn(
        '[agent-kit] RPC_URL missing for viem client factory; skipping'
      );
      return null;
    }

    const transport = modules.http(effectiveRpcUrl);
    // Get chain definition from viem if available, but ensure we use our RPC URL
    // Override any RPC URLs in the chain definition with our explicit transport
    const chainTemplate = modules.getChainById(chainId);
    const chain = chainTemplate
      ? { ...chainTemplate, id: chainId }
      : { id: chainId };
    const publicClient = modules.createPublicClient({ chain, transport });

    // This function no longer creates wallet clients since privateKey is removed
    // It only creates a public client for reading contracts
    return {
      publicClient,
      walletClient: undefined,
      signer: undefined,
    } satisfies BootstrapIdentityClients;
  };
}
