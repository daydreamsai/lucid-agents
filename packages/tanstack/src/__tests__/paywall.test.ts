import { describe, expect, it } from "bun:test";
import type { PaymentsConfig } from "@lucid-agents/types/payments";
import { createTanStackPaywall } from "../paywall";
import type { RoutesConfig } from "x402/types";
import type { TanStackRequestMiddleware } from "@lucid-agents/x402-tanstack-start";

describe("createTanStackPaywall", () => {
  const payments: PaymentsConfig = {
    payTo: "0xabc1230000000000000000000000000000000000",
    facilitatorUrl: "https://facilitator.test",
    network: "base-sepolia",
  };

  const entrypoints = [
    {
      key: "echo",
      description: "Echo back",
      input: undefined,
      output: undefined,
      price: "2000",
    },
    {
      key: "streamer",
      description: "Stream stuff",
      input: undefined,
      stream: async () => ({ status: "succeeded" as const }),
      price: { invoke: "1500", stream: "3000" },
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

  it("skips middleware creation when payments are disabled", () => {
    const runtime = createRuntime();
    const paywall = createTanStackPaywall({ runtime });
    expect(paywall).toEqual({});
  });

  it("builds invoke and stream route maps with normalized paths", () => {
    const runtime = createRuntime(payments);
    const capturedRoutes: RoutesConfig[] = [];
    const middlewareFactory = ((
      _payTo,
      _routes,
      _facilitator,
      _paywall
    ) => {
      return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
    }) satisfies typeof import("@lucid-agents/x402-tanstack-start").paymentMiddleware;

    const spyingFactory: typeof middlewareFactory = (payTo, routes, facilitator, paywall) => {
      capturedRoutes.push(routes as RoutesConfig);
      expect(payTo as string).toBe(payments.payTo);
      expect(facilitator?.url).toBe(payments.facilitatorUrl);
      return middlewareFactory(payTo, routes, facilitator, paywall);
    };

    const paywall = createTanStackPaywall({
      runtime,
      basePath: "api/agent/",
      middlewareFactory: spyingFactory,
    });

    expect(paywall.invoke).toBeDefined();
    expect(paywall.stream).toBeDefined();

    const [invokeRoutes, streamRoutes] = capturedRoutes;
    expect(Object.keys(invokeRoutes)).toContain(
      "POST /api/agent/entrypoints/echo/invoke"
    );
    expect(Object.keys(invokeRoutes)).toContain(
      "GET /api/agent/entrypoints/echo/invoke"
    );
    expect(Object.keys(streamRoutes)).not.toContain(
      "POST /api/agent/entrypoints/echo/stream"
    );
    expect(Object.keys(streamRoutes)).toContain(
      "POST /api/agent/entrypoints/streamer/stream"
    );
    const invokeConfig = invokeRoutes["POST /api/agent/entrypoints/echo/invoke"];
    if (typeof invokeConfig === 'object' && 'config' in invokeConfig) {
      expect(invokeConfig.config?.mimeType).toBe("application/json");
    }
    const streamConfig =
      streamRoutes["POST /api/agent/entrypoints/streamer/stream"];
    if (typeof streamConfig === 'object' && 'config' in streamConfig) {
      expect(streamConfig.config?.mimeType).toBe("text/event-stream");
    }
  });
});
