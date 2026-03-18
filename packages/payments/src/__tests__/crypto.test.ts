import { describe, expect, it } from 'bun:test';
import { normalizeAddress, sanitizeAddress, ZERO_ADDRESS } from '../crypto';

describe('normalizeAddress', () => {
  it('should normalize valid address to lowercase', () => {
    const address = normalizeAddress('0x1234567890123456789012345678901234567890');
    expect(address).toBe('0x1234567890123456789012345678901234567890');
  });

  it('should convert uppercase address to lowercase', () => {
    const address = normalizeAddress('0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD');
    expect(address).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
  });

  it('should normalize mixed case address to lowercase', () => {
    const address = normalizeAddress('0xAbCdEf1234567890AbCdEf1234567890AbCdEf12');
    expect(address).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
  });

  it('should handle address with whitespace', () => {
    const address = normalizeAddress('  0x1234567890123456789012345678901234567890  ');
    expect(address).toBe('0x1234567890123456789012345678901234567890');
  });

  it('should throw on null address', () => {
    expect(() => normalizeAddress(null)).toThrow('invalid hex address');
  });

  it('should throw on undefined address', () => {
    expect(() => normalizeAddress(undefined)).toThrow('invalid hex address');
  });

  it('should throw on empty string', () => {
    expect(() => normalizeAddress('')).toThrow('invalid hex address');
  });

  it('should throw on invalid length (too short)', () => {
    expect(() => normalizeAddress('0x1234')).toThrow('invalid hex address');
  });

  it('should throw on invalid length (too long)', () => {
    expect(() =>
      normalizeAddress('0x12345678901234567890123456789012345678901234')
    ).toThrow('invalid hex address');
  });

  it('should throw on missing 0x prefix', () => {
    expect(() =>
      normalizeAddress('1234567890123456789012345678901234567890')
    ).toThrow('invalid hex address');
  });

  it('should throw on invalid hex characters', () => {
    expect(() =>
      normalizeAddress('0x123456789012345678901234567890123456789g')
    ).toThrow('invalid hex address');
  });

  it('should handle checksummed addresses', () => {
    // EIP-55 checksummed address
    const checksummed = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
    const normalized = normalizeAddress(checksummed);
    expect(normalized).toBe('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed');
  });
});

describe('sanitizeAddress', () => {
  it('should return normalized address for valid input', () => {
    const address = sanitizeAddress('0x1234567890123456789012345678901234567890');
    expect(address).toBe('0x1234567890123456789012345678901234567890');
  });

  it('should return ZERO_ADDRESS for null', () => {
    const address = sanitizeAddress(null);
    expect(address).toBe(ZERO_ADDRESS);
  });

  it('should return ZERO_ADDRESS for undefined', () => {
    const address = sanitizeAddress(undefined);
    expect(address).toBe(ZERO_ADDRESS);
  });

  it('should return ZERO_ADDRESS for empty string', () => {
    const address = sanitizeAddress('');
    expect(address).toBe(ZERO_ADDRESS);
  });

  it('should return ZERO_ADDRESS for invalid address', () => {
    const address = sanitizeAddress('0x1234');
    expect(address).toBe(ZERO_ADDRESS);
  });

  it('should return ZERO_ADDRESS for non-hex address', () => {
    const address = sanitizeAddress('not-an-address');
    expect(address).toBe(ZERO_ADDRESS);
  });

  it('should normalize valid uppercase address', () => {
    const address = sanitizeAddress('0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD');
    expect(address).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
  });

  it('should handle address with whitespace', () => {
    const address = sanitizeAddress('  0x1234567890123456789012345678901234567890  ');
    expect(address).toBe('0x1234567890123456789012345678901234567890');
  });
});

describe('ZERO_ADDRESS', () => {
  it('should be a valid 40-character hex address', () => {
    expect(ZERO_ADDRESS).toBe('0x0000000000000000000000000000000000000000');
    expect(ZERO_ADDRESS).toHaveLength(42); // 0x + 40 chars
  });
});
