import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';
import type { BuildContext, Extension, AgentRuntime } from '@lucid-agents/types/core';
import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import { IdentitySolanaConfig } from './config';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

export function identitySolana(options: { config: IdentitySolanaConfig }): Extension<{
  identity: {
    type: string;
    getPublicKey: () => string | null;
    signMessage: (msg: string) => Promise<string>;
  };
}> {
  const { config } = options;
  
  // Validate and derive RPC URL
  const rpcUrl = config.solanaRpcUrl || clusterApiUrl(config.solanaCluster as any);
  const connection = new Connection(rpcUrl);

  // Keypair parsing helper
  const getKeypair = (): Keypair | null => {
    if (!config.solanaPrivateKey) return null;
    try {
      if (config.solanaPrivateKey.startsWith('[')) {
        return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(config.solanaPrivateKey)));
      }
      return Keypair.fromSecretKey(bs58.decode(config.solanaPrivateKey));
    } catch (e) {
      console.error('identity-solana: failed to parse private key', e);
      return null;
    }
  };

  const keypair = getKeypair();

  if (config.registerIdentity) {
      console.warn('identity-solana: registerIdentity is only supported in EVM identity flow. Ignoring.');
  }

  return {
    name: 'identity-solana',
    build: (_ctx: BuildContext) => {
      return {
        identity: {
          type: 'solana',
          getPublicKey: () => keypair?.publicKey.toBase58() || null,
          signMessage: async (msg: string) => {
            if (!keypair) throw new Error('identity-solana: no keypair available for signing');
            try {
              const messageBytes = new TextEncoder().encode(msg);
              const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
              return bs58.encode(signature);
            } catch (err: any) {
              throw new Error(`identity-solana: signMessage failed: ${err.message}`);
            }
          }
        }
      };
    },
    onManifestBuild: (card: AgentCardWithEntrypoints, _runtime: AgentRuntime) => {
      const manifest = { ...card };
      manifest.trust = manifest.trust || {};
      manifest.trust.solana = { tier: 1, assets: ['SOL', 'USDC'] };
      if (config.agentDomain) {
          (manifest as any).domain = config.agentDomain;
      }
      return manifest;
    }
  };
}
