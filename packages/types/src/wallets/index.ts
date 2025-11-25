/**
 * Wallet metadata describing wallet properties and capabilities.
 */
export interface WalletMetadata {
  id?: string | null;
  address?: string | null;
  chain?: string | null;
  chainType?: string | null;
  provider?: string | null;
  accountId?: string | null;
  label?: string | null;
  caip2?: string | null;
}

/**
 * Interface for signing challenge messages used in wallet authentication.
 */
export interface ChallengeSigner {
  signChallenge(challenge: {
    id: string;
    credential_id?: string | null;
    payload?: unknown;
    payload_hash?: string | null;
    nonce: string;
    scopes?: string[];
    issued_at: string | Date;
    expires_at: string | Date;
    server_signature?: string | null;
  }): Promise<string>;
}

/**
 * Core wallet connector interface that handles wallet operations and challenge signing.
 */
export interface WalletConnector extends ChallengeSigner {
  getWalletMetadata(): Promise<WalletMetadata | null>;
  supportsCaip2?(caip2: string): boolean | Promise<boolean>;
  getAddress?(): Promise<string | null>;
  getCapabilities?(): WalletCapabilities | null | undefined;
  getSigner?(): Promise<LocalEoaSigner | null>;
  getWalletClient?<TClient = unknown>(): Promise<TClient | null>;
}

/**
 * Optional capabilities a wallet connector can expose beyond the base surface.
 * `signer` indicates the connector can provide a `LocalEoaSigner`.
 * `walletClient` indicates the connector can provide a contract-ready wallet client (e.g., viem).
 */
export type WalletCapability = 'signer' | 'walletClient';

export type WalletCapabilities = Partial<Record<WalletCapability, true>>;


/**
 * Options for configuring local wallet metadata.
 */
export interface LocalWalletMetadataOptions {
  address?: string | null;
  caip2?: string | null;
  chain?: string | null;
  chainType?: string | null;
  provider?: string | null;
  label?: string | null;
  walletClient?: LocalWalletClientConfig | null;
}

export interface LocalWalletClientConfig {
  rpcUrl?: string | null;
  chainId?: number | null;
  chainName?: string | null;
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  } | null;
}

/**
 * Local wallet configuration using a private key.
 */
export type LocalWalletOptions = LocalWalletMetadataOptions & {
  type: 'local';
  privateKey: string;
};

/**
 * Wallet configuration using a custom signer.
 */
export type SignerWalletOptions = LocalWalletMetadataOptions & {
  type: 'signer';
  signer: LocalEoaSigner;
};

/**
 * Configuration for Lucid wallet connector (server-orchestrated wallet).
 */
export interface LucidWalletOptions {
  type: 'lucid';
  baseUrl: string;
  agentRef: string;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  headers?: HeadersInit;
  accessToken?: string | null;
  authorizationContext?: Record<string, unknown>;
}

/**
 * Configuration for thirdweb Engine server wallet connector.
 */
export interface ThirdwebWalletOptions {
  type: 'thirdweb';
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
 * Configuration for an agent wallet. Can be local (with private key), signer (with custom signer), Lucid (server-orchestrated), or thirdweb.
 */
export type AgentWalletConfig =
  | LocalWalletOptions
  | SignerWalletOptions
  | LucidWalletOptions
  | ThirdwebWalletOptions;

/**
 * Configuration for a developer wallet. Must be a local wallet with private key.
 */
export type DeveloperWalletConfig = LocalWalletMetadataOptions & {
  type: 'local';
  privateKey: string;
};

/**
 * Configuration for agent and developer wallets.
 */
export type WalletsConfig = {
  agent?: AgentWalletConfig;
  developer?: DeveloperWalletConfig;
};

/**
 * Interface for signing messages and transactions with an EOA (Externally Owned Account) wallet.
 */
export interface LocalEoaSigner {
  signMessage(message: string | Uint8Array): Promise<string>;
  signTypedData?(payload: {
    domain: Record<string, unknown>;
    primaryType: string;
    types: Record<string, Array<{ name: string; type: string }>>;
    message: Record<string, unknown>;
  }): Promise<string>;
  signTransaction?(transaction: {
    to?: `0x${string}` | null;
    value?: bigint;
    data?: `0x${string}`;
    gas?: bigint;
    gasPrice?: bigint;
    nonce?: number;
    chainId?: number;
  }): Promise<`0x${string}`>;
  getAddress?(): Promise<string | null>;
}

/**
 * Challenge structure used for wallet authentication and authorization.
 */
export interface AgentChallenge {
  id: string;
  credential_id?: string | null;
  payload?: unknown;
  payload_hash?: string | null;
  nonce: string;
  scopes?: string[];
  issued_at: string | Date;
  expires_at: string | Date;
  server_signature?: string | null;
}

/**
 * Response containing an agent challenge for wallet authentication.
 */
export interface AgentChallengeResponse {
  challenge: AgentChallenge;
}

/**
 * EIP-712 typed data payload for structured message signing.
 */
export type TypedDataPayload = {
  domain: Record<string, unknown>;
  primaryType: string;
  types: Record<string, Array<{ name: string; type: string }>>;
  message: Record<string, unknown>;
};

/**
 * Function type for executing HTTP fetch requests.
 */
export type FetchExecutor = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/**
 * Type of agent wallet implementation.
 */
export type AgentWalletKind = 'local' | 'signer' | 'lucid' | 'thirdweb';

/**
 * Handle to an agent wallet instance with its connector and optional access token management.
 * Agent wallets can be either local or Lucid (server-orchestrated).
 */
export interface AgentWalletHandle {
  kind: AgentWalletKind;
  connector: WalletConnector;
  setAccessToken?(token: string | null): void;
}

/**
 * Handle to a developer wallet instance.
 * Developer wallets are always local (private key-based) and do not support Lucid.
 */
export interface DeveloperWalletHandle {
  kind: 'local';
  connector: WalletConnector;
}

/**
 * Wallets runtime type.
 * Returned by AgentRuntime.wallets when wallets are configured.
 */
export type WalletsRuntime =
  | {
      agent?: AgentWalletHandle;
      developer?: DeveloperWalletHandle;
    }
  | undefined;
