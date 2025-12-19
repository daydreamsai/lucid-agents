import type {
  WalletConnector,
  WalletMetadata,
  WalletCapabilities,
  AgentChallenge,
  LocalEoaSigner,
} from '@lucid-agents/types/wallets';
import { hashMessage, recoverMessageAddress, type WalletClient } from 'viem';

/**
 * Options for creating a ViemWalletConnector.
 */
export interface ViemWalletConnectorOptions {
  walletClient: WalletClient;
  metadata?: Partial<WalletMetadata>;
}

/**
 * ViemWalletConnector wraps a viem WalletClient to implement the WalletConnector interface.
 * This enables browser wallets (e.g., thirdweb) that use eth_sendTransaction instead of eth_signTransaction.
 * It can be used for both developer wallets and agent wallets.
 */
export class ViemWalletConnector implements WalletConnector {
  private walletClient: WalletClient;
  private metadata: Partial<WalletMetadata>;

  constructor(options: ViemWalletConnectorOptions) {
    this.walletClient = options.walletClient;
    this.metadata = options.metadata || {};
  }

  async getWalletMetadata(): Promise<WalletMetadata | null> {
    const address = this.walletClient.account?.address || null;
    const chainId = this.walletClient.chain?.id;

    return {
      address,
      chain: chainId ? String(chainId) : null,
      chainType: 'evm',
      provider: 'viem',
      caip2: chainId ? `eip155:${chainId}` : null,
      ...this.metadata,
    };
  }

  supportsCaip2(caip2: string): boolean {
    const chainId = this.walletClient.chain?.id;
    if (!chainId) return false;
    return caip2 === `eip155:${chainId}`;
  }

  async getAddress(): Promise<string | null> {
    return this.walletClient.account?.address || null;
  }

  getCapabilities(): WalletCapabilities {
    return {
      walletClient: true,
      signer: true,
    };
  }

  async getSigner(): Promise<LocalEoaSigner | null> {
    if (!this.walletClient.account) return null;

    const walletClient = this.walletClient;

    return {
      async signMessage(message: string | Uint8Array): Promise<string> {
        if (!walletClient.account) {
          throw new Error('No account available');
        }
        const messageStr =
          typeof message === 'string' ? message : new TextDecoder().decode(message);
        return walletClient.signMessage({
          account: walletClient.account,
          message: messageStr,
        });
      },

      async signTypedData(payload: {
        domain: Record<string, unknown>;
        primaryType: string;
        types: Record<string, Array<{ name: string; type: string }>>;
        message: Record<string, unknown>;
      }): Promise<string> {
        if (!walletClient.account) {
          throw new Error('No account available');
        }
        if (!walletClient.signTypedData) {
          throw new Error('Typed data signing not supported by this wallet');
        }
        return walletClient.signTypedData({
          account: walletClient.account,
          domain: payload.domain,
          primaryType: payload.primaryType,
          types: payload.types,
          message: payload.message,
        });
      },

      async getAddress(): Promise<string | null> {
        return walletClient.account?.address || null;
      },
    };
  }

  async getWalletClient<TClient = unknown>(): Promise<TClient | null> {
    return this.walletClient as TClient;
  }

  async signChallenge(challenge: AgentChallenge): Promise<string> {
    if (!this.walletClient.account) {
      throw new Error('No account available');
    }

    const payload = this.buildChallengePayload(challenge);
    const message = JSON.stringify(payload);
    const signature = await this.walletClient.signMessage({
      account: this.walletClient.account,
      message,
    });

    // Verify signature
    const messageHash = hashMessage(message);
    const recoveredAddress = await recoverMessageAddress({
      message,
      signature,
    });

    if (
      recoveredAddress.toLowerCase() !== this.walletClient.account.address.toLowerCase()
    ) {
      throw new Error('Signature verification failed');
    }

    return signature;
  }

  private buildChallengePayload(challenge: AgentChallenge): Record<string, unknown> {
    return {
      id: challenge.id,
      credential_id: challenge.credential_id,
      payload: challenge.payload,
      payload_hash: challenge.payload_hash,
      nonce: challenge.nonce,
      scopes: challenge.scopes,
      issued_at: challenge.issued_at,
      expires_at: challenge.expires_at,
      server_signature: challenge.server_signature,
    };
  }
}
