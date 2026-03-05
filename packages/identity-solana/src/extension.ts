import { Connection, Keypair } from '@solana/web3.js';
import { IdentitySolanaConfig } from './config';

export function identitySolana(options: { config: IdentitySolanaConfig }) {
  return {
    name: 'identity-solana',
    install: (agent: any) => {
      const config = options.config;
      const connection = new Connection(config.solanaRpcUrl || 'https://api.mainnet-beta.solana.com');
      
      agent.identity = {
        type: 'solana',
        getPublicKey: () => {
             if (config.solanaPrivateKey) {
                 try {
                    const secretKey = Uint8Array.from(JSON.parse(config.solanaPrivateKey));
                    return Keypair.fromSecretKey(secretKey).publicKey.toBase58();
                 } catch (e) {
                    return null;
                 }
             }
             return null;
        },
        signMessage: async (msg: string) => {
            // In a real implementation, this would use the Keypair to sign
            return "solana_sig_...";
        }
      };
    },
    onManifestBuild: (manifest: any) => {
      manifest.trust = manifest.trust || {};
      manifest.trust.solana = { tier: 1, assets: ['SOL', 'USDC'] };
    }
  };
}
