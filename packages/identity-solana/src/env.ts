import { IdentitySolanaConfig, IdentitySolanaConfigSchema } from './config';

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  const truthy = ['true', '1', 'yes', 'y', 'on'];
  const falsy = ['false', '0', 'no', 'n', 'off'];
  
  if (truthy.includes(normalized)) return true;
  if (falsy.includes(normalized)) return false;
  
  throw new Error(`Invalid boolean environment variable value: "${value}"`);
}

export function identitySolanaFromEnv(): IdentitySolanaConfig {
  try {
    return IdentitySolanaConfigSchema.parse({
      solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
      solanaCluster: process.env.SOLANA_CLUSTER,
      solanaRpcUrl: process.env.SOLANA_RPC_URL,
      agentDomain: process.env.AGENT_DOMAIN,
      registerIdentity: parseBooleanEnv(process.env.REGISTER_IDENTITY),
      pinataJwt: process.env.PINATA_JWT,
      atomEnabled: parseBooleanEnv(process.env.ATOM_ENABLED),
    });
  } catch (error) {
    throw new Error('identitySolanaFromEnv: invalid Solana identity environment configuration', { cause: error });
  }
}
