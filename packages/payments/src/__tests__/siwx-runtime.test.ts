import { describe, expect, it } from 'bun:test';
import { createPaymentsRuntime, entrypointHasSIWx } from '../payments';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type { EntrypointDef } from '@lucid-agents/types/core';

const baseConfig: PaymentsConfig = {
  facilitatorUrl: 'https://facilitator.example.com',
  network: 'eip155:84532',
  payTo: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
};

describe('SIWX Runtime Configuration', () => {
  describe('createPaymentsRuntime', () => {
    it('should build runtime without SIWX when not configured', () => {
      const runtime = createPaymentsRuntime(baseConfig);
      expect(runtime).toBeDefined();
      expect(runtime!.siwxConfig).toBeUndefined();
      expect(runtime!.siwxStorage).toBeUndefined();
    });

    it('should build runtime with SIWX when enabled', () => {
      const config: PaymentsConfig = {
        ...baseConfig,
        siwx: {
          enabled: true,
          defaultStatement: 'Sign in to reuse access.',
          storage: { type: 'in-memory' },
        },
      };
      const runtime = createPaymentsRuntime(config);
      expect(runtime).toBeDefined();
      expect(runtime!.siwxConfig).toBeDefined();
      expect(runtime!.siwxConfig!.enabled).toBe(true);
      expect(runtime!.siwxStorage).toBeDefined();
    });

    it('should not create SIWX storage when disabled', () => {
      const config: PaymentsConfig = {
        ...baseConfig,
        siwx: {
          enabled: false,
        },
      };
      const runtime = createPaymentsRuntime(config);
      expect(runtime!.siwxStorage).toBeUndefined();
    });

    it('should default to in-memory SIWX storage when no storage config', () => {
      const config: PaymentsConfig = {
        ...baseConfig,
        siwx: {
          enabled: true,
        },
      };
      const runtime = createPaymentsRuntime(config);
      expect(runtime!.siwxStorage).toBeDefined();
    });

    it('should throw for postgres SIWX storage without connectionString', () => {
      const config: PaymentsConfig = {
        ...baseConfig,
        siwx: {
          enabled: true,
          storage: { type: 'postgres' },
        },
      };
      expect(() => createPaymentsRuntime(config)).toThrow('connectionString');
    });
  });

  describe('entrypointHasSIWx', () => {
    it('should return false when no siwx config', () => {
      const ep: EntrypointDef = { key: 'test' };
      expect(entrypointHasSIWx(ep)).toBe(false);
    });

    it('should return true when authOnly', () => {
      const ep: EntrypointDef = { key: 'test', siwx: { authOnly: true } };
      expect(entrypointHasSIWx(ep)).toBe(true);
    });

    it('should return true when explicitly enabled', () => {
      const ep: EntrypointDef = { key: 'test', siwx: { enabled: true } };
      expect(entrypointHasSIWx(ep)).toBe(true);
    });

    it('should return false when explicitly disabled', () => {
      const ep: EntrypointDef = { key: 'test', siwx: { enabled: false } };
      expect(entrypointHasSIWx(ep, { enabled: true })).toBe(false);
    });

    it('should return true when global is enabled and entrypoint has price', () => {
      const ep: EntrypointDef = { key: 'test', price: '0.01' };
      expect(entrypointHasSIWx(ep, { enabled: true })).toBe(true);
    });

    it('should return false when global is enabled but no price and no explicit opt-in', () => {
      const ep: EntrypointDef = { key: 'test' };
      expect(entrypointHasSIWx(ep, { enabled: true })).toBe(false);
    });
  });

  describe('activate with SIWX', () => {
    it('should activate runtime for auth-only entrypoint', () => {
      const config: PaymentsConfig = {
        ...baseConfig,
        siwx: { enabled: true, storage: { type: 'in-memory' } },
      };
      const runtime = createPaymentsRuntime(config);
      expect(runtime!.isActive).toBe(false);

      const ep: EntrypointDef = { key: 'profile', siwx: { authOnly: true } };
      runtime!.activate(ep);
      expect(runtime!.isActive).toBe(true);
    });

    it('should activate runtime for priced entrypoint with SIWX', () => {
      const config: PaymentsConfig = {
        ...baseConfig,
        siwx: { enabled: true, storage: { type: 'in-memory' } },
      };
      const runtime = createPaymentsRuntime(config);

      const ep: EntrypointDef = {
        key: 'report',
        price: '0.01',
        siwx: { enabled: true },
      };
      runtime!.activate(ep);
      expect(runtime!.isActive).toBe(true);
    });
  });
});
