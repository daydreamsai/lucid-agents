/**
 * Core initialization for Solana agent identity.
 * Mirrors @lucid-agents/identity createAgentIdentity() for Solana.
 */

import type { TrustConfig } from '@lucid-agents/types/identity';
import { SolanaSDK } from '8004-solana';

import { parseCluster, resolveRpcUrl } from './config';
import {
  createSolanaIdentityRegistryClient,
  type SolanaAgentRecord,
  type SolanaIdentityRegistryClient,
} from './registries/identity';
import {
  createSolanaReputationRegistryClient,
  type SolanaReputationRegistryClient,
} from './registries/reputation';
import { parseSolanaPrivateKey, resolveAutoRegister } from './validation';

export type SolanaRegistryClients = {
  identity: SolanaIdentityRegistryClient;
  reputation: SolanaReputationRegistryClient;
};

export type SolanaAgentRegistrationOptions = {
  name?: string;
  description?: string;
  image?: string;
  agentURI?: string;
  /** Skip sending the on-chain tx — useful for browser wallets */
  skipSend?: boolean;
};

export type CreateSolanaAgentIdentityOptions = {
  /** Solana private key as Uint8Array */
  privateKey?: Uint8Array;
  /** Cluster: mainnet-beta | devnet | testnet | localnet (default: mainnet-beta) */
  cluster?: string;
  /** Optional RPC URL override */
  rpcUrl?: string;
  /** Agent domain (e.g., "agent.example.com") */
  domain?: string;
  /** Whether to auto-register if not found. Defaults to true. */
  autoRegister?: boolean;
  /** Trust models to advertise */
  trustModels?: string[];
  /** Registration metadata */
  registration?: SolanaAgentRegistrationOptions;
  /**
   * Pre-resolved TrustConfig. When provided, bypasses auto-derivation from
   * trustModels and registration state — used directly as the identity trust.
   */
  trust?: TrustConfig;
  /** Custom env vars (defaults to process.env) */
  env?: Record<string, string | undefined>;
  /** Logger */
  logger?: {
    info?(msg: string): void;
    warn?(msg: string, err?: unknown): void;
  };
};

export type SolanaAgentIdentity = {
  status: string;
  trust?: TrustConfig;
  record?: SolanaAgentRecord;
  domain?: string;
  isNewRegistration?: boolean;
  didRegister?: boolean;
  transactionSignature?: string;
  /** Set when skipSend=true for browser wallet signing */
  unsignedTransaction?: Uint8Array;
  clients?: SolanaRegistryClients;
};

/**
 * Map a Solana registration result to a Lucid TrustConfig.
 * The tier value from on-chain reads is intentionally omitted here because
 * fresh registrations have no tier yet — callers should query it separately.
 */
export function mapTrustTierToConfig(
  agentId: string | bigint | number | null | undefined,
  cluster: string,
  feedbackDataUri?: string,
  trustModels: string[] = ['feedback']
): TrustConfig {
  const registrations =
    agentId != null
      ? [
          {
            agentId: String(agentId),
            agentRegistry: `solana:${cluster}:8004-solana`,
          },
        ]
      : [];

  return {
    registrations,
    trustModels,
    feedbackDataUri,
  };
}

/**
 * Create a SolanaSDK instance from config options.
 */
export function createSdk(options: {
  privateKey?: Uint8Array;
  cluster: string;
  rpcUrl: string;
}): InstanceType<typeof SolanaSDK> {
  const sdkOptions: Record<string, unknown> = {
    cluster: options.cluster,
    rpcUrl: options.rpcUrl,
  };

  if (options.privateKey) {
    sdkOptions.keypair = options.privateKey;
  }

  return new SolanaSDK(sdkOptions);
}

/**
 * Resolve the effective TrustConfig for a given set of options.
 * If options.trust is provided it wins; otherwise derive from trustModels.
 */
export function getSolanaTrustConfig(
  result: SolanaAgentIdentity
): TrustConfig | undefined {
  return result.trust;
}

/**
 * Create Solana agent identity with automatic registration.
 * Mirrors createAgentIdentity() from @lucid-agents/identity.
 */
