import type { AgentRuntime } from '@lucid-agents/types/core';
import type {
  SolanaIdentityConfig,
  SolanaRegistrationOptions,
  CreateSolanaAgentIdentityOptions,
  SolanaTrustConfig,
  SolanaAgentRegistration,
} from './types';
import { TrustTier } from './types';
import { validateRegistration, validateCluster } from './validation';

/**
 * Get trust config from identity result
 */
export function getSolanaTrustConfig(
  identity: Awaited<ReturnType<typeof createSolanaAgentIdentity>>
): SolanaTrustConfig | undefined {
  if (!identity) return undefined;
  
  return {
    registrations: identity.registration ? [{
      agentId: identity.registration.name as string,
      agentRegistry: `solana:${identity.cluster}:${identity.programId}`,
      agentAddress: identity.identityAccount,
      signature: identity.signature,
    }] : undefined,
    trustModels: ['feedback', 'inference-validation'],
    solana: {
      trustTier: identity.trustTier,
      identityAccount: identity.identityAccount,
      registryProgram: identity.programId,
    },
  };
}

/**
 * Create a Solana agent identity
 *
 * This function:
 * 1. Validates the configuration
 * 2. Creates/derives the identity account
 * 3. Optionally registers with the Solana registry
 * 4. Returns identity data for trust configuration
 */
export async function createSolanaAgentIdentity(
  options: CreateSolanaAgentIdentityOptions
): Promise<{
  registration?: SolanaAgentRegistration;
  identityAccount: string;
  programId: string;
  cluster: 'mainnet-beta' | 'testnet' | 'devnet';
  signature?: string;
  trustTier: { tier: TrustTier };
}> {
  const {
    runtime,
    domain,
    autoRegister = false,
    rpcUrl,
    cluster: configCluster,
    registration,
  } = options;
  
  const cluster = validateCluster(configCluster);
  
  // Default program IDs for Solana identity/reputation registries
  const PROGRAM_IDS = {
    'mainnet-beta': 'idenxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'testnet': 'idenxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'devnet': 'idenxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  };
  
  const programId = PROGRAM_IDS[cluster];
  
  // Derive identity account from domain or generate from runtime
  let identityAccount: string;
  
  if (domain) {
    // Derive PDA from domain
    identityAccount = deriveIdentityPDA(domain, programId);
  } else if (runtime && (runtime as { agent?: { agentId?: number } }).agent?.agentId) {
    // Use runtime agent ID
    const agentId = (runtime as { agent: { agentId: number } }).agent.agentId;
    identityAccount = deriveIdentityPDA(`agent-${agentId}`, programId);
  } else {
    // Generate a placeholder for now
    identityAccount = 'SolanaIdentityPlaceholder111111111111111111';
  }
  
  let trustTier = { tier: TrustTier.NONE };
  let signature: string | undefined;
  let finalRegistration: SolanaAgentRegistration | undefined;
  
  // If registration is provided and autoRegister is enabled, register with chain
  if (registration && autoRegister && rpcUrl) {
    try {
      const regResult = await registerSolanaIdentity({
        rpcUrl,
        cluster,
        programId,
        identityAccount,
        registration,
      });
      
      trustTier = { tier: regResult.trustTier };
      signature = regResult.signature;
      
      finalRegistration = {
        type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
        namespace: 'solana',
        name: registration.name,
        description: registration.description,
        image: registration.image,
        domain: registration.domain,
        url: registration.url,
        services: registration.services,
        x402Support: registration.x402Support,
        active: true,
        chainId: cluster === 'mainnet-beta' ? 101 : cluster === 'testnet' ? 102 : 103,
        programId,
        registryPDA: deriveIdentityPDA('registry', programId),
        identityPDA: identityAccount,
        signature,
      };
    } catch (error) {
      console.error('[identity-solana] Registration failed:', error);
      // Continue without registration
    }
  }
  
  return {
    registration: finalRegistration,
    identityAccount,
    programId,
    cluster,
    signature,
    trustTier,
  };
}

/**
 * Derive a PDA (Program Derived Address) for identity
 */
function deriveIdentityPDA(
  seed: string,
  programId: string
): string {
  // Simplified PDA derivation
  // In production, use @solana/web3.js Connection and PublicKey
  const seedBytes = new TextEncoder().encode(seed);
  const hash = simpleHash(seedBytes);
  
  // Convert to base58-like string
  return `identity${hash.toString(36).slice(0, 44)}`;
}

/**
 * Simple hash function for seed
 */
function simpleHash(bytes: Uint8Array): number {
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 5) - hash) + bytes[i];
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Register identity on Solana blockchain (mock implementation)
 */
async function registerSolanaIdentity(params: {
  rpcUrl: string;
  cluster: 'mainnet-beta' | 'testnet' | 'devnet';
  programId: string;
  identityAccount: string;
  registration: SolanaRegistrationOptions;
}): Promise<{
  trustTier: TrustTier;
  signature: string;
}> {
  const { rpcUrl, cluster, programId, identityAccount, registration } = params;
  
  // Mock implementation - in production this would:
  // 1. Connect to Solana via @solana/web3.js
  // 2. Create transaction to register with identity program
  // 3. Sign and send transaction
  // 4. Return signature and trust tier
  
  console.log(`[identity-solana] Registering identity on ${cluster}:`);
  console.log(`  - Program: ${programId}`);
  console.log(`  - Identity: ${identityAccount}`);
  console.log(`  - Name: ${registration.name}`);
  console.log(`  - RPC: ${rpcUrl}`);
  
  // Simulate registration delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Return mock results
  return {
    trustTier: TrustTier.VERIFIED,
    signature: `0x${Buffer.from(JSON.stringify({ identityAccount, name: registration.name, timestamp: Date.now() })).toString('hex').slice(0, 128)}`,
  };
}

/**
 * Get existing identity from Solana registry
 */
export async function getSolanaIdentity(params: {
  rpcUrl: string;
  cluster: 'mainnet-beta' | 'testnet' | 'devnet';
  identityAccount: string;
}): Promise<SolanaAgentRegistration | null> {
  const { rpcUrl, cluster, identityAccount } = params;
  
  console.log(`[identity-solana] Looking up identity: ${identityAccount}`);
  
  // Mock - in production would query the registry
  // Return null to indicate not found (will trigger autoRegister if enabled)
  return null;
}
