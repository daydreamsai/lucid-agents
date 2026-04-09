/**
 * TRC-8004 TRON Support — Address Conversion Utilities
 *
 * TRON addresses use base58check encoding with a 0x41 prefix byte.
 * Internally, TRON addresses are 21 bytes: 0x41 + 20-byte EVM address.
 * The base58check format starts with 'T' and is 34 characters long.
 *
 * This module converts between TRON base58 and EVM-compatible 0x hex formats
 * so that TRON addresses can be used with the existing lucid-agents type system.
 *
 * No external dependencies — base58check is implemented inline using SHA-256
 * from the Web Crypto API (available in Node.js 18+ and all modern browsers).
 */

import type { Hex } from '@lucid-agents/wallet';

// Base58 alphabet used by Bitcoin/TRON
const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const BASE58_MAP = new Uint8Array(128).fill(255);
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP[BASE58_ALPHABET.charCodeAt(i)] = i;
}

/**
 * Encode bytes to base58.
 */
function base58Encode(bytes: Uint8Array): string {
  // Count leading zeros
  let zeroes = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    zeroes++;
  }

  // Allocate enough space in big-endian base58 representation
  const size = (((bytes.length - zeroes) * 138) / 100 + 1) | 0;
  const b58 = new Uint8Array(size);

  let length = 0;
  for (let i = zeroes; i < bytes.length; i++) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
      carry += 256 * b58[k];
      b58[k] = carry % 58;
      carry = (carry / 58) | 0;
    }
    length = j;
  }

  // Skip leading zeros in base58 result
  const start = size - length;

  let result = '';
  for (let i = 0; i < zeroes; i++) {
    result += '1';
  }
  for (let i = start; i < size; i++) {
    result += BASE58_ALPHABET[b58[i]];
  }

  return result;
}

/**
 * Decode base58 string to bytes.
 */
function base58Decode(str: string): Uint8Array {
  if (str.length === 0) {
    return new Uint8Array(0);
  }

  // Count leading '1's (zeros in base58)
  let zeroes = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    zeroes++;
  }

  const size = (((str.length - zeroes) * 733) / 1000 + 1) | 0;
  const b256 = new Uint8Array(size);

  let length = 0;
  for (let i = zeroes; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    if (ch >= 128 || BASE58_MAP[ch] === 255) {
      throw new Error(`Invalid base58 character: ${str[i]}`);
    }
    let carry = BASE58_MAP[ch];
    let j = 0;
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
      carry += 58 * b256[k];
      b256[k] = carry % 256;
      carry = (carry / 256) | 0;
    }
    length = j;
  }

  const start = size - length;
  const result = new Uint8Array(zeroes + (size - start));
  // Leading zeros are already 0 in the result
  for (let i = start, j = zeroes; i < size; i++, j++) {
    result[j] = b256[i];
  }

  return result;
}

/**
 * SHA-256 hash via Web Crypto (SubtleCrypto).
 * Requires Node.js 18+ or a modern browser environment.
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  try {
    // Create a new ArrayBuffer copy to satisfy strict TypeScript BufferSource typing
    const buffer = new ArrayBuffer(data.length);
    new Uint8Array(buffer).set(data);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return new Uint8Array(hash);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`SHA-256 digest failed: ${message}`);
  }
}

/**
 * Base58check encode: payload → base58(payload + checksum)
 * where checksum = SHA256(SHA256(payload))[0..3]
 */
async function base58checkEncode(payload: Uint8Array): Promise<string> {
  const hash1 = await sha256(payload);
  const hash2 = await sha256(hash1);
  const checksum = hash2.slice(0, 4);

  const combined = new Uint8Array(payload.length + 4);
  combined.set(payload);
  combined.set(checksum, payload.length);

  return base58Encode(combined);
}

/**
 * Base58check decode: base58 string → payload (with checksum verification)
 */
