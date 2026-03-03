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
 * Returns null if not set, invalid JSON, not an array, or contains out-of-range values.
 * Every element must be a finite integer in [0, 255].
 */
export function parseSolanaPrivateKey(
  raw: string | undefined
): Uint8Array | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    if (
      !arr.every(
        v =>
          typeof v === 'number' &&
          Number.isInteger(v) &&
          Number.isFinite(v) &&
          v >= 0 &&
          v <= 255
      )
    ) {
      return null;
    }
    return new Uint8Array(arr);
  } catch {
    return null;
  }
}

/**
 * Resolve autoRegister from options and env, defaulting to true.
 * Uses strict presence check (not truthiness) so `REGISTER_IDENTITY=false` is honoured.
 */
export function resolveAutoRegister(
  options: { autoRegister?: boolean },
  env?: Record<string, string | undefined>
): boolean {
  if (options.autoRegister !== undefined) return options.autoRegister;
  // Strict presence check: falsy values like "" and "false" must still be read
  const envVal =
    typeof env === 'object' && env !== null && 'REGISTER_IDENTITY' in env
      ? env.REGISTER_IDENTITY
      : typeof process !== 'undefined'
        ? process.env?.REGISTER_IDENTITY
        : undefined;
  if (envVal !== undefined) return parseBoolean(envVal, true);
  return true;
}

/**
 * Validate that a Solana identity config has the required fields.
 * Throws a descriptive error if domain is set but no private key is available,
 * because on-chain registration requires signing.
 */
export function validateSolanaIdentityConfig(
  options: { privateKey?: Uint8Array; cluster?: string; domain?: string },
  env?: Record<string, string | undefined>
): void {
  const hasPrivateKey =
    options.privateKey != null ||
    Boolean(env?.SOLANA_PRIVATE_KEY) ||
    Boolean(typeof process !== 'undefined' && process.env?.SOLANA_PRIVATE_KEY);

  if (!hasPrivateKey && options.domain) {
    throw new Error(
      '[identity-solana] SOLANA_PRIVATE_KEY is required when a domain is provided ' +
        'because on-chain registration requires transaction signing. ' +
        'Set options.privateKey or the SOLANA_PRIVATE_KEY environment variable.'
    );
  }
}

/**
 * Narrow a SolanaIdentityConfig to confirm it has what's needed for registration.
 */
export function hasRegistrationCapability(
  config: SolanaIdentityConfig
): boolean {
  return Boolean(config.privateKey);
}
