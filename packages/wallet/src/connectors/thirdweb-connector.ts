import type {
  AgentChallengeResponse,
  LocalEoaSigner,
  TypedDataPayload,
  WalletCapabilities,
  WalletClientHandle,
  WalletConnector,
  WalletMetadata,
  ThirdwebWalletOptions,
} from '@lucid-agents/types/wallets';
import type { WalletClient } from 'viem';

import { detectMessageEncoding, normalizeChallenge } from './base-connector';

export interface ThirdwebWalletConnectorOptions {
  secretKey: string;
  clientId?: string;
  walletLabel: string;
  chainId: number;
  address?: string | null;
  caip2?: string | null;
  chain?: string | null;
  chainType?: string | null;
  label?: string | null;
}

/**
 * Connector for thirdweb Engine server wallets.
 *
 * This connector uses Engine's API for signing challenges. Server wallets
 * sign messages through Engine's infrastructure, not locally.
 *
 * Internally, it converts the thirdweb Account to a viem wallet client
 * using thirdweb's viem adapter for compatibility with the rest of the SDK.
 */
export class ThirdwebWalletConnector implements WalletConnector {
  private readonly options: ThirdwebWalletConnectorOptions;
  private readonly metadata: WalletMetadata;
  private viemWalletClient: WalletClient | null = null;
  private initializationPromise: Promise<void> | null = null;
  private signer: LocalEoaSigner | null = null;
  private readonly capabilities: WalletCapabilities = {
    signer: true,
    walletClient: true,
  };

  constructor(options: ThirdwebWalletConnectorOptions) {
    if (!options?.secretKey) {
      throw new Error('ThirdwebWalletConnector requires a secretKey');
    }
    if (!options?.walletLabel) {
      throw new Error('ThirdwebWalletConnector requires a walletLabel');
    }
    if (!options?.chainId) {
      throw new Error('ThirdwebWalletConnector requires a chainId');
    }

    this.options = options;
    this.metadata = {
      address: options.address ?? null,
      caip2: options.caip2 ?? null,
      chain: options.chain ?? null,
      chainType: options.chainType ?? null,
      provider: 'thirdweb',
      label: options.label ?? null,
    };
  }