async function base58checkDecode(str: string): Promise<Uint8Array> {
  const decoded = base58Decode(str);
  if (decoded.length < 5) {
    throw new Error('Invalid base58check: too short');
  }

  const payload = decoded.slice(0, decoded.length - 4);
  const checksum = decoded.slice(decoded.length - 4);

  const hash1 = await sha256(payload);
  const hash2 = await sha256(hash1);

  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== hash2[i]) {
      throw new Error('Invalid base58check: checksum mismatch');
    }
  }

  return payload;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd length');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert a TRON base58check address to EVM-compatible 0x hex format.
 *
 * TRON addresses are 21 bytes: 0x41 prefix + 20-byte address.
 * This strips the 0x41 prefix and returns `0x` + 20 bytes.
 *
 * @example
 * ```ts
 * const hex = await tronBase58ToHex('TFKNqk9bjwWp5uRiiGimqfLhVQB8jSxYi7');
 * // '0x...' (40-char hex)
 * ```
 */
export async function tronBase58ToHex(base58Address: string): Promise<Hex> {
  if (!isTronAddress(base58Address)) {
    throw new Error(
      `Invalid TRON address: must start with 'T' and be 34 characters. Got: ${base58Address}`
    );
  }

  const payload = await base58checkDecode(base58Address);

  if (payload.length !== 21) {
    throw new Error(
      `Invalid TRON address: expected 21 bytes (0x41 + 20), got ${payload.length}`
    );
  }

  if (payload[0] !== 0x41) {
    throw new Error(
      `Invalid TRON address: expected 0x41 prefix, got 0x${payload[0].toString(16)}`
    );
  }

  // Strip the 0x41 prefix, return as 0x-prefixed hex
  return `0x${bytesToHex(payload.slice(1))}` as Hex;
}

/**
 * Convert an EVM-compatible 0x hex address to TRON base58check format.
 *
 * Prepends the TRON 0x41 prefix and encodes with base58check.
 *
 * @example
 * ```ts
 * const base58 = await hexToTronBase58('0x1234...');
 * // 'T...' (34-char TRON address)
 * ```
 */
export async function hexToTronBase58(hexAddress: Hex): Promise<string> {
  const clean = hexAddress.startsWith('0x') ? hexAddress.slice(2) : hexAddress;

  if (clean.length !== 40) {
    throw new Error(
      `Invalid hex address: expected 40 hex characters, got ${clean.length}`
    );
  }

  if (!/^[0-9a-fA-F]{40}$/.test(clean)) {
    throw new Error('Invalid hex address: contains non-hex characters');
  }

  // Prepend TRON prefix byte (0x41)
  const addressBytes = hexToBytes(clean);
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(addressBytes, 1);

  return base58checkEncode(payload);
}

/**
 * Check if a string looks like a TRON base58check address.
 * TRON addresses start with 'T' and are 34 characters long.
 */
export function isTronAddress(address: string): boolean {
  return (
    typeof address === 'string' &&
    address.length === 34 &&
    address.startsWith('T')
  );
}

/**
 * Normalize a TRON address to EVM-compatible 0x hex format.
 * Accepts either base58 ('T...') or hex ('0x...') format.
 *
 * @example
 * ```ts
 * // Both return the same 0x hex address:
 * await normalizeTronAddress('TFKNqk9bjwWp5uRiiGimqfLhVQB8jSxYi7');
 * await normalizeTronAddress('0x1234...');
 * ```
 */
export async function normalizeTronAddress(address: string): Promise<Hex> {
  if (isTronAddress(address)) {
    return tronBase58ToHex(address);
  }

  // Already hex format
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return address.toLowerCase() as Hex;
  }

  // TRON hex without 0x prefix (41-prefixed)
  if (/^41[0-9a-fA-F]{40}$/.test(address)) {
    return `0x${address.slice(2).toLowerCase()}` as Hex;
  }

  throw new Error(
    `Invalid TRON address: expected base58 (T...) or hex (0x...) format. Got: ${address}`
  );
}
