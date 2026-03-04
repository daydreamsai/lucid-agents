/**
 * Minimal bs58 encode/decode shim for use within the package.
 * @solana/web3.js already bundles bs58, but we expose it here
 * as a convenience so internal code has a stable import.
 *
 * In browser environments, you can replace this with the real bs58 package.
 */

const ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE_MAP = new Uint8Array(256).fill(255);
for (let i = 0; i < ALPHABET.length; i++) {
  BASE_MAP[ALPHABET.charCodeAt(i)] = i;
}

export function encode(source: Uint8Array | Buffer): string {
  const src = source instanceof Buffer ? source : Buffer.from(source);
  if (src.length === 0) return '';
  let digits = [0];
  for (let i = 0; i < src.length; i++) {
    let carry = src[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = '';
  // Leading zeros
  for (let i = 0; i < src.length && src[i] === 0; i++) {
    result += ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += ALPHABET[digits[i]];
  }
  return result;
}

export function decode(source: string): Buffer {
  if (source.length === 0) return Buffer.alloc(0);
  const bytes = [0];
  for (let i = 0; i < source.length; i++) {
    const value = BASE_MAP[source.charCodeAt(i)];
    if (value === 255) {
      throw new Error(`Non-base58 character: ${source[i]}`);
    }
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading '1' chars → leading zero bytes
  for (let i = 0; i < source.length && source[i] === '1'; i++) {
    bytes.push(0);
  }
  return Buffer.from(bytes.reverse());
}

export default { encode, decode };
