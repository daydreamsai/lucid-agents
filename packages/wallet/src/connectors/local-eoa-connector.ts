import type {
  AgentChallengeResponse,
  LocalEoaSigner,
  LocalWalletClientConfig,
  TypedDataPayload,
  WalletCapabilities,
  WalletConnector,
  WalletMetadata,
} from '@lucid-agents/types/wallets';
import type { Chain, SignableMessage, Transport, WalletClient } from 'viem';
import { createWalletClient, http } from 'viem';
import { toAccount, privateKeyToAccount } from 'viem/accounts';
import * as chains from 'viem/chains';

import { detectMessageEncoding, normalizeChallenge } from './base-connector';

export interface LocalEoaWalletConnectorOptions {
  signer: LocalEoaSigner;
  address?: string | null;
  caip2?: string | null;
  chain?: string | null;
  chainType?: string | null;
  provider?: string | null;
  label?: string | null;
  walletClient?: LocalWalletClientConfig | null;
}

export class LocalEoaWalletConnector implements WalletConnector {
  private readonly signer: LocalEoaSigner;
  private metadata: WalletMetadata | null;
  private readonly walletClientConfig: LocalWalletClientConfig | null;
  private readonly capabilities: WalletCapabilities = {
    signer: true,
    walletClient: true,
  };
  private walletClient: WalletClient | null = null;
  private walletClientPromise: Promise<WalletClient | null> | null = null;

  constructor(options: LocalEoaWalletConnectorOptions) {
    if (!options?.signer) {
      throw new Error('LocalEoaWalletConnector requires a signer instance');
    }

    this.signer = options.signer;
    this.metadata = {
      address: options.address ?? null,
      caip2: options.caip2 ?? null,
      chain: options.chain ?? null,
      chainType: options.chainType ?? null,
      provider: options.provider ?? 'local',
      label: options.label ?? null,
    };
    this.walletClientConfig = options.walletClient ?? null;
  }

  async signChallenge(
    challenge: AgentChallengeResponse['challenge']
  ): Promise<string> {
    const normalized = normalizeChallenge(challenge);
    const typedData = extractTypedDataPayload(normalized.payload);

    if (typedData) {
      if (!this.signer.signTypedData) {
        throw new Error(
          'Challenge payload requires typed-data signing but signer does not expose signTypedData()'
        );
      }
      const signature = await this.signer.signTypedData(typedData);
      await this.refreshMetadataFromSigner();
      return signature;
    }

    const message = normalized.message ?? normalized.payloadHash;
    if (!message) {
      throw new Error(
        'Challenge payload does not include a signable message or payload hash'
      );
    }

    const signature = await this.signer.signMessage(
      coerceMessageForSigning(message)
    );
    await this.refreshMetadataFromSigner();
    return signature;
  }

  async getWalletMetadata(): Promise<WalletMetadata | null> {
    if (!this.metadata?.address && this.signer.getAddress) {
      await this.refreshMetadataFromSigner();
    }
    return this.metadata;
  }

  getCapabilities(): WalletCapabilities {
    return this.capabilities;
  }

  async getWalletClient<TClient = WalletClient>(): Promise<TClient | null> {
    if (this.walletClient) {
      return this.walletClient as TClient;
    }

    if (!this.walletClientPromise) {
      this.walletClientPromise = this.buildWalletClient();
    }

    try {
      const client = await this.walletClientPromise;
      this.walletClient = client;
      return client as TClient | null;
    } finally {
      this.walletClientPromise = null;
    }
  }

  async getSigner(): Promise<LocalEoaSigner> {
    return this.signer;
  }

  async getAddress(): Promise<string | null> {
    const metadata = await this.getWalletMetadata();
    return metadata?.address ?? null;
  }

  supportsCaip2(caip2: string): boolean {
    if (!caip2) return false;
    if (!this.metadata?.caip2) return true;
    return this.metadata.caip2.toLowerCase() === caip2.toLowerCase();
  }

  private async refreshMetadataFromSigner(): Promise<void> {
    if (!this.signer.getAddress) {
      return;
    }

    try {
      const address = await this.signer.getAddress();
      if (!address) {
        return;
      }

      this.metadata = {
        ...this.metadata,
        address,
      };
    } catch {
      // ignore metadata refresh failures – signing already succeeded
    }
  }

  private async buildWalletClient(): Promise<WalletClient | null> {
    const chain = this.resolveChainConfig();
    const transport = http(this.resolveRpcUrl());
    const address = await this.getAddress();

    return createViemWalletClientFromSigner({
      signer: this.signer,
      chain,
      transport,
      address: address ?? undefined,
    });
  }

