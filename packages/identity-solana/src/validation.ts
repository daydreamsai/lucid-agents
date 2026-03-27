import type { BrowserWalletAdapter, IdentitySolanaConfig } from "./types";

export interface ValidationOptions {
  requireRegistrationFields?: boolean;
  requireSigner?: boolean;
}

function isByte(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

function parsePrivateKeyString(value: string): number[] {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("SOLANA_PRIVATE_KEY is empty.");
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error("SOLANA_PRIVATE_KEY JSON must be an array of numbers.");
    }
    return parsed;
  }

  return trimmed.split(",").map((part) => Number(part.trim()));
}

export function parseSolanaPrivateKey(input: unknown): Uint8Array | undefined {
  if (input == null) return undefined;
  if (input instanceof Uint8Array) return input;
  if (Array.isArray(input)) {
    if (!input.every(isByte)) {
      throw new Error("Solana private key array must contain bytes (0-255).");
    }
    return new Uint8Array(input);
  }
  if (typeof input === "string") {
    const parsed = parsePrivateKeyString(input);
    if (!parsed.every(isByte)) {
      throw new Error("Solana private key string must decode to bytes (0-255).");
    }
    return new Uint8Array(parsed);
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) {
    return new Uint8Array(input);
  }
  throw new Error("Unsupported private key format. Use Uint8Array, number[] or JSON array string.");
}

export function coercePublicKeyString(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const obj = value as { toBase58?: () => string; toString?: () => string };
    if (typeof obj.toBase58 === "function") {
      const base58 = obj.toBase58();
      if (typeof base58 === "string" && base58.length > 0) return base58;
    }
    if (typeof obj.toString === "function") {
      const asString = obj.toString();
      if (typeof asString === "string" && asString.length > 0 && asString !== "[object Object]") {
        return asString;
      }
    }
  }
  return undefined;
}

export function hasWalletLikeSigner(wallet?: BrowserWalletAdapter): boolean {
  if (!wallet) return false;
  return Boolean(wallet.publicKey || wallet.signTransaction || wallet.sendTransaction);
}

export function hasSigner(config: Partial<IdentitySolanaConfig>): boolean {
  return Boolean(config.privateKey || hasWalletLikeSigner(config.wallet));
}

export function isBrowserWallet(config: Partial<IdentitySolanaConfig>): boolean {
  return !config.privateKey && hasWalletLikeSigner(config.wallet);
}

export function normalizeIdentitySolanaConfig(
  input: Partial<IdentitySolanaConfig> = {}
): IdentitySolanaConfig {
  const privateKey = parseSolanaPrivateKey(input.privateKey);
  const normalized: IdentitySolanaConfig = {
    cluster: input.cluster ?? "mainnet-beta",
    rpcUrl: input.rpcUrl,
    privateKey,
    wallet: input.wallet,
    agentDomain: input.agentDomain,
    registerIdentity: input.registerIdentity ?? false,
    pinataJwt: input.pinataJwt,
    atomEnabled: input.atomEnabled ?? false,
    skipSend: input.skipSend
  };

  if (normalized.skipSend == null && isBrowserWallet(normalized)) {
    normalized.skipSend = true;
  }

  return normalized;
}

export function validateIdentitySolanaConfig(
  config: IdentitySolanaConfig,
  options: ValidationOptions = {}
): void {
  if (!config.cluster) {
    throw new Error("Solana cluster is required.");
  }

  if (config.privateKey && config.privateKey.length !== 32 && config.privateKey.length !== 64) {
    throw new Error("Solana private key must be 32-byte seed or 64-byte secret key.");
  }

  if (config.rpcUrl) {
    try {
      const url = new URL(config.rpcUrl);
      if (!/^https?:$/i.test(url.protocol)) {
        throw new Error("RPC URL must use http or https.");
      }
    } catch (error) {
      throw new Error(
        `Invalid SOLANA_RPC_URL: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const requireRegistration = options.requireRegistrationFields ?? false;
  const requireSigner = options.requireSigner ?? requireRegistration;

  if (requireRegistration && !config.agentDomain) {
    throw new Error("agentDomain is required to register Solana identity.");
  }

  if (requireSigner && !hasSigner(config)) {
    throw new Error("A signer is required: provide SOLANA_PRIVATE_KEY or a browser wallet adapter.");
  }
}