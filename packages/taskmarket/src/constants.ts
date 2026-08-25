export const DEFAULT_TASKMARKET_API_URL = 'https://api.taskmarket.dev';
export const DEFAULT_TASKMARKET_APP_URL = 'https://taskmarket.dev';

/** Canonical USDC on Base mainnet. */
export const BASE_USDC_ADDRESS =
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

export const BASE_CHAIN_ID = 8453;
export const BASE_CAIP2 = 'eip155:8453' as const;
export const BASE_NETWORK_NAME = 'Base' as const;

/** Accept/reject API fee documented by Taskmarket, in USDC base units. */
export const TASKMARKET_API_FEE_BASE_UNITS = 1000n;

export const USDC_DECIMALS = 6;

export const USER_AGENT = 'lucid-agents-taskmarket/0.1.0';
