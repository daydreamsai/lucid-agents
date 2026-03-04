import type { TrustConfig } from "@lucid-agents/types/identity";
import type { AnyRecord, SolanaAgentIdentity, SolanaCluster } from "./types";
import { mergeTrust } from "./utils";

const TRUST_TIER_SCORE: Record<string, number> = {
  unknown: 0,
  low: 0.25,
  medium: 0.5,
  high: 0.8,
  premium: 0.9,
  max: 1,
  platinum: 1
};

export function mapSolanaTrustToLucidTrustConfig(trustTier?: string, asset?: string): TrustConfig | undefined {
  if (!trustTier && !asset) return undefined;
  const tier = (trustTier ?? "unknown").toLowerCase();
  const score = TRUST_TIER_SCORE[tier] ?? TRUST_TIER_SCORE.unknown;

  const mapped = {
    provider: "solana",
    tier,
    score,
    asset
  };

  return mapped as unknown as TrustConfig;
}

export interface CreateSolanaAgentIdentityParams {
  address: string;
  cluster: SolanaCluster;
  domain?: string;
  trust?: TrustConfig;
}

export function createSolanaAgentIdentity(params: CreateSolanaAgentIdentityParams): SolanaAgentIdentity {
  const cluster = params.cluster ?? "mainnet-beta";
  const domainPart = params.domain ? `:${params.domain}` : "";
  const did = `did:solana:${cluster}:${params.address}${domainPart}`;

  return {
    id: `solana:${cluster}:${params.address}`,
    did,
    chain: "solana",
    cluster,
    address: params.address,
    domain: params.domain,
    trust: params.trust
  };
}

export function createAgentCardWithSolanaIdentity<T extends AnyRecord>(
  agentCard: T,
  solanaIdentity: SolanaAgentIdentity,
  trustConfig?: TrustConfig
): T {
  const next: AnyRecord = { ...agentCard };
  const existingIdentity = (next.identity as AnyRecord | undefined) ?? {};

  next.identity = {
    ...existingIdentity,
    solana: solanaIdentity
  };

  const trustToApply = trustConfig ?? solanaIdentity.trust;
  if (trustToApply !== undefined) {
    next.trust = mergeTrust(next.trust, trustToApply);
  }

  return next as T;
}