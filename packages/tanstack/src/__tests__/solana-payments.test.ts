import { describe, expect, it } from 'bun:test';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { createTanStackPaywall } from '../paywall';
import type { RoutesConfig } from '@x402/core/server';
import type { TanStackRequestMiddleware } from '../x402-paywall';
import { paymentMiddleware } from '../x402-paywall';

describe('TanStack Solana Payments', () => {
  const solanaPayments: PaymentsConfig = {
    payTo: '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz',
    facilitatorUrl: 'https://facilitator.test',
    network: 'solana:devnet',
  };

  const entrypoints = [
    {
      key: 'translate',
      description: 'Translate text',
      input: undefined,
      output: undefined,
      price: '5000',
    },
    {
      key: 'generate',
      description: 'Generate content',
      input: undefined,
      stream: async () => ({ status: 'succeeded' as const }),
      price: { invoke: '2000', stream: '8000' },
    },
  ];

  function createRuntime(paymentsConfig?: PaymentsConfig) {
    return {
      payments: paymentsConfig ? { config: paymentsConfig } : undefined,
      entrypoints: {
        snapshot: () => entrypoints,
      },
    } as const;
  }

  it('creates paywall middleware for Solana network', () => {
    const runtime = createRuntime(solanaPayments);
    const capturedRoutes: RoutesConfig[] = [];

    const middlewareFactory = ((
      _routes,
      _facilitator,
      _paywall
    ) => {
      return (() =>
        Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
    }) satisfies typeof paymentMiddleware;

    const spyingFactory: typeof middlewareFactory = (
      routes,
      facilitator,
      paywall
    ) => {
      capturedRoutes.push(routes as RoutesConfig);
      expect(facilitator?.url).toBe(solanaPayments.facilitatorUrl);
      return middlewareFactory(routes, facilitator, paywall);
    };

    const paywall = createTanStackPaywall({
      runtime,
      basePath: '/api/agent',
      middlewareFactory: spyingFactory,
    });

    expect(paywall.invoke).toBeDefined();
    expect(paywall.stream).toBeDefined();
    expect(capturedRoutes.length).toBe(2); // invoke and stream routes

    const [invokeRoutes, streamRoutes] = capturedRoutes;

    expect(Object.keys(invokeRoutes)).toContain(
      'POST /api/agent/entrypoints/translate/invoke'
    );
    expect(Object.keys(invokeRoutes)).toContain(
      'GET /api/agent/entrypoints/translate/invoke'
    );

    const translateInvokeConfig =
      invokeRoutes['POST /api/agent/entrypoints/translate/invoke'];
    if (typeof translateInvokeConfig === 'object' && translateInvokeConfig && 'accepts' in translateInvokeConfig) {
      const accepts = translateInvokeConfig.accepts;
      if (typeof accepts === 'object' && accepts && 'network' in accepts) {
        expect(accepts.network).toBe('solana:devnet');
      }
    }

    expect(Object.keys(streamRoutes)).toContain(
      'POST /api/agent/entrypoints/generate/stream'
    );

    const generateStreamConfig =
      streamRoutes['POST /api/agent/entrypoints/generate/stream'];
    if (typeof generateStreamConfig === 'object' && generateStreamConfig && 'accepts' in generateStreamConfig) {
      const accepts = generateStreamConfig.accepts;
      if (typeof accepts === 'object' && accepts && 'network' in accepts) {
        expect(accepts.network).toBe('solana:devnet');
      }
    }
  });

  it('accepts Solana Base58 address format', () => {
    const validSolanaAddresses = [
      '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    ];

    validSolanaAddresses.forEach(address => {
      const config: PaymentsConfig = {
        payTo: address,
        facilitatorUrl: 'https://facilitator.test',
        network: 'solana:mainnet',
      };

      const runtime = createRuntime(config);
      const paywall = createTanStackPaywall({ runtime });

      expect(paywall.invoke).toBeDefined();
      expect(paywall.stream).toBeDefined();
    });
  });

  it('supports both Solana mainnet and devnet', () => {
    const networks = [
      'solana:mainnet' as const,
      'solana:devnet' as const,
    ];

    networks.forEach(network => {
      const config: PaymentsConfig = {
        ...solanaPayments,
        network,
      };

      const runtime = createRuntime(config);
      const capturedRoutes: RoutesConfig[] = [];

      const middlewareFactory = ((
        _routes,
        _facilitator,
        _paywall
      ) => {
        return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
      }) satisfies typeof paymentMiddleware;

      const spyingFactory: typeof middlewareFactory = (
        routes,
        facilitator,
        paywall
      ) => {
        capturedRoutes.push(routes as RoutesConfig);
        return middlewareFactory(routes, facilitator, paywall);
      };

      const paywall = createTanStackPaywall({
        runtime,
        middlewareFactory: spyingFactory,
      });

      expect(paywall.invoke).toBeDefined();

      const [invokeRoutes] = capturedRoutes;
      const routeKeys = Object.keys(invokeRoutes);
      expect(routeKeys.length).toBeGreaterThan(0);

      // Verify all routes use the correct Solana network
      for (const key of routeKeys) {
        const routeConfig = invokeRoutes[key];
        if (typeof routeConfig === 'object' && routeConfig && 'accepts' in routeConfig) {
          const accepts = routeConfig.accepts;
          if (typeof accepts === 'object' && accepts && 'network' in accepts) {
            expect(accepts.network).toBe(network);
          }
        }
      }
    });
  });

  it('builds correct route paths with Solana payments', () => {
    const runtime = createRuntime(solanaPayments);
    const capturedRoutes: RoutesConfig[] = [];

    const middlewareFactory = ((
      _routes,
      _facilitator,
      _paywall
    ) => {
      return (() =>
        Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
    }) satisfies typeof paymentMiddleware;

    const spyingFactory: typeof middlewareFactory = (
      routes,
      facilitator,
      paywall
    ) => {
      capturedRoutes.push(routes as RoutesConfig);
      return middlewareFactory(routes, facilitator, paywall);
    };

    createTanStackPaywall({
      runtime,
      basePath: '/api/agent',
      middlewareFactory: spyingFactory,
    });

    const [invokeRoutes, streamRoutes] = capturedRoutes;

    // Verify invoke routes include both POST and GET
    expect(Object.keys(invokeRoutes)).toContain(
      'POST /api/agent/entrypoints/translate/invoke'
    );
    expect(Object.keys(invokeRoutes)).toContain(
      'GET /api/agent/entrypoints/translate/invoke'
    );

    // Verify stream routes only include entrypoints with stream handler
    expect(Object.keys(streamRoutes)).not.toContain(
      'POST /api/agent/entrypoints/translate/stream'
    );
    expect(Object.keys(streamRoutes)).toContain(
      'POST /api/agent/entrypoints/generate/stream'
    );
  });

  it('uses correct price for Solana entrypoints', () => {
    const runtime = createRuntime(solanaPayments);
    const capturedRoutes: RoutesConfig[] = [];

    const middlewareFactory = ((
      _routes,
      _facilitator,
      _paywall
    ) => {
      return (() =>
        Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
    }) satisfies typeof paymentMiddleware;

    const spyingFactory: typeof middlewareFactory = (
      routes,
      facilitator,
      paywall
    ) => {
      capturedRoutes.push(routes as RoutesConfig);
      return middlewareFactory(routes, facilitator, paywall);
    };

    createTanStackPaywall({
      runtime,
      middlewareFactory: spyingFactory,
    });

    const [invokeRoutes, streamRoutes] = capturedRoutes;

    // Check invoke price for translate (explicit price)
    const translateInvokeConfig =
      invokeRoutes['POST /api/agent/entrypoints/translate/invoke'];
    if (typeof translateInvokeConfig === 'object' && translateInvokeConfig && 'accepts' in translateInvokeConfig) {
      const accepts = translateInvokeConfig.accepts;
      if (typeof accepts === 'object' && accepts && 'price' in accepts) {
        expect(accepts.price).toBe('5000');
      }
    }

    // Check invoke price for generate (from price.invoke)
    const generateInvokeConfig =
      invokeRoutes['POST /api/agent/entrypoints/generate/invoke'];
    if (typeof generateInvokeConfig === 'object' && generateInvokeConfig && 'accepts' in generateInvokeConfig) {
      const accepts = generateInvokeConfig.accepts;
      if (typeof accepts === 'object' && accepts && 'price' in accepts) {
        expect(accepts.price).toBe('2000');
      }
    }

    // Check stream price for generate (from price.stream)
    const generateStreamConfig =
      streamRoutes['POST /api/agent/entrypoints/generate/stream'];
    if (typeof generateStreamConfig === 'object' && generateStreamConfig && 'accepts' in generateStreamConfig) {
      const accepts = generateStreamConfig.accepts;
      if (typeof accepts === 'object' && accepts && 'price' in accepts) {
        expect(accepts.price).toBe('8000');
      }
    }
  });

  it('rejects unsupported network at configuration time', () => {
    const invalidPayments: PaymentsConfig = {
      payTo: '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz',
      facilitatorUrl: 'https://facilitator.test',
      network: 'solana-mainnet' as any, // Invalid - should be 'solana:mainnet'
    };

    const runtime = createRuntime(invalidPayments);

    // Should throw when creating paywall with invalid network
    expect(() => {
      createTanStackPaywall({ runtime });
    }).toThrow(/Unsupported payment network: solana-mainnet/);
  });
});
