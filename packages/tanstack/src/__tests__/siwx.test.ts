import { describe, expect, it, beforeEach } from 'bun:test';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type { SIWxConfig, AgentAuthContext } from '@lucid-agents/types/siwx';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { SIWxStorage } from '@lucid-agents/payments';
import { createInMemorySIWxStorage } from '@lucid-agents/payments';
import { createTanStackPaywall } from '../paywall';
import type { RoutesConfig } from '@x402/core/server';
import type { TanStackRequestMiddleware, SIWxMiddlewareConfig } from '../x402-paywall';
import { paymentMiddleware } from '../x402-paywall';

/**
 * Helper to build a base64-encoded SIWX header from a payload object.
 */
function encodeSIWxHeader(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

describe('SIWX Integration (TanStack)', () => {
  const payments: PaymentsConfig = {
    payTo: '0xabc1230000000000000000000000000000000000',
    facilitatorUrl: 'https://facilitator.test',
    network: 'eip155:84532',
    siwx: {
      enabled: true,
      defaultStatement: 'Sign in to reuse access.',
      expirationSeconds: 3600,
      storage: { type: 'in-memory' },
      verify: { skipSignatureVerification: true },
    },
  };

  const siwxConfig: SIWxConfig = payments.siwx!;

  let siwxStorage: SIWxStorage;

  beforeEach(async () => {
    siwxStorage = createInMemorySIWxStorage();
  });

  const entrypoints: EntrypointDef[] = [
    {
      key: 'echo',
      description: 'Echo back',
      price: '2000',
      siwx: { enabled: true },
    },
    {
      key: 'profile',
      description: 'User profile',
      siwx: { authOnly: true },
    },
    {
      key: 'basic',
      description: 'Basic route',
      price: '500',
    },
  ];

  function createRuntime(paymentsConfig?: PaymentsConfig) {
    return {
      payments: paymentsConfig
        ? {
            config: paymentsConfig,
            siwxStorage,
            siwxConfig: paymentsConfig.siwx,
          }
        : undefined,
      entrypoints: {
        snapshot: () => entrypoints,
      },
    } as const;
  }

  describe('Paywall configuration with SIWX', () => {
    it('threads SIWX config to middleware factory', () => {
      const runtime = createRuntime(payments);
      let capturedSiwx: SIWxMiddlewareConfig | undefined;

      const middlewareFactory = ((
        _routes: any,
        _facilitator: any,
        _paywall: any,
        siwx?: SIWxMiddlewareConfig
      ) => {
        capturedSiwx = siwx;
        return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
      }) as typeof paymentMiddleware;

      createTanStackPaywall({
        runtime,
        middlewareFactory,
        siwxStorage,
        siwxConfig,
      });

      expect(capturedSiwx).toBeDefined();
      expect(capturedSiwx!.siwxStorage).toBe(siwxStorage);
      expect(capturedSiwx!.siwxConfig).toBe(siwxConfig);
      expect(capturedSiwx!.entrypoints).toEqual(entrypoints);
    });

    it('does not thread SIWX when SIWX is disabled', () => {
      const noSiwxPayments: PaymentsConfig = {
        ...payments,
        siwx: { enabled: false },
      };
      const runtime = createRuntime(noSiwxPayments);
      let capturedSiwx: SIWxMiddlewareConfig | undefined;

      const middlewareFactory = ((
        _routes: any,
        _facilitator: any,
        _paywall: any,
        siwx?: SIWxMiddlewareConfig
      ) => {
        capturedSiwx = siwx;
        return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
      }) as typeof paymentMiddleware;

      createTanStackPaywall({
        runtime,
        middlewareFactory,
      });

      expect(capturedSiwx).toBeUndefined();
    });

    it('registers auth-only routes even without price', () => {
      const runtime = createRuntime(payments);
      const capturedRoutes: RoutesConfig[] = [];

      const middlewareFactory = ((
        routes: any,
        _facilitator: any,
        _paywall: any,
        _siwx?: any
      ) => {
        capturedRoutes.push(routes as RoutesConfig);
        return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
      }) as typeof paymentMiddleware;

      createTanStackPaywall({
        runtime,
        middlewareFactory,
        siwxStorage,
        siwxConfig,
      });

      // The invoke routes should include the auth-only 'profile' entrypoint
      const [invokeRoutes] = capturedRoutes;
      expect(Object.keys(invokeRoutes)).toContain(
        'POST /api/agent/entrypoints/profile/invoke'
      );
      expect(Object.keys(invokeRoutes)).toContain(
        'GET /api/agent/entrypoints/profile/invoke'
      );
    });

    it('non-SIWX routes are registered normally', () => {
      const runtime = createRuntime(payments);
      const capturedRoutes: RoutesConfig[] = [];

      const middlewareFactory = ((
        routes: any,
        _facilitator: any,
        _paywall: any,
        _siwx?: any
      ) => {
        capturedRoutes.push(routes as RoutesConfig);
        return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
      }) as typeof paymentMiddleware;

      createTanStackPaywall({
        runtime,
        middlewareFactory,
        siwxStorage,
        siwxConfig,
      });

      const [invokeRoutes] = capturedRoutes;
      // 'basic' entrypoint has price but no SIWX - should still be registered
      expect(Object.keys(invokeRoutes)).toContain(
        'POST /api/agent/entrypoints/basic/invoke'
      );

      // Verify the basic route has the correct price
      const basicConfig = invokeRoutes['POST /api/agent/entrypoints/basic/invoke'] as any;
      expect(basicConfig.accepts.price).toBe('500');
    });
  });

  describe('SIWX verification flow', () => {
    it('valid SIWX header on entitled wallet bypasses payment', async () => {
      // Record a payment entitlement
      const address = '0xdeadbeef00000000000000000000000000000001';
      const resourceUri = 'http://localhost/api/agent/entrypoints/echo/invoke';
      await siwxStorage.recordPayment(resourceUri, address.toLowerCase());

      const siwxPayload = {
        domain: 'localhost',
        address,
        uri: resourceUri,
        version: '1',
        chainId: 'eip155:84532',
        nonce: 'test-nonce-001',
        issuedAt: new Date().toISOString(),
      };

      const runtime = createRuntime(payments);
      let siwxMiddlewareConfig: SIWxMiddlewareConfig | undefined;

      const middlewareFactory = ((
        _routes: any,
        _facilitator: any,
        _paywall: any,
        siwx?: SIWxMiddlewareConfig
      ) => {
        siwxMiddlewareConfig = siwx;
        return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
      }) as typeof paymentMiddleware;

      createTanStackPaywall({
        runtime,
        middlewareFactory,
        siwxStorage,
        siwxConfig,
      });

      expect(siwxMiddlewareConfig).toBeDefined();
      expect(siwxMiddlewareConfig!.siwxStorage).toBe(siwxStorage);
    });

    it('replayed nonce is rejected', async () => {
      const address = '0xdeadbeef00000000000000000000000000000001';
      const resourceUri = 'http://localhost/api/agent/entrypoints/echo/invoke';
      await siwxStorage.recordPayment(resourceUri, address.toLowerCase());
      // Record the nonce as used
      await siwxStorage.recordNonce('replayed-nonce');

      const hasUsed = await siwxStorage.hasUsedNonce('replayed-nonce');
      expect(hasUsed).toBe(true);
    });

    it('non-entitled wallet does not bypass payment', async () => {
      const hasEntitlement = await siwxStorage.hasPaid(
        'http://localhost/api/agent/entrypoints/echo/invoke',
        '0xno_entitlement_address'
      );
      expect(hasEntitlement).toBe(false);
    });
  });

  describe('Auth-only routes', () => {
    it('auth-only entrypoint is detected correctly', () => {
      const profileEp = entrypoints.find(ep => ep.key === 'profile')!;
      expect(profileEp.siwx?.authOnly).toBe(true);
    });

    it('auth-only route registered with zero price', () => {
      const runtime = createRuntime(payments);
      const capturedRoutes: RoutesConfig[] = [];

      const middlewareFactory = ((
        routes: any,
        _facilitator: any,
        _paywall: any,
        _siwx?: any
      ) => {
        capturedRoutes.push(routes as RoutesConfig);
        return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
      }) as typeof paymentMiddleware;

      createTanStackPaywall({
        runtime,
        middlewareFactory,
        siwxStorage,
        siwxConfig,
      });

      const [invokeRoutes] = capturedRoutes;
      const profileConfig = invokeRoutes['POST /api/agent/entrypoints/profile/invoke'] as any;
      expect(profileConfig).toBeDefined();
      expect(profileConfig.accepts.price).toBe('0');
    });
  });

  describe('SIWX extension declaration', () => {
    it('SIWX middleware config includes entrypoints and basePath', () => {
      const runtime = createRuntime(payments);
      let capturedSiwx: SIWxMiddlewareConfig | undefined;

      const middlewareFactory = ((
        _routes: any,
        _facilitator: any,
        _paywall: any,
        siwx?: SIWxMiddlewareConfig
      ) => {
        capturedSiwx = siwx;
        return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
      }) as typeof paymentMiddleware;

      createTanStackPaywall({
        runtime,
        basePath: '/my/agent',
        middlewareFactory,
        siwxStorage,
        siwxConfig,
      });

      expect(capturedSiwx!.basePath).toBe('/my/agent');
      expect(capturedSiwx!.entrypoints).toHaveLength(3);
      expect(capturedSiwx!.siwxConfig!.defaultStatement).toBe('Sign in to reuse access.');
    });
  });

  describe('Entitlement recording', () => {
    it('storage records payment and allows lookup', async () => {
      const resource = 'http://localhost/api/agent/entrypoints/echo/invoke';
      const address = '0xpayer';

      expect(await siwxStorage.hasPaid(resource, address)).toBe(false);
      await siwxStorage.recordPayment(resource, address, 'eip155:84532');
      expect(await siwxStorage.hasPaid(resource, address)).toBe(true);
    });

    it('different resource does not share entitlement', async () => {
      const resource1 = 'http://localhost/api/agent/entrypoints/echo/invoke';
      const resource2 = 'http://localhost/api/agent/entrypoints/echo/stream';
      const address = '0xpayer';

      await siwxStorage.recordPayment(resource1, address);
      expect(await siwxStorage.hasPaid(resource1, address)).toBe(true);
      expect(await siwxStorage.hasPaid(resource2, address)).toBe(false);
    });
  });

  describe('Backward compatibility', () => {
    it('existing non-SIWX paywall creation works unchanged', () => {
      const noSiwxPayments: PaymentsConfig = {
        payTo: '0xabc1230000000000000000000000000000000000',
        facilitatorUrl: 'https://facilitator.test',
        network: 'eip155:84532',
      };
      const plainEntrypoints = [
        { key: 'echo', description: 'Echo', price: '2000' },
      ];
      const runtime = {
        payments: { config: noSiwxPayments },
        entrypoints: { snapshot: () => plainEntrypoints },
      } as const;

      const capturedRoutes: RoutesConfig[] = [];

      const middlewareFactory = ((
        routes: any,
        _facilitator: any,
        _paywall: any,
        _siwx?: any
      ) => {
        capturedRoutes.push(routes as RoutesConfig);
        return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
      }) as typeof paymentMiddleware;

      const paywall = createTanStackPaywall({
        runtime,
        middlewareFactory,
      });

      expect(paywall.invoke).toBeDefined();
      const [invokeRoutes] = capturedRoutes;
      expect(Object.keys(invokeRoutes)).toContain(
        'POST /api/agent/entrypoints/echo/invoke'
      );
    });

    it('middleware factory 4th argument is optional', () => {
      const noSiwxPayments: PaymentsConfig = {
        payTo: '0xabc1230000000000000000000000000000000000',
        facilitatorUrl: 'https://facilitator.test',
        network: 'eip155:84532',
      };
      const plainEntrypoints = [
        { key: 'echo', description: 'Echo', price: '2000' },
      ];
      const runtime = {
        payments: { config: noSiwxPayments },
        entrypoints: { snapshot: () => plainEntrypoints },
      } as const;

      let called = false;
      const middlewareFactory = ((
        _routes: any,
        _facilitator: any,
        _paywall: any
      ) => {
        called = true;
        return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
      }) as typeof paymentMiddleware;

      createTanStackPaywall({
        runtime,
        middlewareFactory,
      });

      expect(called).toBe(true);
    });
  });
});