  /**
   * Lazily initializes the thirdweb client, account, and viem wallet client.
   * This is done on first use to avoid async operations in the constructor.
   */
  private async initialize(): Promise<void> {
    if (this.viemWalletClient) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      let thirdweb: any;
      let viemAdapterModule: any;
      let chainsModule: any;

      try {
        thirdweb = await import('thirdweb');
        viemAdapterModule = await import('thirdweb/adapters/viem');
        chainsModule = await import('thirdweb/chains');
      } catch (error) {
        throw new Error(
          `Failed to import thirdweb: ${error instanceof Error ? error.message : String(error)}. ` +
            `Make sure thirdweb is installed: bun add thirdweb`
        );
      }

      const { createThirdwebClient, Engine } = thirdweb;
      const { viemAdapter } = viemAdapterModule;

      const chains = chainsModule;
      const chain = Object.values(chains).find(
        (c: any) => c?.id === this.options.chainId
      ) as any;

      if (!chain) {
        throw new Error(
          `Chain with ID ${this.options.chainId} not found in thirdweb chains`
        );
      }

      const client = createThirdwebClient({
        secretKey: this.options.secretKey,
        clientId: this.options.clientId,
      });

      const serverWalletData = await Engine.createServerWallet({
        client,
        label: this.options.walletLabel,
      });

      const account = Engine.serverWallet({
        client,
        address: serverWalletData.address,
        chain,
      });

      const wallet = {
        ...account,
        getAccount: () => account,
      } as any;

      this.viemWalletClient = await viemAdapter.wallet.toViem({
        client,
        chain,
        wallet,
      });
      if (serverWalletData.address) {
        this.metadata.address = serverWalletData.address;
      }

      this.signer = createLocalSignerFromWalletClient(this.viemWalletClient);
    })();

    await this.initializationPromise;
  }

  async signChallenge(
    challenge: AgentChallengeResponse['challenge']
  ): Promise<string> {
    const signer = await this.getSigner();
    const normalized = normalizeChallenge(challenge);
    const typedData = extractTypedDataPayload(normalized.payload);

    if (typedData) {
      if (!signer.signTypedData) {
        throw new Error(
          'Challenge payload requires typed-data signing but signer does not expose signTypedData()'
        );
      }

      return signer.signTypedData(typedData);
    }

    const message = normalized.message ?? normalized.payloadHash;
    if (!message) {
      throw new Error(
        'Challenge payload does not include a signable message or payload hash'
      );
    }

    const messageForSigning = coerceMessageForSigning(message);
    return signer.signMessage(messageForSigning);
  }

  async getWalletMetadata(): Promise<WalletMetadata | null> {
    try {
      await this.initialize();
    } catch {}
    return this.metadata;
  }

  async getAddress(): Promise<string | null> {
    try {
      await this.initialize();
    } catch {}
    return this.metadata.address;
  }

  supportsCaip2(caip2: string): boolean {
    if (!caip2) return false;
    if (!this.metadata?.caip2) return true;
    return this.metadata.caip2.toLowerCase() === caip2.toLowerCase();
  }

  async getWalletClient<
    TClient = WalletClient,
  >(): Promise<WalletClientHandle<TClient> | null> {
    await this.initialize();
    if (!this.viemWalletClient) {
      return null;
    }
    return {
      kind: 'viem',
      client: this.viemWalletClient as unknown as TClient,
    };
  }

  async getSigner(): Promise<LocalEoaSigner> {
    await this.initialize();
    if (!this.signer || !this.viemWalletClient) {
      throw new Error('Thirdweb wallet client not initialized');
    }
    return this.signer;
  }

  getCapabilities(): WalletCapabilities {
    return this.capabilities;
  }
}

const coerceMessageForSigning = (message: string): string | Uint8Array => {
  const encoding = detectMessageEncoding(message);
  if (encoding === 'utf-8') {
    return message;
  }

  const hex = message.slice(2);
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
};

const extractTypedDataPayload = (payload: unknown): TypedDataPayload | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidate = record.typedData;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const typed = candidate as Record<string, unknown>;
  if (
    typeof typed.primaryType !== 'string' ||
    !typed.types ||
    typeof typed.types !== 'object' ||
    !typed.domain ||
    typeof typed.domain !== 'object' ||
    !typed.message ||
    typeof typed.message !== 'object'
  ) {
    return null;
  }

  return {
    primaryType: typed.primaryType,
    types: typed.types as TypedDataPayload['types'],
    domain: typed.domain as TypedDataPayload['domain'],
    message: typed.message as TypedDataPayload['message'],
  };
};

const createLocalSignerFromWalletClient = (
  walletClient: WalletClient
): LocalEoaSigner => {
  const account = walletClient.account;
  if (!account) {
    throw new Error('Thirdweb wallet client is missing account information');
  }

  return {
    async signMessage(message) {
      const payload = typeof message === 'string' ? message : { raw: message };
      return walletClient.signMessage({
        account,
        message: payload,
      });
    },
    async signTypedData(payload) {
      return walletClient.signTypedData({
        account,
        domain: payload.domain as any,
        types: payload.types as any,
        primaryType: payload.primaryType as any,
        message: payload.message as any,
      });
    },
    async signTransaction(transaction) {
      if (!walletClient.signTransaction) {
        throw new Error(
          'Thirdweb wallet client does not support signTransaction'
        );
      }
      return walletClient.signTransaction({
        account,
        chain: walletClient.chain,
        to: transaction.to ?? undefined,
        value: transaction.value,
        data: transaction.data,
        gas: transaction.gas,
        gasPrice: transaction.gasPrice,
        nonce: transaction.nonce,
      });
    },
    async getAddress() {
      return account.address;
    },
  };
};
