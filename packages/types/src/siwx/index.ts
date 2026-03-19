/**
 * SIWX (Sign-In With X) configuration for the payments extension.
 */
export type SIWxConfig = {
  /** Enable SIWX globally */
  enabled: boolean;
  /** Default statement shown to users when signing */
  defaultStatement?: string;
  /** Default expiration in seconds for SIWX payloads */
  expirationSeconds?: number;
  /** Storage configuration for entitlements and nonces */
  storage?: SIWxStorageConfig;
  /** Verification options */
  verify?: SIWxVerifyConfig;
};

/**
 * Per-entrypoint SIWX configuration.
 */
export type SIWxEntrypointConfig = {
  /** Enable SIWX for this entrypoint (paid-route reuse) */
  enabled?: boolean;
  /** Enable auth-only mode (no payment required, just wallet auth) */
  authOnly?: boolean;
  /** Custom statement for this entrypoint */
  statement?: string;
  /** Override network/chain for this entrypoint */
  network?: string;
};

/**
 * Storage config for SIWX state.
 */
export type SIWxStorageConfig = {
  type: 'sqlite' | 'in-memory' | 'postgres';
  sqlite?: {
    dbPath?: string;
  };
  postgres?: {
    connectionString: string;
  };
};

/**
 * Verification options for SIWX.
 */
export type SIWxVerifyConfig = {
  /** RPC URL for EVM smart wallet verification */
  evmRpcUrl?: string;
  /** Skip cryptographic signature verification (for testing only — NOT for production) */
  skipSignatureVerification?: boolean;
};

/**
 * Auth context provided to handlers on successful SIWX verification.
 */
export type AgentAuthContext = {
  scheme: 'siwx';
  address: string;
  chainId: string;
  grantedBy: 'entitlement' | 'auth-only';
  payload: Record<string, unknown>;
};

/**
 * SIWX entitlement record stored in the database.
 */
export type SIWxEntitlementRecord = {
  id?: number;
  resource: string;
  address: string;
  chainId?: string | null;
  paymentNetwork?: string | null;
  paidAt: number;
  lastUsedAt?: number | null;
};

/**
 * SIWX nonce record stored in the database.
 */
export type SIWxNonceRecord = {
  id?: number;
  nonce: string;
  resource?: string | null;
  address?: string | null;
  usedAt: number;
  expiresAt?: number | null;
};

/**
 * Storage interface for SIWX entitlements and nonces.
 */
export interface SIWxStorage {
  /** Check if a wallet has paid for a resource */
  hasPaid(resource: string, address: string): Promise<boolean>;
  /** Record that a wallet has paid for a resource */
  recordPayment(
    resource: string,
    address: string,
    chainId?: string
  ): Promise<void>;
  /** Check if a nonce has been used (replay prevention) */
  hasUsedNonce(nonce: string): Promise<boolean>;
  /** Record a used nonce */
  recordNonce(
    nonce: string,
    metadata?: { resource?: string; address?: string; expiresAt?: number }
  ): Promise<void>;
  /** Clear all SIWX data (for testing) */
  clear(): Promise<void>;
}
