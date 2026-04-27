import { describe, expect, it } from "bun:test";
import { X402Station, type X402StationOptions } from "../client";
import type { Signal } from "../types";

// Minimal stub Account satisfying the @lucid-agents/payments contract.
// createX402Fetch only inspects `address` (for logging) and signing
// methods (for 402 challenges). Tests below never round-trip a real
// 402, so a stub is sufficient.
const stubAccount = {
  address: "0x30d2b1f9bcEdE5F13136b56Ff199A8ad6E4f50de",
  signTypedData: () => Promise.resolve("0x" + "00".repeat(65)),
  signMessage: () => Promise.resolve("0x" + "00".repeat(65)),
  signTransaction: () => Promise.resolve("0x" + "00".repeat(65)),
} as unknown as X402StationOptions["account"];

interface CapturedCall {
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
}

/**
 * Build a fetchImpl that records each call (url, method, body, headers)
 * and returns the same canned response every time. Handles both
 * call shapes — `(string, init)` and `(Request)` — because
 * `@x402/fetch`'s `wrapFetchWithPayment` may construct a `Request`
 * before calling the underlying fetch.
 */
function buildFetchImpl(res: {
  status: number;
  bodyText: string;
  headers?: Record<string, string>;
}): { fetchImpl: typeof fetch; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: string;
    let method: string;
    let body: string;
    let headers: Record<string, string>;
    if (input instanceof Request) {
      url = input.url;
      method = input.method;
      headers = Object.fromEntries(input.headers);
      body = await input.clone().text();
    } else {
      url = typeof input === "string" ? input : input.toString();
      method = init?.method ?? "GET";
      const rawHeaders = init?.headers ?? {};
      headers = rawHeaders instanceof Headers
        ? Object.fromEntries(rawHeaders)
        : Array.isArray(rawHeaders)
          ? Object.fromEntries(rawHeaders)
          : (rawHeaders as Record<string, string>);
      body = typeof init?.body === "string" ? init.body : "";
    }
    calls.push({ url, method, body, headers });
    const respHeaders = new Headers(res.headers ?? {});
    return new Response(res.bodyText, { status: res.status, headers: respHeaders });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("X402Station — constructor", () => {
  it("uses canonical https://x402station.io by default", () => {
    const c = new X402Station({ account: stubAccount });
    expect((c as unknown as { baseUrl: string }).baseUrl).toBe("https://x402station.io");
  });

  it("accepts http(s)://localhost dev URL", () => {
    const c = new X402Station({ account: stubAccount, baseUrl: "http://localhost:3002" });
    expect((c as unknown as { baseUrl: string }).baseUrl).toBe("http://localhost:3002");
  });

  it("strips trailing slashes", () => {
    const c = new X402Station({ account: stubAccount, baseUrl: "https://x402station.io///" });
    expect((c as unknown as { baseUrl: string }).baseUrl).toBe("https://x402station.io");
  });

  it("rejects non-canonical, non-localhost host", () => {
    expect(() => new X402Station({ account: stubAccount, baseUrl: "https://evil.example" }))
      .toThrow(/baseUrl must be/i);
  });

  it("rejects malformed URL", () => {
    expect(() => new X402Station({ account: stubAccount, baseUrl: "not a url" }))
      .toThrow(/not a valid URL/i);
  });

  it("does not let a non-default port bypass the canonical check", () => {
    // u.hostname strips port; u.host keeps it. Implementation must
    // use u.host so this case fails.
    expect(() => new X402Station({ account: stubAccount, baseUrl: "https://x402station.io:9999" }))
      .toThrow(/baseUrl must be/i);
  });

  it("accepts IPv6 loopback dev URL [::1] (Greptile P2)", () => {
    const c = new X402Station({ account: stubAccount, baseUrl: "http://[::1]:3002" });
    expect((c as unknown as { baseUrl: string }).baseUrl).toBe("http://[::1]:3002");
  });

  it("rejects localhost.attacker.com (CodeRabbit: prefix-match bypass)", () => {
    // u.host.startsWith("localhost") would PASS this attacker domain.
    // Implementation must use u.hostname exact-match.
    expect(() => new X402Station({ account: stubAccount, baseUrl: "http://localhost.attacker.com" }))
      .toThrow(/baseUrl must be/i);
  });

  it("rejects 127.0.0.1.evil.example (CodeRabbit: prefix-match bypass)", () => {
    expect(() => new X402Station({ account: stubAccount, baseUrl: "http://127.0.0.1.evil.example" }))
      .toThrow(/baseUrl must be/i);
  });

  it("rejects localhost-impersonation suffixes", () => {
    expect(() => new X402Station({ account: stubAccount, baseUrl: "http://localhost-evil.example" }))
      .toThrow(/baseUrl must be/i);
  });
});

describe("X402Station — paid actions", () => {
  it("preflight POSTs the URL and returns parsed body + receipt", async () => {
    const fakeBody = {
      ok: false,
      warnings: ["dead", "zombie"] as Signal[],
      metadata: { url: "https://api.venice.ai/api/v1/chat/completions" },
    };
    const { fetchImpl, calls } = buildFetchImpl({
      status: 200,
      bodyText: JSON.stringify(fakeBody),
    });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    const out = await c.preflight({ url: "https://api.venice.ai/api/v1/chat/completions" });
    expect(out.result).toEqual(fakeBody);
    expect(out.paymentReceipt).toBeNull();
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe("https://x402station.io/api/v1/preflight");
    expect(calls[0]!.method).toBe("POST");
    expect(JSON.parse(calls[0]!.body)).toEqual({
      url: "https://api.venice.ai/api/v1/chat/completions",
    });
  });

  it("decodes the x-payment-response header into paymentReceipt", async () => {
    const receipt = { transaction: "0xabc", network: "eip155:8453" };
    const headerVal = btoa(JSON.stringify(receipt));
    const { fetchImpl } = buildFetchImpl({
      status: 200,
      bodyText: JSON.stringify({ ok: true, warnings: [], metadata: { url: "https://x" } }),
      headers: { "x-payment-response": headerVal },
    });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    const out = await c.preflight({ url: "https://x" });
    expect(out.paymentReceipt).toEqual(receipt);
  });

  it("forensics POSTs to /api/v1/forensics", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await c.forensics({ url: "https://x" });
    expect(calls[0]!.url).toBe("https://x402station.io/api/v1/forensics");
  });

  it("catalogDecoys POSTs an empty body", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await c.catalogDecoys();
    expect(calls[0]!.url).toBe("https://x402station.io/api/v1/catalog/decoys");
    expect(calls[0]!.body).toBe("{}");
  });

  it("whatsNew POSTs to /api/v1/whats-new with empty body when no args", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await c.whatsNew();
    expect(calls[0]!.url).toBe("https://x402station.io/api/v1/whats-new");
    expect(calls[0]!.body).toBe("{}");
  });

  it("whatsNew threads since + limit", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await c.whatsNew({ since: "2026-04-27T00:00:00Z", limit: 50 });
    expect(JSON.parse(calls[0]!.body)).toEqual({
      since: "2026-04-27T00:00:00Z",
      limit: 50,
    });
  });

  it("alternatives POSTs to /api/v1/alternatives with url body", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await c.alternatives({ url: "https://api.venice.ai/api/v1/chat/completions" });
    expect(calls[0]!.url).toBe("https://x402station.io/api/v1/alternatives");
    expect(JSON.parse(calls[0]!.body)).toEqual({
      url: "https://api.venice.ai/api/v1/chat/completions",
    });
  });

  it("alternatives accepts taskClass + limit, omits unset url", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await c.alternatives({ taskClass: "llm-completions", limit: 3 });
    const body = JSON.parse(calls[0]!.body);
    expect(body).toEqual({ taskClass: "llm-completions", limit: 3 });
    expect(body).not.toHaveProperty("url");
  });

  it("alternatives rejects empty input via zod refine", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await expect(c.alternatives({} as never)).rejects.toThrow(/at least one/i);
    expect(calls.length).toBe(0);
  });

  it("watch.subscribe omits signals when not provided", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await c.watch.subscribe({ url: "https://x", webhookUrl: "https://hook.example" });
    const body = JSON.parse(calls[0]!.body);
    expect(body).toEqual({ url: "https://x", webhookUrl: "https://hook.example" });
    expect(body).not.toHaveProperty("signals");
  });

  it("watch.subscribe includes signals when provided", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await c.watch.subscribe({
      url: "https://x",
      webhookUrl: "https://hook.example",
      signals: ["zombie", "decoy_price_extreme"],
    });
    const body = JSON.parse(calls[0]!.body);
    expect(body.signals).toEqual(["zombie", "decoy_price_extreme"]);
  });

  it("rejects an unknown signal in watch.subscribe via zod", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await expect(
      c.watch.subscribe({
        url: "https://x",
        webhookUrl: "https://hook.example",
        signals: ["bogus"] as unknown as Signal[],
      }),
    ).rejects.toThrow();
    expect(calls.length).toBe(0);
  });

  it("rejects http:// webhookUrl via zod (Greptile P1: HMAC payloads must travel encrypted)", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await expect(
      c.watch.subscribe({
        url: "https://endpoint.example",
        webhookUrl: "http://insecure-webhook.example",
      }),
    ).rejects.toThrow(/HTTPS/i);
    expect(calls.length).toBe(0);
  });

  it("flags malformed payment-response header with malformed:true (Greptile P2)", async () => {
    const { fetchImpl } = buildFetchImpl({
      status: 200,
      bodyText: JSON.stringify({ ok: true, warnings: [], metadata: { url: "https://x" } }),
      headers: { "x-payment-response": "not-base64-and-not-json!!!" },
    });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    const out = await c.preflight({ url: "https://x" });
    expect(out.paymentReceipt).toEqual({
      raw: "not-base64-and-not-json!!!",
      malformed: true,
    });
  });

  it("throws a descriptive error on non-2xx", async () => {
    const { fetchImpl } = buildFetchImpl({ status: 503, bodyText: "upstream timeout" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await expect(c.preflight({ url: "https://x" })).rejects.toThrow(
      /503.*upstream timeout/i,
    );
  });

  it("aborts a hung fetch via AbortSignal.timeout (Greptile P2)", async () => {
    // fetchImpl that never resolves until the abort signal fires.
    // wrapFetchWithPayment may call us with `(Request)` instead of
    // `(url, init)` — in that case the signal lives on `request.signal`
    // not `init.signal`, so check both.
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const signal =
        init?.signal ??
        (input instanceof Request ? input.signal : undefined);
      return new Promise<Response>((_resolve, reject) => {
        if (!signal) return; // never resolves; test would only hit this on a buggy impl
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;
    const c = new X402Station({ account: stubAccount, fetchImpl, timeoutMs: 50 });
    await expect(c.preflight({ url: "https://x" })).rejects.toThrow(/timed out after 50ms/);
  });
});

describe("X402Station — free, secret-gated watch endpoints", () => {
  const validId = "0a44f6b8-3b7d-4f2a-9e3a-2c5fd1b0aa11";
  const validSecret = "a".repeat(64);

  it("watch.status uses GET + secret header (no payment wrapper)", async () => {
    const { fetchImpl, calls } = buildFetchImpl({
      status: 200,
      bodyText: JSON.stringify({ isActive: true, alertsRemaining: 100 }),
    });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    const out = await c.watch.status({ watchId: validId, secret: validSecret });
    expect((out as { isActive: boolean; alertsRemaining: number }).isActive).toBe(true);
    expect((out as { alertsRemaining: number }).alertsRemaining).toBe(100);
    expect(calls[0]!.url).toBe(
      `https://x402station.io/api/v1/watch/${validId}`,
    );
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.headers["x-x402station-secret"]).toBe(validSecret);
  });

  it("watch.unsubscribe issues DELETE", async () => {
    const { fetchImpl, calls } = buildFetchImpl({
      status: 200,
      bodyText: JSON.stringify({ watchId: "id", isActive: false, message: "unsubscribed" }),
    });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await c.watch.unsubscribe({ watchId: validId, secret: "b".repeat(64) });
    expect(calls[0]!.method).toBe("DELETE");
  });

  it("watch.status throws on 404 (wrong secret OR missing watch — server returns 404 for both)", async () => {
    const { fetchImpl } = buildFetchImpl({
      status: 404,
      bodyText: '{"error":"watch not found"}',
    });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await expect(
      c.watch.status({ watchId: validId, secret: "c".repeat(64) }),
    ).rejects.toThrow(/404.*watch not found/i);
  });

  it("watch.status validates secret format before any network call", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await expect(
      c.watch.status({ watchId: validId, secret: "tooshort" }),
    ).rejects.toThrow();
    expect(calls.length).toBe(0);
  });

  it("watch.status validates watchId is a UUID before any network call", async () => {
    const { fetchImpl, calls } = buildFetchImpl({ status: 200, bodyText: "{}" });
    const c = new X402Station({ account: stubAccount, fetchImpl });
    await expect(
      c.watch.status({ watchId: "not-a-uuid", secret: validSecret }),
    ).rejects.toThrow();
    expect(calls.length).toBe(0);
  });
});
