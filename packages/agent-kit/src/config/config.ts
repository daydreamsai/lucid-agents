import type { SolanaAddress } from '@lucid-agents/agent-kit-payments';
import type { Network, Resource } from 'x402/types';

export type PaymentDefaultsConfig = {
  facilitatorUrl?: Resource;
  payTo?: `0x${string}` | SolanaAddress;
  network?: Network;
  defaultPrice?: string;
};

export type WalletConfig = {
  walletApiUrl?: string;
  maxPaymentBaseUnits?: bigint;
  maxPaymentUsd?: number;
};

export type AgentKitConfig = {
  payments?: PaymentDefaultsConfig;
  wallet?: WalletConfig;
};

export type ResolvedAgentKitConfig = {
  payments: {
    facilitatorUrl?: Resource;
    payTo?: `0x${string}` | SolanaAddress;
    network?: Network;
    defaultPrice?: string;
  };
  wallet: {
    walletApiUrl: string;
    maxPaymentBaseUnits?: bigint;
    maxPaymentUsd?: number;
  };
};

// Security: Payment defaults are NOT set to prevent accidental misconfiguration.
// Users MUST explicitly set PAYMENTS_RECEIVABLE_ADDRESS, FACILITATOR_URL, and NETWORK.
const DEFAULT_WALLET_API_URL = 'http://localhost:8787';

const defaultConfig: ResolvedAgentKitConfig = {
  payments: {
    facilitatorUrl: undefined,
    payTo: undefined,
    network: undefined,
    defaultPrice: undefined,
  },
  wallet: {
    walletApiUrl: DEFAULT_WALLET_API_URL,
    maxPaymentBaseUnits: undefined,
    maxPaymentUsd: undefined,
  },
};

function parseBigIntEnv(value: string | undefined): bigint | undefined {
  if (!value) return undefined;
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseNumberEnv(value: string | undefined): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric;
}

const environmentConfig: AgentKitConfig = {
  payments: {
    facilitatorUrl: process.env.FACILITATOR_URL as Resource | undefined,
    payTo: process.env.PAYMENTS_RECEIVABLE_ADDRESS as
      | `0x${string}`
      | SolanaAddress
      | undefined,
    network: process.env.NETWORK as Network | undefined,
    defaultPrice: process.env.DEFAULT_PRICE ?? undefined,
  },
  wallet: {
    walletApiUrl:
      process.env.LUCID_API_URL ?? process.env.VITE_API_URL ?? undefined,
    maxPaymentBaseUnits: parseBigIntEnv(
      process.env.AGENT_WALLET_MAX_PAYMENT_BASE_UNITS
    ),
    maxPaymentUsd: parseNumberEnv(process.env.AGENT_WALLET_MAX_PAYMENT_USDC),
  },
};

let runtimeOverrides: AgentKitConfig = {};
let activeInstanceConfig: AgentKitConfig | undefined;

function assignDefined<T extends Record<string, any>>(
  target: T,
  source: Partial<T> | undefined
) {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      target[key as keyof T] = value as T[keyof T];
    }
  }
}

function applyOverrides(
  base: ResolvedAgentKitConfig,
  overrides?: AgentKitConfig
): ResolvedAgentKitConfig {
  if (!overrides) return base;
  const next: ResolvedAgentKitConfig = {
    payments: { ...base.payments },
    wallet: { ...base.wallet },
  };
  assignDefined(next.payments, overrides.payments);
  assignDefined(next.wallet, overrides.wallet);
  return next;
}

function mergeRuntimeOverrides(
  current: AgentKitConfig,
  overrides: AgentKitConfig
): AgentKitConfig {
  const merged: AgentKitConfig = {
    payments: { ...(current.payments ?? {}) },
    wallet: { ...(current.wallet ?? {}) },
  };
  assignDefined(merged.payments!, overrides.payments);
  assignDefined(merged.wallet!, overrides.wallet);
  if (merged.payments && Object.keys(merged.payments).length === 0) {
    delete merged.payments;
  }
  if (merged.wallet && Object.keys(merged.wallet).length === 0) {
    delete merged.wallet;
  }
  return merged;
}

export function configureAgentKit(overrides: AgentKitConfig) {
  runtimeOverrides = mergeRuntimeOverrides(runtimeOverrides, overrides);
}

export function resetAgentKitConfigForTesting() {
  runtimeOverrides = {};
  activeInstanceConfig = undefined;
}

export function getAgentKitConfig(
  instanceConfig?: AgentKitConfig
): ResolvedAgentKitConfig {
  const withEnv = applyOverrides(defaultConfig, environmentConfig);
  const withRuntime = applyOverrides(withEnv, runtimeOverrides);
  // Instance config takes highest priority, scoped to this specific call
  return applyOverrides(withRuntime, instanceConfig);
}

export const defaults = {
  walletApiUrl: DEFAULT_WALLET_API_URL,
} as const;

export function setActiveInstanceConfig(config?: AgentKitConfig) {
  activeInstanceConfig = config;
}

export function getActiveInstanceConfig(): AgentKitConfig | undefined {
  return activeInstanceConfig;
}
