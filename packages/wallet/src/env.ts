import type {
  AgentWalletConfig,
  DeveloperWalletConfig,
  LocalWalletClientConfig,
  LocalWalletOptions,
  LucidWalletOptions,
  ThirdwebWalletOptions,
  WalletsConfig,
} from '@lucid-agents/types/wallets';

type EnvRecord = Record<string, string | undefined>;

const DEFAULT_ENV: EnvRecord =
  typeof process !== 'undefined' && process.env
    ? (process.env as EnvRecord)
    : {};

const hasWallets = (
  wallets: WalletsConfig | undefined
): wallets is WalletsConfig => Boolean(wallets?.agent || wallets?.developer);

export function walletsFromEnv(
  overrides?: WalletsConfig,
  env: EnvRecord = DEFAULT_ENV
): WalletsConfig | undefined {
  const envWallets = resolveWalletsFromEnv(env);
  const merged: WalletsConfig = {};

  if (envWallets?.agent) {
    merged.agent = envWallets.agent;
  }
  if (envWallets?.developer) {
    merged.developer = envWallets.developer;
  }

  if (overrides?.agent) {
    merged.agent = overrides.agent;
  }
  if (overrides?.developer) {
    merged.developer = overrides.developer;
  }

  return hasWallets(merged) ? merged : undefined;
}

export function resolveWalletsFromEnv(
  env?: EnvRecord
): WalletsConfig | undefined {
  if (!env) return undefined;
  const agent = env.AGENT_WALLET_TYPE
    ? resolveAgentWalletFromEnv(env)
    : undefined;
  const developer = resolveDeveloperWalletFromEnv(env);
  if (!agent && !developer) {
    return undefined;
  }
  const wallets: WalletsConfig = {};
  if (agent) {
    wallets.agent = agent;
  }
  if (developer) {
    wallets.developer = developer;
  }
  return wallets;
}

export function resolveAgentWalletFromEnv(
  env: EnvRecord
): AgentWalletConfig | undefined {
  const type = env.AGENT_WALLET_TYPE?.toLowerCase();

  if (!type) {
    throw new Error(
      'AGENT_WALLET_TYPE environment variable is required. Set it to "local", "thirdweb", or "lucid".'
    );
  }

  if (type === 'local') {
    return parseLocalWalletFromEnv(env);
  }
  if (type === 'thirdweb') {
    return parseThirdwebWalletFromEnv(env);
  }
  if (type === 'lucid') {
    return parseLucidWalletFromEnv(env);
  }

  throw new Error(
    `Invalid AGENT_WALLET_TYPE: "${type}". Must be one of: "local", "thirdweb", "lucid".`
  );
}

function parseLocalWalletFromEnv(
  env: EnvRecord
): LocalWalletOptions | undefined {
  const privateKey = env.AGENT_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    if (env.AGENT_WALLET_TYPE?.toLowerCase() === 'local') {
      throw new Error(
        'AGENT_WALLET_PRIVATE_KEY environment variable is required when AGENT_WALLET_TYPE=local. ' +
          'Set AGENT_WALLET_PRIVATE_KEY to your wallet private key (0x-prefixed hex string).'
      );
    }
    return undefined;
  }

  return {
    type: 'local',
    privateKey,
    ...extractLocalMetadata(env, 'AGENT_WALLET_'),
  };
}

function parseThirdwebWalletFromEnv(
  env: EnvRecord
): ThirdwebWalletOptions | undefined {
  const secretKey = env.AGENT_WALLET_SECRET_KEY;
  const clientId = env.AGENT_WALLET_CLIENT_ID;
  const walletLabel = env.AGENT_WALLET_LABEL ?? 'agent-wallet';
  const chainIdStr = env.AGENT_WALLET_CHAIN_ID ?? '84532';

  if (!secretKey) {
    if (env.AGENT_WALLET_TYPE?.toLowerCase() === 'thirdweb') {
      throw new Error(
        'AGENT_WALLET_SECRET_KEY environment variable is required when AGENT_WALLET_TYPE=thirdweb. ' +
          'Set AGENT_WALLET_SECRET_KEY to your thirdweb Engine secret key.'
      );
    }
    return undefined;
  }

  const chainId = parseInt(chainIdStr, 10);
  if (isNaN(chainId)) {
    if (env.AGENT_WALLET_TYPE?.toLowerCase() === 'thirdweb') {
      throw new Error(
        `Invalid AGENT_WALLET_CHAIN_ID: "${chainIdStr}". Must be a valid integer. ` +
          'Set AGENT_WALLET_CHAIN_ID to a valid chain ID (e.g., 84532 for Base Sepolia).'
      );
    }
    return undefined;
  }

  return {
    type: 'thirdweb',
    secretKey,
    clientId,
    walletLabel,
    chainId,
    ...extractThirdwebMetadata(env),
  };
}

