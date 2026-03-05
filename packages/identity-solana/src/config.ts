import { z } from 'zod';

export const IdentitySolanaConfigSchema = z.object({
  solanaPrivateKey: z.string().optional().describe('JSON array of numbers or hex string'),
  solanaCluster: z.string().default('mainnet-beta'),
  solanaRpcUrl: z.string().optional(),
  agentDomain: z.string().optional(),
  registerIdentity: z.boolean().default(false),
  pinataJwt: z.string().optional(),
  atomEnabled: z.boolean().default(false),
});

export type IdentitySolanaConfig = z.infer<typeof IdentitySolanaConfigSchema>;
