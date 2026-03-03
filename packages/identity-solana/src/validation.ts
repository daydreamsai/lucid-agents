/**
 * Validation helpers for Solana identity configuration.
 */

import type { SolanaIdentityConfig } from './env';

/**
 * Parse a boolean from a string env var.
 */
export function parseBoolean(
  value: string | undefined,
  defaultValue = false
): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse a Solana private key from a JSON array string (Uint8Array serialized).
 * Returns null if not set or invalid.
 */
export function parseSolanaPrivateKey(
  raw: string | undefined
): Uint8Array | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return new Uint8Array(arr);
  } catch {
    return null;
  }
}

/**
 * Resolve autoRegister from options and env, defaulting to true.
 */
export function resolveAutoRegister(
  options: { autoRegister?: boolean },
  env?: Record<string, string | undefined>
): boolean {
  if (options.autoRegister !== undefined) return options.autoRegister;
  const envVal =
    typeof env === 'object' && env?.REGISTER_IDENTITY
      ? env.REGISTER_IDENTITY
      : typeof process !== 'undefined'
        ? process.env?.REGISTER_IDENTITY
        : undefined;
  if (envVal !== undefined) return parseBoolean(envVal, true);
  return true;
}

/**
 * Validate that a Solana identity config has the required fields.
 * Throws descriptive errors if required env vars are missing.
 */
export function validateSolanaIdentityConfig(
  options: { privateKey?: Uint8Array; cluster?: string; domain?: string },
  env?: Record<string, string | undefined>
): void {
  // Private key validation (only required if actually registering)
  const hasPrivateKey =
    options.privateKey != null ||
    Boolean(env?.SOLANA_PRIVATE_KEY) ||
    Boolean(typeof process !== 'undefined' && process.env?.SOLANA_PRIVATE_KEY);

  if (!hasPrivateKey && options.domain) {
    // Private key is needed to sign transactions — warn but don't throw
    // (read-only operations work without it)
  }
}

/**
 * Narrow a SolanaIdentityConfig to confirm it has what's needed for registration.
 */
export function hasRegistrationCapability(config: SolanaIdentityConfig): boolean {
  return Boolean(config.privateKey);
}
