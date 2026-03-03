import { describe, expect,it } from 'bun:test';

import {
  hasRegistrationCapability,
  parseBoolean,
  parseSolanaPrivateKey,
  resolveAutoRegister,
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
    expect(
      hasRegistrationCapability({ privateKey: new Uint8Array(64) })
    ).toBe(true);
  });

  it('returns false when no privateKey', () => {
    expect(hasRegistrationCapability({})).toBe(false);
  });
});
