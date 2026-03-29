import { beforeEach, describe, expect, test } from "bun:test";
import { buildApp } from "../../src/agent";

const env = {
  PAYMENTS_RECEIVABLE_ADDRESS: "0x1111111111111111111111111111111111111111",
  FACILITATOR_URL: "https://facilitator.daydreams.systems",
  NETWORK: "base",
};

describe("integration: macro impact API", () => {
  beforeEach(() => {
    Object.entries(env).forEach(([k, v]) => (process.env[k] = v));
  });

  test("GET /v1/macro/events is free", async () => {
    const app = buildApp();
    const res = await app.fetch(new Request("http://localhost/v1/macro/events"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.event_feed)).toBe(true);
    expect(body.freshness).toBeDefined();
  });

  test("GET /v1/macro/impact-vectors returns 402 without payment", async () => {
    const app = buildApp();
    const res = await app.fetch(new Request("http://localhost/v1/macro/impact-vectors?sectorSet=equities&horizon=30d"));
    expect(res.status).toBe(402);

    const body = await res.json();
    expect(body.error.code).toBe("PAYMENT_REQUIRED");
    expect(body.freshness).toBeDefined();
  });

  test("GET /v1/macro/impact-vectors succeeds with payment", async () => {
    const app = buildApp();
    const req = new Request("http://localhost/v1/macro/impact-vectors?sectorSet=equities&horizon=30d", {
      headers: { "x402-payment": "paid" },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.impact_vector)).toBe(true);
    expect(body.confidence_band).toBeDefined();
  });

  test("POST /v1/macro/scenario-score enforces payment", async () => {
    const app = buildApp();
    const unpaid = await app.fetch(
      new Request("http://localhost/v1/macro/scenario-score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assumptions: { rateChangeBps: -25, cpiDelta: -0.2, gdpDelta: 0.2, geopoliticalRisk: 0.3 }, targets: ["SPX"], horizon: "90d" }),
      }),
    );
    expect(unpaid.status).toBe(402);

    const paid = await app.fetch(
      new Request("http://localhost/v1/macro/scenario-score", {
        method: "POST",
        headers: { "content-type": "application/json", "x402-payment": "paid" },
        body: JSON.stringify({ assumptions: { rateChangeBps: -25, cpiDelta: -0.2, gdpDelta: 0.2, geopoliticalRisk: 0.3 }, targets: ["SPX"], horizon: "90d" }),
      }),
    );
    expect(paid.status).toBe(200);

    const body = await paid.json();
    expect(body.scenario_score).toBeDefined();
  });

  test("fails startup when receivable address missing", () => {
    delete process.env.PAYMENTS_RECEIVABLE_ADDRESS;
    expect(() => buildApp()).toThrow("PAYMENTS_RECEIVABLE_ADDRESS");
  });
});
