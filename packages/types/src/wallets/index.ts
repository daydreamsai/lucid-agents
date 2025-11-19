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
}

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
}

/**
 * Local wallet configuration using a private key.
 */
export type LocalWalletWithPrivateKeyOptions = LocalWalletMetadataOptions & {
  type: 'local';
  privateKey: string;
  signer?: never;
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
 * Configuration for an agent wallet. Can be local (with private key) or Lucid (server-orchestrated).
 */
export type AgentWalletConfig =
  | LocalWalletWithPrivateKeyOptions
  | LucidWalletOptions;

/**
 * Configuration for a developer wallet. Must be a local wallet with private key.
 */
export type DeveloperWalletConfig = LocalWalletWithPrivateKeyOptions;

/**
 * Configuration for agent and developer wallets.
 */
export type WalletsConfig = {
  agent?: AgentWalletConfig;
  developer?: DeveloperWalletConfig;
};

/**
 * Local wallet configuration using a custom signer implementation.
 */
export type LocalWalletWithSignerOptions = LocalWalletMetadataOptions & {
  type: 'local';
  signer: LocalEoaSigner;
  privateKey?: never;
};

/**
 * Local wallet configuration options. Can use either a private key or a custom signer.
 */
export type LocalWalletOptions =
  | LocalWalletWithSignerOptions
  | LocalWalletWithPrivateKeyOptions;

/**
 * Options for creating an agent wallet. Supports both local and Lucid wallet types.
 */
export type AgentWalletFactoryOptions = LocalWalletOptions | LucidWalletOptions;

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
export type AgentWalletKind = 'local' | 'lucid';

/**
 * Handle to an agent wallet instance with its connector and optional access token management.
 */
export interface AgentWalletHandle {
  kind: AgentWalletKind;
  connector: WalletConnector;
  setAccessToken?(token: string | null): void;
}

/**
 * Wallets runtime type.
 * Returned by AgentRuntime.wallets when wallets are configured.
 */
export type WalletsRuntime =
  | {
      agent?: AgentWalletHandle;
      developer?: AgentWalletHandle;
    }
  | undefined;
