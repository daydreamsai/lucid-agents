import type { WalletClient } from 'viem';
import type {
  AgentChallengeResponse,
  TypedDataPayload,
  WalletConnector,
  WalletMetadata,
  WalletCapabilities,
} from '@lucid-agents/types/wallets';
import { normalizeChallenge, detectMessageEncoding } from './base-connector';

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

export interface ViemWalletConnectorOptions {
  walletClient: WalletClient;
  address?: string;
  caip2?: string | null;
  chain?: string | null;
  chainType?: string | null;
  provider?: string | null;
  label?: string | null;
}

export class ViemWalletConnector implements WalletConnector {
  private readonly walletClient: WalletClient;
  private readonly metadata: WalletMetadata;
  private readonly capabilities: WalletCapabilities = {
    walletClient: true,
  };

  constructor(options: ViemWalletConnectorOptions) {
    if (!options.walletClient.account) {
      throw new Error('WalletClient must have an account');
    }

    const accountAddress = options.walletClient.account.address;
    if (options.address && options.address.toLowerCase() !== accountAddress.toLowerCase()) {
      throw new Error(
        `Address mismatch: provided address (${options.address}) does not match wallet client account address (${accountAddress})`
      );
    }

    this.walletClient = options.walletClient;
    this.metadata = {
      address: accountAddress,
      caip2: options.caip2 ?? null,
      chain: options.chain ?? (this.walletClient.chain?.name ?? null),
      chainType: options.chainType ?? null,
      provider: options.provider ?? 'viem',
      label: options.label ?? null,
    };
  }

  async getWalletMetadata(): Promise<WalletMetadata | null> {
    return this.metadata;
  }

  async getWalletClient<TClient = WalletClient>(): Promise<TClient | null> {
    return this.walletClient as unknown as TClient;
  }

  async getAddress(): Promise<string | null> {
    return this.metadata.address ?? null;
  }

  async signChallenge(
    challenge: AgentChallengeResponse['challenge']
  ): Promise<string> {
    if (!this.walletClient.account) {
      throw new Error('WalletClient account is required for signing');
    }

    const normalized = normalizeChallenge(challenge);
    const typedData = extractTypedDataPayload(normalized.payload);

    if (typedData) {
      return this.walletClient.signTypedData({
        account: this.walletClient.account,
        domain: typedData.domain as Record<string, unknown>,
        types: typedData.types as Record<string, Array<{ name: string; type: string }>>,
        primaryType: typedData.primaryType,
        message: typedData.message as Record<string, unknown>,
      } as any);
    }

    const message = normalized.message ?? normalized.payloadHash;
    if (!message) {
      throw new Error(
        'Challenge payload does not include a signable message or payload hash'
      );
    }

    const messageForSigning = coerceMessageForSigning(message);
    return this.walletClient.signMessage({
      account: this.walletClient.account,
      message: messageForSigning as any,
    });
  }

  supportsCaip2(caip2: string): boolean {
    if (!caip2) return false;
    if (!this.metadata?.caip2) return true;
    return this.metadata.caip2.toLowerCase() === caip2.toLowerCase();
  }

  getCapabilities(): WalletCapabilities {
    return this.capabilities;
  }
}

