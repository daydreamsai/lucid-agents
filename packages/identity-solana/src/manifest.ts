import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { SolanaTrustConfig, SolanaTrustTierConfig } from './types';
import { TrustTier } from './types';

/**
 * Create agent card with Solana identity merged in
 */
export function createAgentCardWithSolanaIdentity(
  card: AgentCardWithEntrypoints,
  trustConfig: SolanaTrustConfig
): AgentCardWithEntrypoints {
  const solanaTrust = trustConfig.solana;
  
  if (!solanaTrust) {
    return card;
  }
  
  const updatedCard = { ...card } as AgentCardWithEntrypoints & {
    capabilities?: Record<string, unknown>;
    attributes?: Array<{ name: string; value: string }>;
    verified?: boolean;
  };
  
  // Add trust tier as capability
  if (solanaTrust.trustTier) {
    if (!updatedCard.capabilities) {
      updatedCard.capabilities = {} as Record<string, unknown>;
    }
    (updatedCard.capabilities as Record<string, unknown>).trustTier = solanaTrust.trustTier.tier;
    
    if (solanaTrust.trustTier.minStake) {
      (updatedCard.capabilities as Record<string, unknown>).minStake = solanaTrust.trustTier.minStake;
    }
  }
  
  // Add Solana identity account as attribute
  if (solanaTrust.identityAccount) {
    if (!updatedCard.attributes) {
      (updatedCard as Record<string, unknown>).attributes = [];
    }
    (updatedCard.attributes as Array<{ name: string; value: string }>).push({
      name: 'x-solana-identity',
      value: solanaTrust.identityAccount,
    });
  }
  
  // Add registry program as attribute
  if (solanaTrust.registryProgram) {
    if (!updatedCard.attributes) {
      (updatedCard as Record<string, unknown>).attributes = [];
    }
    (updatedCard.attributes as Array<{ name: string; value: string }>).push({
      name: 'x-solana-registry',
      value: solanaTrust.registryProgram,
    });
  }
  
  // Mark as verified for high trust tier
  if (solanaTrust.trustTier?.tier && solanaTrust.trustTier.tier >= TrustTier.VERIFIED) {
    (updatedCard as Record<string, unknown>).verified = true;
  }
  
  return updatedCard;
}

/**
 * Check if trust tier meets minimum requirement
 */
export function meetsTrustRequirement(
  trustConfig: SolanaTrustTierConfig,
  minimumTier: TrustTier
): boolean {
  return trustConfig.tier >= minimumTier;
}

/**
 * Get trust tier display name
 */
export function getTrustTierName(tier: TrustTier): string {
  switch (tier) {
    case TrustTier.NONE: return 'None';
    case TrustTier.BASIC: return 'Basic';
    case TrustTier.VERIFIED: return 'Verified';
    case TrustTier.PREMIUM: return 'Premium';
    default: return 'Unknown';
  }
}

/**
 * Get trust tier color for UI
 */
export function getTrustTierColor(tier: TrustTier): string {
  switch (tier) {
    case TrustTier.NONE: return '#666666';
    case TrustTier.BASIC: return '#3B82F6';
    case TrustTier.VERIFIED: return '#10B981';
    case TrustTier.PREMIUM: return '#F59E0B';
    default: return '#666666';
  }
}
