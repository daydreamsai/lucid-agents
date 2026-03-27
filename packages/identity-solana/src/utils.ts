import { clusterApiUrl } from "@solana/web3.js";
import type { AnyRecord, SolanaCluster } from "./types";

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

export function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

export function parsePrivateKeyEnv(value: string | undefined): number[] | undefined {
  if (!value || value.trim().length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("SOLANA_PRIVATE_KEY must be a valid JSON array.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("SOLANA_PRIVATE_KEY must be a non-empty JSON array.");
  }

  if (!parsed.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255)) {
    throw new Error("SOLANA_PRIVATE_KEY must contain integer byte values in range 0-255.");
  }

  return parsed as number[];
}

export function defaultRpcUrlForCluster(cluster: SolanaCluster): string {
  const known = new Set<SolanaCluster>(["mainnet-beta", "devnet", "testnet"]);
  if (known.has(cluster)) {
    return clusterApiUrl(cluster as "mainnet-beta" | "devnet" | "testnet");
  }
  return clusterApiUrl("mainnet-beta");
}

export function toBase58String(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "toBase58" in value && typeof (value as { toBase58?: unknown }).toBase58 === "function") {
    return ((value as { toBase58: () => string }).toBase58() || "").trim() || undefined;
  }
  return undefined;
}

export function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null;
}

export function mergeTrust(existing: unknown, incoming: unknown): unknown {
  if (incoming == null) return existing;
  if (existing == null) return incoming;

  if (Array.isArray(existing)) {
    return Array.isArray(incoming) ? [...existing, ...incoming] : [...existing, incoming];
  }

  if (Array.isArray(incoming)) {
    return [existing, ...incoming];
  }

  if (isRecord(existing) && isRecord(incoming)) {
    return { ...existing, ...incoming };
  }

  return incoming;
}

export function readRuntimeEnv(): Record<string, string | undefined> {
  const maybeProcess = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  return maybeProcess.process?.env ?? {};
}