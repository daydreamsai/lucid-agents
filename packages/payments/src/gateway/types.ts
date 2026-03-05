/**
 * Circle Gateway integration types for @lucid-agents/payments.
 *
 * @see https://developers.circle.com/gateway/nanopayments
 */

/**
 * Supported chain names for Circle Gateway.
 */
export type CircleGatewayChain =
  | 'arcTestnet'
  | 'base'
  | 'baseSepolia'
  | 'arbitrum'
  | 'arbitrumSepolia'
  | 'avalanche'
  | 'avalancheFuji'
  | 'mainnet'
  | 'optimism'
  | 'optimismSepolia'
  | 'polygon'
  | 'polygonAmoy'
  | 'sepolia';

/**
 * Configuration for the Circle Gateway facilitator (seller-side).
 *
 * Used when an agent wants to accept gasless batched payments via
 * Circle Gateway instead of the standard Daydreams facilitator.
 */
export type CircleGatewayConfig = {
  /** Circle Gateway URL. Defaults to https://gateway.circle.com */
  gatewayUrl?: string;
  /** Optional API key for authenticated Circle Gateway access */
  apiKey?: string;
};

/**
 * Options for creating a gateway-enabled fetch function (buyer-side).
 *
 * The fetch function automatically handles 402 responses by paying with
 * Circle Gateway batched payments — gasless for the buyer.
 */
export type GatewayFetchOptions = {
  /** Private key (hex, 0x-prefixed) for signing payment authorizations */
  privateKey: `0x${string}`;
  /** Chain to use for Gateway deposits and payments */
  chain: CircleGatewayChain;
  /** Optional underlying fetch implementation */
  fetchImpl?: typeof fetch;
};

/**
 * Result of a Gateway deposit operation.
 */
export type GatewayDepositResult = {
  /** Transaction hash of the approval transaction (if approval was needed) */
  approvalTxHash?: `0x${string}`;
  /** Transaction hash of the deposit transaction */
  depositTxHash: `0x${string}`;
  /** Amount deposited in USDC atomic units (6 decimals) */
  amount: bigint;
  /** Human-readable formatted amount */
  formattedAmount: string;
  /** Depositor wallet address */
  depositor: `0x${string}`;
};