function parseLucidWalletFromEnv(
  env: EnvRecord
): LucidWalletOptions | undefined {
  const baseUrl =
    env.AGENT_WALLET_BASE_URL ??
    env.LUCID_BASE_URL ??
    env.LUCID_API_URL ??
    undefined;
  const agentRef = env.AGENT_WALLET_AGENT_REF;

  if (env.AGENT_WALLET_TYPE?.toLowerCase() === 'lucid') {
    const missing: string[] = [];
    if (!baseUrl) {
      missing.push(
        'AGENT_WALLET_BASE_URL (or LUCID_BASE_URL or LUCID_API_URL)'
      );
    }
    if (!agentRef) {
      missing.push('AGENT_WALLET_AGENT_REF');
    }
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables for Lucid wallet: ${missing.join(', ')}. ` +
          'Set these environment variables to configure the Lucid wallet connector.'
      );
    }
  }

  if (!baseUrl || !agentRef) {
    return undefined;
  }

  const headers = parseHeaderRecord(env.AGENT_WALLET_HEADERS);
  const authorizationContext = parseJsonObject(
    env.AGENT_WALLET_AUTHORIZATION_CONTEXT
  );

  return {
    type: 'lucid',
    baseUrl,
    agentRef,
    headers,
    accessToken: env.AGENT_WALLET_ACCESS_TOKEN ?? undefined,
    authorizationContext,
  };
}

export function resolveDeveloperWalletFromEnv(
  env: EnvRecord
): DeveloperWalletConfig | undefined {
  const privateKey = env.DEVELOPER_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    return undefined;
  }
  return {
    type: 'local',
    privateKey,
    ...extractLocalMetadata(env, 'DEVELOPER_WALLET_'),
  };
}

function extractLocalMetadata(
  env: EnvRecord,
  prefix: string
): Partial<LocalWalletOptions> {
  const metadata: Partial<LocalWalletOptions> = {};
  const map: Record<string, keyof LocalWalletOptions> = {
    ADDRESS: 'address',
    CAIP2: 'caip2',
    CHAIN: 'chain',
    CHAIN_TYPE: 'chainType',
    PROVIDER: 'provider',
    LABEL: 'label',
  };

  for (const [envKey, targetKey] of Object.entries(map)) {
    const value = env[`${prefix}${envKey}`];
    if (value && value.trim()) {
      metadata[targetKey] = value.trim() as never;
    }
  }

  const walletClient = extractLocalWalletClientConfig(env, prefix);
  if (walletClient) {
    metadata.walletClient = walletClient;
  }

  return metadata;
}

function extractLocalWalletClientConfig(
  env: EnvRecord,
  prefix: string
): LocalWalletClientConfig | undefined {
  const rpcUrl = env[`${prefix}RPC_URL`]?.trim();
  const chainIdRaw = env[`${prefix}CHAIN_ID`]?.trim();
  const chainName = env[`${prefix}CHAIN_NAME`]?.trim();

  const config: LocalWalletClientConfig = {};
  if (rpcUrl) {
    config.rpcUrl = rpcUrl;
  }

  if (chainIdRaw) {
    const parsed = Number(chainIdRaw);
    if (!Number.isNaN(parsed)) {
      config.chainId = parsed;
    }
  }

  if (chainName) {
    config.chainName = chainName;
  }

  return Object.keys(config).length ? config : undefined;
}

function extractThirdwebMetadata(
  env: EnvRecord
): Partial<ThirdwebWalletOptions> {
  const metadata: Partial<ThirdwebWalletOptions> = {};
  const map: Record<string, keyof ThirdwebWalletOptions> = {
    ADDRESS: 'address',
    CAIP2: 'caip2',
    CHAIN: 'chain',
    CHAIN_TYPE: 'chainType',
    LABEL: 'label',
  };

  for (const [envKey, targetKey] of Object.entries(map)) {
    const value = env[`AGENT_WALLET_${envKey}`]?.trim();
    if (value) {
      metadata[targetKey] = value as never;
    }
  }

  return metadata;
}

function parseHeaderRecord(
  payload?: string
): Record<string, string> | undefined {
  if (!payload) return undefined;
  const parsed = parseJsonObject(payload);
  if (!parsed) return undefined;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    headers[key] = String(value);
  }
  return headers;
}

function parseJsonObject(
  payload?: string
): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return undefined;
}
