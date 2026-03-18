import { describe, expect, it } from 'bun:test';
import { resolvePrice } from '../pricing';
import type { EntrypointDef } from '@lucid-agents/types/core';
import { z } from 'zod';

describe('resolvePrice', () => {
  const baseEntrypoint: EntrypointDef = {
    key: 'test',
    description: 'Test entrypoint',
    input: z.object({}),
    handler: async () => ({ output: {} }),
  };

  it('should return null when price is not set', () => {
    const price = resolvePrice(baseEntrypoint, undefined, 'invoke');
    expect(price).toBeNull();
  });

  it('should return fixed price when price is a string', () => {
    const entrypoint = { ...baseEntrypoint, price: '1000000' };
    const price = resolvePrice(entrypoint, undefined, 'invoke');
    expect(price).toBe('1000000');
  });

  it('should return same price for both invoke and stream when price is string', () => {
    const entrypoint = { ...baseEntrypoint, price: '1000000' };
    const invokePrice = resolvePrice(entrypoint, undefined, 'invoke');
    const streamPrice = resolvePrice(entrypoint, undefined, 'stream');
    expect(invokePrice).toBe('1000000');
    expect(streamPrice).toBe('1000000');
  });

  it('should return invoke price from object', () => {
    const entrypoint = {
      ...baseEntrypoint,
      price: { invoke: '1000000', stream: '2000000' },
    };
    const price = resolvePrice(entrypoint, undefined, 'invoke');
    expect(price).toBe('1000000');
  });

  it('should return stream price from object', () => {
    const entrypoint = {
      ...baseEntrypoint,
      price: { invoke: '1000000', stream: '2000000' },
    };
    const price = resolvePrice(entrypoint, undefined, 'stream');
    expect(price).toBe('2000000');
  });

  it('should return null when stream price not specified in object', () => {
    const entrypoint = {
      ...baseEntrypoint,
      price: { invoke: '1000000' },
    };
    const price = resolvePrice(entrypoint, undefined, 'stream');
    expect(price).toBeNull();
  });

  it('should handle zero prices', () => {
    const entrypoint = { ...baseEntrypoint, price: '0' };
    const price = resolvePrice(entrypoint, undefined, 'invoke');
    expect(price).toBe('0');
  });

  it('should handle very large prices', () => {
    const largePrice = '999999999999999999';
    const entrypoint = { ...baseEntrypoint, price: largePrice };
    const price = resolvePrice(entrypoint, undefined, 'invoke');
    expect(price).toBe(largePrice);
  });

  it('should handle price object with only stream price', () => {
    const entrypoint = {
      ...baseEntrypoint,
      price: { stream: '2000000' },
    };
    const invokePrice = resolvePrice(entrypoint, undefined, 'invoke');
    const streamPrice = resolvePrice(entrypoint, undefined, 'stream');

    expect(invokePrice).toBeNull();
    expect(streamPrice).toBe('2000000');
  });

  it('should handle different prices for invoke and stream', () => {
    const entrypoint = {
      ...baseEntrypoint,
      price: { invoke: '500000', stream: '1500000' },
    };

    const invokePrice = resolvePrice(entrypoint, undefined, 'invoke');
    const streamPrice = resolvePrice(entrypoint, undefined, 'stream');

    expect(invokePrice).toBe('500000');
    expect(streamPrice).toBe('1500000');
    expect(invokePrice).not.toBe(streamPrice);
  });

  it('should return null for invalid price format (number)', () => {
    const entrypoint = {
      ...baseEntrypoint,
      price: 1000000 as any,
    };
    const price = resolvePrice(entrypoint, undefined, 'invoke');
    expect(price).toBeNull();
  });

  it('should return null for invalid price format (object with amount)', () => {
    const entrypoint = {
      ...baseEntrypoint,
      price: { amount: 1000000 } as any,
    };
    const price = resolvePrice(entrypoint, undefined, 'invoke');
    expect(price).toBeNull();
  });
});
