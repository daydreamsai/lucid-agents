/**
 * Circle Gateway configuration options.
 */
export interface CircleGatewayConfig {
  /**
   * Circle Gateway facilitator URL.
   * Defaults to Circle's production Gateway.
   */
  facilitatorUrl?: string;

  /**
   * Supported chain name for Gateway operations.
   * Maps to CAIP-2 chain identifiers internally.
   * @default 'base'
   */
  chain?: string;
}

/**
 * Options for creating a Gateway-enabled fetch function.
 */
export interface GatewayFetchOptions {
  /** Hex-encoded private key for signing payments */
  privateKey: string;
  /** Chain name (e.g., 'base', 'base-sepolia') */
  chain?: string;
}

/**
 * Options for depositing USDC into Circle Gateway.
 */
export interface GatewayDepositOptions {
  /** Hex-encoded private key */
  privateKey: string;
  /** Amount in USDC (e.g., '10.00') */
  amount: string;
  /** Chain name (e.g., 'base', 'base-sepolia') */
  chain?: string;
}

/**
 * Result of a Gateway deposit operation.
 */
export interface GatewayDepositResult {
  /** Transaction hash of the deposit */
  depositTxHash: string;
  /** Optional approval transaction hash */
  approvalTxHash?: string;
  /** Amount deposited (formatted) */
  amount: string;
  /** Depositor address */
  depositor: string;
}