export async function createSolanaAgentIdentity(
  options: CreateSolanaAgentIdentityOptions
): Promise<SolanaAgentIdentity> {
  const { env, logger, registration: regOpts } = options;

  // Short-circuit: if a pre-resolved TrustConfig is supplied, use it directly
  // without touching the chain at all.
  if (options.trust) {
    return {
      status: 'Pre-resolved TrustConfig supplied — skipping on-chain lookup',
      trust: options.trust,
      domain: options.domain,
    };
  }

  // Resolve cluster + RPC
  const clusterRaw =
    options.cluster ??
    env?.SOLANA_CLUSTER ??
    (typeof process !== 'undefined' ? process.env?.SOLANA_CLUSTER : undefined);
  const cluster = parseCluster(clusterRaw);
  const rpcUrl = resolveRpcUrl(
    cluster,
    options.rpcUrl ??
      env?.SOLANA_RPC_URL ??
      (typeof process !== 'undefined' ? process.env?.SOLANA_RPC_URL : undefined)
  );

  // Resolve private key — single source of truth via parseSolanaPrivateKey
  const privateKey: Uint8Array | undefined =
    options.privateKey ??
    (() => {
      const raw =
        env?.SOLANA_PRIVATE_KEY ??
        (typeof process !== 'undefined'
          ? process.env?.SOLANA_PRIVATE_KEY
          : undefined);
      return parseSolanaPrivateKey(raw) ?? undefined;
    })();

  // Resolve domain
  const domain =
    options.domain ??
    env?.AGENT_DOMAIN ??
    (typeof process !== 'undefined' ? process.env?.AGENT_DOMAIN : undefined);

  const autoRegister = resolveAutoRegister(options, env);
  const trustModels = options.trustModels ?? ['feedback'];

  // Create SDK (read-only if no private key)
  const sdk = createSdk({ privateKey, cluster, rpcUrl });

  const identityClient = createSolanaIdentityRegistryClient(sdk);
  const reputationClient = createSolanaReputationRegistryClient(sdk);
  const clients: SolanaRegistryClients = {
    identity: identityClient,
    reputation: reputationClient,
  };

  // Check existing registration (by domain owner if possible)
  let existing: SolanaAgentRecord | null = null;
  if (privateKey) {
    try {
      const { Keypair } = await import('@solana/web3.js');
      const kp = Keypair.fromSecretKey(privateKey);
      existing = await identityClient.getAgentByOwner(kp.publicKey.toString());
    } catch {
      // Ignore — agent may not be registered yet
    }
  }

  if (existing) {
    logger?.info?.(
      `[identity-solana] Found existing Solana agent ID: ${existing.agentId}`
    );
    const trust = mapTrustTierToConfig(
      existing.agentId,
      cluster,
      undefined,
      trustModels
    );
    return {
      status: 'Found existing registration in 8004-Solana registry',
      trust,
      record: existing,
      domain,
      isNewRegistration: false,
      didRegister: false,
      clients,
    };
  }

  // Auto-register if requested
  if (autoRegister && privateKey) {
    // Fail fast: writing placeholder domain on-chain is worse than an early error.
    if (!domain) {
      throw new Error(
        '[identity-solana] Missing required domain for auto-registration. ' +
          'Set the AGENT_DOMAIN environment variable or provide options.domain.'
      );
    }

    logger?.info?.(
      '[identity-solana] No existing registration found, registering...'
    );
    const skipSend = regOpts?.skipSend ?? false;
    const result = await identityClient.registerAgent({
      domain,
      name: regOpts?.name,
      description: regOpts?.description,
      image: regOpts?.image,
      agentURI: regOpts?.agentURI,
      skipSend,
    });

    if (result.alreadyExists) {
      const trust = mapTrustTierToConfig(
        result.agentId,
        cluster,
        undefined,
        trustModels
      );
      return {
        status: 'Found existing registration in 8004-Solana registry',
        trust,
        record: result.agentId
          ? { agentId: result.agentId, owner: '', uri: '', cluster }
          : undefined,
        domain,
        isNewRegistration: false,
        didRegister: false,
        clients,
      };
    }

    if (skipSend) {
      // Guard: the SDK must return a serialised unsigned transaction.
      if (
        !result.unsignedTransaction ||
        result.unsignedTransaction.length === 0
      ) {
        throw new Error(
          '[identity-solana] skipSend=true but SDK returned no unsigned transaction payload. ' +
            'Ensure assetPubkey is provided and the SDK version supports PreparedTransaction.'
        );
      }
      return {
        status: 'Unsigned transaction ready for browser wallet signing',
        domain,
        isNewRegistration: false,
        didRegister: false,
        unsignedTransaction: result.unsignedTransaction,
        clients,
      };
    }

    const trust = mapTrustTierToConfig(
      result.agentId,
      cluster,
      undefined,
      trustModels
    );
    return {
      status: 'Successfully registered agent in 8004-Solana registry',
      trust,
      record: result.agentId
        ? { agentId: result.agentId, owner: '', uri: '', cluster }
        : undefined,
      domain,
      isNewRegistration: true,
      didRegister: true,
      transactionSignature: result.transactionSignature,
      clients,
    };
  }

  // No registration — return without on-chain identity
  if (autoRegister && !privateKey) {
    logger?.warn?.(
      '[identity-solana] autoRegister=true but no SOLANA_PRIVATE_KEY. Cannot register.'
    );
  }

  return {
    status:
      'No 8004-Solana identity — agent will run without on-chain identity',
    domain,
    clients,
  };
}
