/**
 * Core initialization helpers for Solana agent identity.
 * Mirrors createAgentIdentity() from @lucid-agents/identity (EVM).
 */

import { Connection, Keypair } from '@solana/web3.js';

import type { TrustConfig } from '@lucid-agents/types/identity';

import { parseSolanaPrivateKey, normalizeCluster } from './env.js';
import {
  createSolanaIdentityRegistryClient,
  DEFAULT_IDENTITY_PROGRAM_ID,
} from './registries/identity.js';
import { createSolanaReputationRegistryClient, DEFAULT_REPUTATION_PROGRAM_ID } from './registries/reputation.js';
import type {
  CreateSolanaAgentIdentityOptions,
  SolanaAgentIdentity,
  SolanaRegistryClients,
} from './types.js';
import { buildSolanaTrustConfig } from './types.js';

/**
 * Maps a Solana cluster name to the default public RPC URL.
 */
function defaultRpcUrl(cluster: string): string {
  switch (cluster) {
    case 'mainnet-beta':
      return 'https://api.mainnet-beta.solana.com';
    case 'devnet':
      return 'https://api.devnet.solana.com';
    case 'testnet':
      return 'https://api.testnet.solana.com';
    default:
      // Allow custom cluster URLs passed directly
      if (cluster.startsWith('http')) return cluster;
      return 'https://api.devnet.solana.com';
  }
}

/**
 * Resolve the agent registration URI from domain.
 */
function buildAgentURI(domain: string): string {
  const normalized = domain.startsWith('http')
    ? domain.replace(/\/$/, '')
    : `https://${domain}`;
  return `${normalized}/.well-known/agent-registration.json`;
}

/**
 * Resolve private key from options or environment.
 */
function resolveKeypair(
  options: CreateSolanaAgentIdentityOptions
): Keypair | undefined {
  const raw =
    options.privateKey ??
    (typeof process !== 'undefined'
      ? process.env?.SOLANA_PRIVATE_KEY
      : undefined) ??
    (options.env?.SOLANA_PRIVATE_KEY);

  if (!raw) return undefined;
  const secretKey = parseSolanaPrivateKey(raw);
  return Keypair.fromSecretKey(secretKey!);
}

/**
 * Create Solana agent identity — main entrypoint.
 *
 * Mirrors createAgentIdentity() from @lucid-agents/identity (EVM).
 *
 * @example
 * ```ts
 * import { createSolanaAgentIdentity } from '@lucid-agents/identity-solana';
 *
 * const identity = await createSolanaAgentIdentity({
 *   domain: 'my-agent.example.com',
 *   autoRegister: true,
 * });
 * console.log(identity.status);
 * ```
 */
export async function createSolanaAgentIdentity(
  options: CreateSolanaAgentIdentityOptions
): Promise<SolanaAgentIdentity> {
  const {
    domain,
    autoRegister,
    trustModels = ['feedback', 'inference-validation'],
    skipSend = false,
    env,
    logger,
  } = options;

  const resolvedEnv = env ?? (typeof process !== 'undefined' ? process.env : {});

  const cluster = normalizeCluster(
    options.cluster ??
      resolvedEnv.SOLANA_CLUSTER
  );

  const rpcUrl =
    options.rpcUrl ??
    resolvedEnv.SOLANA_RPC_URL ??
    defaultRpcUrl(cluster);

  const resolvedDomain =
    domain ?? resolvedEnv.AGENT_DOMAIN;

  const programId =
    resolvedEnv.SOLANA_IDENTITY_PROGRAM_ID ?? DEFAULT_IDENTITY_PROGRAM_ID;

  const reputationProgramId =
    resolvedEnv.SOLANA_REPUTATION_PROGRAM_ID ?? DEFAULT_REPUTATION_PROGRAM_ID;

  // Resolve autoRegister from options or env
  let shouldRegister =
    autoRegister ??
    (() => {
      const raw = resolvedEnv.REGISTER_IDENTITY ?? resolvedEnv.IDENTITY_AUTO_REGISTER;
      if (raw !== undefined) {
        return raw.toLowerCase() === 'true' || raw === '1';
      }
      return false;
    })();

  const connection = new Connection(rpcUrl, 'confirmed');
  const keypair = resolveKeypair(options);

  const identityClient = createSolanaIdentityRegistryClient({
    connection,
    keypair,
    programId,
    cluster,
  });

  const reputationClient = createSolanaReputationRegistryClient({
    connection,
    keypair,
    programId: reputationProgramId,
    cluster,
  });

  const clients: SolanaRegistryClients = {
    identity: identityClient,
    reputation: reputationClient,
  };

  // Try to find existing registration by domain
  let record = resolvedDomain
    ? await identityClient.getByDomain(resolvedDomain).catch(() => null)
    : null;

  let didRegister = false;
  let isNewRegistration = false;
  let transactionSignature: string | undefined;

  if (!record && shouldRegister) {
    if (!resolvedDomain) {
      logger?.warn?.(
        '[identity-solana] AGENT_DOMAIN is not set; registration will use a placeholder URI.'
      );
    }
    const agentURI = resolvedDomain
      ? buildAgentURI(resolvedDomain)
      : 'https://placeholder.invalid/.well-known/agent-registration.json';

    try {
      const result = await identityClient.register({ agentURI, skipSend });
      didRegister = true;
      isNewRegistration = true;
      if (result.signature) {
        transactionSignature = result.signature;
      }
      // Fetch the newly created record
      record = await identityClient.get(result.agentId).catch(() => null);
      if (!record) {
        // Build a synthetic record when skipSend is true or network lookup fails
        record = {
          agentId: result.agentId,
          owner: keypair?.publicKey.toBase58() ?? 'unknown',
          agentURI,
          network: `solana:${cluster}`,
        };
      }
    } catch (err) {
      logger?.warn?.(
        '[identity-solana] Registration failed',
        err
      );
    }
  }

  let trust: TrustConfig | undefined;
  if (record) {
    trust = buildSolanaTrustConfig(record, programId, cluster, trustModels);
  }

  let status: string;
  if (didRegister) {
    status = 'Successfully registered agent in Solana identity registry';
    if (transactionSignature) {
      status += ` (tx: ${transactionSignature})`;
    } else if (skipSend) {
      status += ' (skipSend: transaction not sent — use returned data with browser wallet)';
    }
  } else if (record) {
    status = 'Found existing registration in Solana identity registry';
  } else {
    status = 'No Solana identity — agent will run without on-chain identity';
  }

  return {
    didRegister,
    isNewRegistration,
    transactionSignature,
    record: record ?? undefined,
    trust,
    status,
    domain: resolvedDomain,
    clients,
  };
}

/**
 * Convenience wrapper that forces autoRegister: true.
 * Mirrors registerAgent() from @lucid-agents/identity.
 */
export async function registerSolanaAgent(
  options: CreateSolanaAgentIdentityOptions
): Promise<SolanaAgentIdentity> {
  return createSolanaAgentIdentity({ ...options, autoRegister: true });
}

/**
 * Extract just the trust config from a Solana identity result.
 * Mirrors getTrustConfig() from @lucid-agents/identity.
 */
export function getSolanaTrustConfig(
  result: SolanaAgentIdentity
): TrustConfig | undefined {
  return result.trust;
}
