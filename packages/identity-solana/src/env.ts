import type { IdentitySolanaConfig } from "./types";
import { defaultRpcUrlForCluster, parseBooleanEnv, parsePrivateKeyEnv, readRuntimeEnv } from "./utils";

function isDomainLike(value: string): boolean {
  const normalized = value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
  try {
    const url = new URL(normalized);
    return Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeIdentitySolanaConfig(config: IdentitySolanaConfig = {}): IdentitySolanaConfig {
  const cluster = config.cluster ?? "mainnet-beta";
  const rpcUrl = config.rpcUrl ?? defaultRpcUrlForCluster(cluster);

  const next: IdentitySolanaConfig = {
    ...config,
    cluster,
    rpcUrl
  };

  if (next.walletAdapter && !next.privateKey && next.skipSend === undefined) {
    next.skipSend = true;
  }

  if (next.registerIdentity === undefined) {
    next.registerIdentity = false;
  }

  if (next.atomEnabled === undefined) {
    next.atomEnabled = false;
  }

  return validateIdentitySolanaConfig(next);
}

export function validateIdentitySolanaConfig(config: IdentitySolanaConfig): IdentitySolanaConfig {
  if (config.privateKey) {
    if (!Array.isArray(config.privateKey) || config.privateKey.length === 0) {
      throw new Error("Identity Solana config: privateKey must be a non-empty number array.");
    }
    for (const value of config.privateKey) {
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new Error("Identity Solana config: privateKey must contain byte integers in range 0-255.");
      }
    }
  }

  if (config.domain && !isDomainLike(config.domain)) {
    throw new Error(`Identity Solana config: invalid AGENT_DOMAIN value "${config.domain}".`);
  }

  if (config.registerIdentity && !config.privateKey && !config.walletAdapter) {
    throw new Error("Identity Solana config: registerIdentity requires SOLANA_PRIVATE_KEY or walletAdapter.");
  }

  if (config.skipSend === undefined && config.walletAdapter && !config.privateKey) {
    config.skipSend = true;
  }

  return config;
}

export function identitySolanaFromEnv(env: Record<string, string | undefined> = readRuntimeEnv()): IdentitySolanaConfig {
  const cluster = (env.SOLANA_CLUSTER ?? "mainnet-beta").trim();
  const privateKey = parsePrivateKeyEnv(env.SOLANA_PRIVATE_KEY);

  const config: IdentitySolanaConfig = {
    privateKey,
    cluster,
    rpcUrl: env.SOLANA_RPC_URL?.trim() || undefined,
    domain: env.AGENT_DOMAIN?.trim() || undefined,
    registerIdentity: parseBooleanEnv(env.REGISTER_IDENTITY, false),
    pinataJwt: env.PINATA_JWT?.trim() || undefined,
    atomEnabled: parseBooleanEnv(env.ATOM_ENABLED, false)
  };

  return normalizeIdentitySolanaConfig(config);
}