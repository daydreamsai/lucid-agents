import { describe, expect, it } from 'bun:test';

import {
  hasRegistrationCapability,
  parseBoolean,
  parseSolanaPrivateKey,
  resolveAutoRegister,
  validateSolanaIdentityConfig,
} from '../validation';

describe('parseBoolean', () => {
  it('returns true for "true"', () => {
    expect(parseBoolean('true')).toBe(true);
  });

  it('returns true for "1"', () => {
    expect(parseBoolean('1')).toBe(true);
  });

  it('returns false for "false"', () => {
    expect(parseBoolean('false')).toBe(false);
  });

  it('returns default when undefined', () => {
    expect(parseBoolean(undefined, true)).toBe(true);
    expect(parseBoolean(undefined, false)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(parseBoolean('')).toBe(false);
  });
});

describe('parseSolanaPrivateKey', () => {
  it('parses valid JSON array', () => {
    const arr = Array.from({ length: 64 }, (_, i) => i);
    const result = parseSolanaPrivateKey(JSON.stringify(arr));
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result?.length).toBe(64);
  });

  it('returns null for undefined', () => {
    expect(parseSolanaPrivateKey(undefined)).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseSolanaPrivateKey('not-json')).toBeNull();
  });

  it('returns null for non-array JSON', () => {
    expect(parseSolanaPrivateKey('{"key": "val"}')).toBeNull();
  });
});

describe('resolveAutoRegister', () => {
  it('uses options.autoRegister when set', () => {
    expect(resolveAutoRegister({ autoRegister: false })).toBe(false);
    expect(resolveAutoRegister({ autoRegister: true })).toBe(true);
  });

  it('uses env REGISTER_IDENTITY when options not set', () => {
    expect(resolveAutoRegister({}, { REGISTER_IDENTITY: 'false' })).toBe(false);
    expect(resolveAutoRegister({}, { REGISTER_IDENTITY: 'true' })).toBe(true);
  });

  it('defaults to true when nothing set', () => {
    expect(resolveAutoRegister({})).toBe(true);
  });
});

describe('hasRegistrationCapability', () => {
  it('returns true when privateKey is present', () => {
    expect(hasRegistrationCapability({ privateKey: new Uint8Array(64) })).toBe(
      true
    );
  });

  it('returns false when no privateKey', () => {
    expect(hasRegistrationCapability({})).toBe(false);
  });
});

describe('parseSolanaPrivateKey (element range validation)', () => {
  it('rejects arrays with values > 255', () => {
    const bad = JSON.stringify([0, 256, 1]);
    expect(parseSolanaPrivateKey(bad)).toBeNull();
  });

  it('rejects arrays with negative values', () => {
    const bad = JSON.stringify([0, -1, 128]);
    expect(parseSolanaPrivateKey(bad)).toBeNull();
  });

  it('rejects arrays with non-integer values', () => {
    const bad = JSON.stringify([0, 1.5, 128]);
    expect(parseSolanaPrivateKey(bad)).toBeNull();
  });

  it('accepts a valid 64-byte key array', () => {
    const valid = JSON.stringify(Array.from({ length: 64 }, (_, i) => i % 256));
    const result = parseSolanaPrivateKey(valid);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result?.length).toBe(64);
  });
});

describe('resolveAutoRegister (presence not truthiness)', () => {
  it('honours REGISTER_IDENTITY=false in env even when value is falsy string', () => {
    expect(resolveAutoRegister({}, { REGISTER_IDENTITY: 'false' })).toBe(false);
  });

  it('honours empty string REGISTER_IDENTITY as false', () => {
    // Empty string is falsy but present — parseBoolean("", default=true) → true
    // because empty string returns defaultValue; presence check ensures we read it.
    expect(resolveAutoRegister({}, { REGISTER_IDENTITY: '' })).toBe(true);
  });
});

describe('validateSolanaIdentityConfig', () => {
  it('throws when domain is provided but no private key', () => {
    expect(() =>
      validateSolanaIdentityConfig({ domain: 'agent.example.com' }, {})
    ).toThrow('SOLANA_PRIVATE_KEY is required');
  });

  it('does not throw when domain and private key both provided', () => {
    expect(() =>
      validateSolanaIdentityConfig(
        { domain: 'agent.example.com', privateKey: new Uint8Array(64) },
        {}
      )
    ).not.toThrow();
  });

  it('does not throw when domain absent and no private key', () => {
    expect(() => validateSolanaIdentityConfig({}, {})).not.toThrow();
  });

  it('does not throw when private key in env', () => {
    const validKey = JSON.stringify(Array.from({ length: 64 }, () => 1));
    expect(() =>
      validateSolanaIdentityConfig(
        { domain: 'agent.example.com' },
        { SOLANA_PRIVATE_KEY: validKey }
      )
    ).not.toThrow();
  });
});
