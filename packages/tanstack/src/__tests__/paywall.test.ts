import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import type { PaymentsConfig } from "@lucid-agents/types/payments";
import { decodePaymentRequiredHeader } from "@lucid-agents/payments";
import { createTanStackPaywall } from "../paywall";
import { paymentMiddleware } from "../x402-paywall";
import type { RoutesConfig } from "@x402/core/server";
import type { TanStackRequestMiddleware } from "../x402-paywall";

const mockFacilitatorResponse = {
  kinds: [
    {
      scheme: "exact",
      network: "eip155:84532",
      asset: {
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        decimals: 6,
        eip712: {
          name: "USDC",
          version: "2",
        },
      },
    },
  ],
};

let originalFetch: typeof globalThis.fetch;

function createMockFetch(): typeof globalThis.fetch {
  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("facilitator") && url.includes("/supported")) {
      return new Response(JSON.stringify(mockFacilitatorResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("facilitator") && url.includes("/verify")) {
      return new Response(JSON.stringify({ valid: false, reason: "No payment" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return originalFetch(input, init);
  };
  return mockFetch as typeof globalThis.fetch;
}

describe("createTanStackPaywall", () => {
  beforeAll(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = createMockFetch();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  const payments: PaymentsConfig = {
    payTo: "0xabc1230000000000000000000000000000000000",
    facilitatorUrl: "https://facilitator.test",
    network: "eip155:84532",
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
      _routes,
      _facilitator,
      _paywall
    ) => {
      return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
    }) satisfies typeof paymentMiddleware;

    const spyingFactory: typeof middlewareFactory = (routes, facilitator, paywall) => {
      capturedRoutes.push(routes as RoutesConfig);
      expect(facilitator?.url).toBe(payments.facilitatorUrl);
      return middlewareFactory(routes, facilitator, paywall);
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
    if (typeof invokeConfig === 'object' && 'mimeType' in invokeConfig) {
      expect(invokeConfig.mimeType).toBe("application/json");
    }
    const streamConfig = streamRoutes["POST /api/agent/entrypoints/streamer/stream"];
    if (typeof streamConfig === 'object' && 'mimeType' in streamConfig) {
      expect(streamConfig.mimeType).toBe("text/event-stream");
    }
  });

  it("injects facilitator bearer auth header from payments config", async () => {
    const runtime = createRuntime({
      ...payments,
      facilitatorAuth: "facilitator-secret",
    });
    let capturedFacilitator: any = null;

    const middlewareFactory = ((
      _routes,
      facilitator,
      _paywall
    ) => {
      capturedFacilitator = facilitator;
      return (() => Promise.resolve(new Response())) as unknown as TanStackRequestMiddleware;
    }) satisfies typeof paymentMiddleware;

    createTanStackPaywall({
      runtime,
      middlewareFactory,
    });

    expect(capturedFacilitator).toBeTruthy();
    const authHeaders = await capturedFacilitator.createAuthHeaders();
    expect(authHeaders.verify.Authorization).toBe("Bearer facilitator-secret");
    expect(authHeaders.settle.Authorization).toBe("Bearer facilitator-secret");
    expect(authHeaders.supported.Authorization).toBe(
      "Bearer facilitator-secret"
    );
  });

  it.skip("returns PAYMENT-REQUIRED header with x402Version=2 when payment is missing", async () => {
    const routes: RoutesConfig = {
      "POST /pay": {
        accepts: {
          scheme: "exact",
          payTo: payments.payTo,
          price: "1.0",
          network: "eip155:84532",
        },
        description: "Pay",
        mimeType: "application/json",
      },
    };

    const middleware = paymentMiddleware(
      routes,
      { url: payments.facilitatorUrl }
    );

    const request = new Request("http://localhost/pay", { method: "POST" });
    type MiddlewareWithOptions = unknown & {
      options?: { server?: (args: any) => Promise<any> };
    };
    const middlewareWithOptions = middleware as MiddlewareWithOptions;
    const server = middlewareWithOptions.options?.server;
    expect(server).toBeDefined();
    const result = await server({
      request,
      pathname: "/pay",
      context: {},
      next: async () => ({
        request,
        pathname: "/pay",
        context: {},
        response: new Response("ok"),
      }),
    });

    expect(result.response.status).toBe(402);
    const paymentRequiredHeader = result.response.headers.get("PAYMENT-REQUIRED");
    expect(paymentRequiredHeader).toBeTruthy();
    expect(result.response.headers.get("X-Price")).toBeNull();
    const decoded = decodePaymentRequiredHeader(paymentRequiredHeader);
    expect(decoded?.price).toBe("1.0");
    expect(decoded?.network).toBe("eip155:84532");
    expect(decoded?.payTo?.toLowerCase()).toBe(payments.payTo.toLowerCase());
    const body = await result.response.json();
    expect(body.x402Version).toBe(2);
  });
});
