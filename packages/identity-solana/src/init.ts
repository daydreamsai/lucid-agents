/**
 * Core initialization for Solana agent identity.
 * Mirrors @lucid-agents/identity createAgentIdentity() for Solana.
 */

import type { TrustConfig } from '@lucid-agents/types/identity';
// @ts-ignore — 8004-solana is a peer/dependency
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
import { resolveAutoRegister } from './validation';

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
  /** Cluster: mainnet-beta | devnet | testnet (default: mainnet-beta) */
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
  /** Pre-resolved TrustConfig (bypasses auto-derivation from trustModels) */
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
 * Map a Solana TrustTier value to a Lucid TrustConfig.
 */
export function mapTrustTierToConfig(
  tier: number | string | undefined,
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
 * Create Solana agent identity with automatic registration.
 * Mirrors createAgentIdentity() from @lucid-agents/identity.
 */
export async function createSolanaAgentIdentity(
  options: CreateSolanaAgentIdentityOptions
): Promise<SolanaAgentIdentity> {
  const { env, logger, registration: regOpts } = options;

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

  // Resolve private key
  const privateKey =
    options.privateKey ??
    (() => {
      const raw =
        env?.SOLANA_PRIVATE_KEY ??
        (typeof process !== 'undefined'
          ? process.env?.SOLANA_PRIVATE_KEY
          : undefined);
      if (!raw) return undefined;
      try {
        return new Uint8Array(JSON.parse(raw));
      } catch {
        return undefined;
      }
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
      const { PublicKey, Keypair } = await import('@solana/web3.js');
      const kp = Keypair.fromSecretKey(privateKey);
      existing = await identityClient.getAgentByOwner(kp.publicKey.toString());
    } catch {
      // Ignore — may not be registered yet
    }
  }

  if (existing) {
    logger?.info?.(
      `[identity-solana] Found existing Solana agent ID: ${existing.agentId}`
    );
    const trust = mapTrustTierToConfig(
      undefined,
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

  // Register if requested
  if (autoRegister && privateKey) {
    logger?.info?.(
      '[identity-solana] No existing registration found, registering...'
    );
    const skipSend = regOpts?.skipSend ?? false;
    const result = await identityClient.registerAgent({
      domain: domain ?? 'unknown',
      name: regOpts?.name,
      description: regOpts?.description,
      image: regOpts?.image,
      agentURI: regOpts?.agentURI,
      skipSend,
    });

    if (result.alreadyExists) {
      const trust = mapTrustTierToConfig(
        undefined,
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

    if (skipSend && result.unsignedTransaction) {
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
      undefined,
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

  // No registration — return trust config with no on-chain record
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

/** Extract TrustConfig from a SolanaAgentIdentity. */
export function getSolanaTrustConfig(
  result: SolanaAgentIdentity
): TrustConfig | undefined {
  return result.trust;
}
