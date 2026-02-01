import { describe, expect, it } from 'bun:test';

import { createAP2Runtime } from '../runtime';

describe('createAP2Runtime', () => {
  it('creates runtime when config provided', () => {
    const runtime = createAP2Runtime({
      roles: ['merchant'],
      required: true,
    });

    expect(runtime).toBeDefined();
    expect(runtime?.config).toBeDefined();
    expect(runtime?.config.roles).toEqual(['merchant']);
  });

  it('returns undefined when no config provided', () => {
    const runtime = createAP2Runtime(undefined);

    expect(runtime).toBeUndefined();
  });

  it('handles multiple roles', () => {
    const runtime = createAP2Runtime({
      roles: ['merchant', 'shopper'],
      required: false,
    });

    expect(runtime).toBeDefined();
    expect(runtime?.config.roles).toEqual(['merchant', 'shopper']);
    expect(runtime?.config.required).toBe(false);
  });
});