  private resolveChainConfig(): Chain {
    const rpcUrl = this.resolveRpcUrl();
    const isLocalhostFallback =
      rpcUrl === 'http://localhost:8545' && !this.walletClientConfig?.rpcUrl;

    const chainId =
      this.walletClientConfig?.chainId ??
      this.extractChainIdFromMetadata() ??
      (isLocalhostFallback ? 31337 : null);

    if (chainId === null) {
      throw new Error(
        'chainId must be explicitly provided in walletClient config when using a custom RPC URL. ' +
          'For localhost development, chainId defaults to 31337 (Hardhat/Anvil standard).'
      );
    }

    // Try to use viem's built-in chain definition for proper fee estimation (EIP-1559 support)
    const builtInChain = findBuiltInChain(chainId);
    if (builtInChain) {
      // Override RPC URL if custom one provided, but keep all other chain config (fees, etc.)
      return {
        ...builtInChain,
        rpcUrls: {
          ...builtInChain.rpcUrls,
          default: { http: [rpcUrl] },
        },
      };
    }

    // Fallback to custom chain config for unknown chains
    const chainName =
      this.walletClientConfig?.chainName ??
      this.metadata?.chain ??
      'Custom Chain';
    const nativeCurrency =
      this.walletClientConfig?.nativeCurrency ?? DEFAULT_NATIVE_CURRENCY;

    return {
      id: chainId,
      name: chainName,
      nativeCurrency,
      rpcUrls: {
        default: { http: [rpcUrl] },
        public: { http: [rpcUrl] },
      },
      // Add default EIP-1559 fee estimation for custom chains
      fees: {
        baseFeeMultiplier: 1.2,
      },
    } as Chain;
  }

  private resolveRpcUrl(): string {
    const rpc = this.walletClientConfig?.rpcUrl?.trim();
    if (rpc) {
      return rpc;
    }
    return 'http://localhost:8545';
  }

  private extractChainIdFromMetadata(): number | null {
    const caip2 = this.metadata?.caip2 ?? undefined;
    if (caip2 && caip2.includes(':')) {
      const [, reference] = caip2.split(':');
      const parsed = Number(reference);
      return Number.isFinite(parsed) ? parsed : null;
    }

    const chain = this.metadata?.chain;
    if (chain) {
      const parsed = Number(chain);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return null;
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

const DEFAULT_NATIVE_CURRENCY = {
  name: 'Ether',
  symbol: 'ETH',
  decimals: 18,
};

/**
 * Find a built-in viem chain definition by chainId.
 * This ensures proper fee estimation (EIP-1559) for known networks.
 */
const findBuiltInChain = (chainId: number): Chain | undefined => {
  // Search through viem's exported chains for a matching chainId
  for (const chain of Object.values(chains)) {
    if (
      chain &&
      typeof chain === 'object' &&
      'id' in chain &&
      chain.id === chainId
    ) {
      return chain as Chain;
    }
  }
  return undefined;
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

const normalizeSignableMessage = (
  message: SignableMessage
): string | Uint8Array => {
  if (typeof message === 'string') {
    return message;
  }

  if ('raw' in message) {
    return message.raw as string | Uint8Array;
  }

  return message as string;
};

const createViemWalletClientFromSigner = async ({
  signer,
  chain,
  transport,
  address,
}: {
  signer: LocalEoaSigner;
  chain: Chain;
  transport: Transport;
  address?: string | null;
}): Promise<WalletClient> => {
  const resolvedAddress =
    address ?? (signer.getAddress ? await signer.getAddress() : null);

  if (!resolvedAddress) {
    throw new Error(
      'LocalEoaSigner must expose getAddress() or an address must be provided'
    );
  }

  const account = toAccount({
    address: resolvedAddress as `0x${string}`,
    async signMessage({ message }: { message: SignableMessage }) {
      const result = await signer.signMessage(
        normalizeSignableMessage(message)
      );
      return result as `0x${string}`;
    },
    async signTypedData(payload) {
      if (!signer.signTypedData) {
        throw new Error('Signer does not support signTypedData()');
      }
      const result = await signer.signTypedData({
        domain: payload.domain as Record<string, unknown>,
        message: payload.message as Record<string, unknown>,
        primaryType: payload.primaryType,
        types: payload.types as Record<
          string,
          Array<{ name: string; type: string }>
        >,
      });
      return result as `0x${string}`;
    },
    async signTransaction(transaction) {
      if (!signer.signTransaction) {
        throw new Error('Signer does not support signTransaction()');
      }
      return signer.signTransaction({
        to: transaction.to ?? null,
        value: transaction.value,
        data: transaction.data,
        gas: transaction.gas,
        gasPrice: transaction.gasPrice,
        nonce: transaction.nonce,
        chainId: transaction.chainId,
      });
    },
  });

  const client = createWalletClient({
    account,
    chain,
    transport,
  });

  return client as WalletClient;
};

const normalizePrivateKey = (key: string): `0x${string}` => {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error('privateKey must be a non-empty string');
  }
  return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as `0x${string}`;
};

export const createPrivateKeySigner = (privateKey: string): LocalEoaSigner => {
  const account = privateKeyToAccount(normalizePrivateKey(privateKey));

  return {
    async signMessage(message) {
      const payload =
        typeof message === 'string'
          ? { message }
          : { message: { raw: message } };
      return account.signMessage(
        payload as Parameters<typeof account.signMessage>[0]
      );
    },
    async signTypedData(payload: TypedDataPayload) {
      return account.signTypedData({
        domain: payload.domain,
        message: payload.message,
        types: payload.types,
        primaryType: payload.primaryType,
      });
    },
    async signTransaction(transaction) {
      return account.signTransaction(transaction);
    },
    async getAddress() {
      return account.address;
    },
  };
};
