import { describe, expect, it } from 'bun:test';

import { hasDefinedValue } from '../utils/utils';

describe('hasDefinedValue', () => {
  it('rejects absent objects and objects containing only empty values', () => {
    expect(hasDefinedValue()).toBe(false);
    expect(hasDefinedValue({ value: undefined })).toBe(false);
    expect(hasDefinedValue({ value: null })).toBe(false);
    expect(hasDefinedValue({ value: '   ' })).toBe(false);
  });

  it('accepts non-empty strings and defined non-string values', () => {
    expect(hasDefinedValue({ value: 'configured' })).toBe(true);
    expect(hasDefinedValue({ value: false })).toBe(true);
    expect(hasDefinedValue({ value: 0 })).toBe(true);
  });
});
