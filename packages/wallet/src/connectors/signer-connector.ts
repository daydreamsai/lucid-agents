import type { LocalEoaSigner } from '@lucid-agents/types/wallets';

/**
 * Interface for a wallet that can be converted to a LocalEoaSigner.
 * This works with wallets that have local signing capabilities (not thirdweb server wallets).
 */
export interface CompatibleWallet {
  /** Wallet address (property or method) */
  address?: string;
  getAddress?: () => Promise<string>;
  /** Sign a message */
  signMessage: (message: string | Uint8Array) => Promise<string>;
  /** Sign EIP-712 typed data (optional) */
  signTypedData?: (data: {
    domain: Record<string, unknown>;
    primaryType: string;
    types: Record<string, Array<{ name: string; type: string }>>;
    message: Record<string, unknown>;
  }) => Promise<string>;
  /** Sign a transaction (optional) */
  signTransaction?: (transaction: {
    to?: `0x${string}` | null;
    value?: bigint;
    data?: `0x${string}`;
    gas?: bigint;
    gasPrice?: bigint;
    nonce?: number;
    chainId?: number;
  }) => Promise<`0x${string}`>;
}

/**
 * Creates a LocalEoaSigner from any compatible wallet interface.
 *
 * Note: This does NOT work with thirdweb server wallets. For thirdweb server wallets,
 * use the ThirdwebEngineWalletConnector instead.
 *
 * @example
 * ```typescript
 * import { createSignerConnector } from "@lucid-agents/wallet";
 *
 * const signer = createSignerConnector({
 *   address: "0x...",
 *   signMessage: async (msg) => { ... },
 * });
 * ```
 */
export function createSignerConnector(
  wallet: CompatibleWallet
): LocalEoaSigner {
  if (!wallet.signMessage || typeof wallet.signMessage !== 'function') {
    throw new Error(
      'Wallet must implement signMessage method to be compatible with createSignerConnector'
    );
  }

  return {
    async signMessage(message: string | Uint8Array): Promise<string> {
      return wallet.signMessage(message);
    },
    async signTypedData(payload: {
      domain: Record<string, unknown>;
      primaryType: string;
      types: Record<string, Array<{ name: string; type: string }>>;
      message: Record<string, unknown>;
    }): Promise<string> {
      if (!wallet.signTypedData) {
        throw new Error(
          'Wallet does not support typed data signing (signTypedData)'
        );
      }
      return wallet.signTypedData(payload);
    },
    async signTransaction(transaction: {
      to?: `0x${string}` | null;
      value?: bigint;
      data?: `0x${string}`;
      gas?: bigint;
      gasPrice?: bigint;
      nonce?: number;
      chainId?: number;
    }): Promise<`0x${string}`> {
      if (!wallet.signTransaction) {
        throw new Error(
          'Wallet does not support transaction signing (signTransaction)'
        );
      }
      return wallet.signTransaction(transaction);
    },
    async getAddress(): Promise<string | null> {
      if (wallet.address) {
        return wallet.address;
      }
      if (wallet.getAddress) {
        try {
          const address = await wallet.getAddress();
          return address || null;
        } catch {
          return null;
        }
      }
      return null;
    },
  };
}
