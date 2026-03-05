import { IdentitySolanaConfig, IdentitySolanaConfigSchema } from './config';

export function identitySolanaFromEnv(): IdentitySolanaConfig {
  return IdentitySolanaConfigSchema.parse({
    solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
    solanaCluster: process.env.SOLANA_CLUSTER,
    solanaRpcUrl: process.env.SOLANA_RPC_URL,
    agentDomain: process.env.AGENT_DOMAIN,
    registerIdentity: process.env.REGISTER_IDENTITY === 'true',
    pinataJwt: process.env.PINATA_JWT,
    atomEnabled: process.env.ATOM_ENABLED === 'true',
  });
}
