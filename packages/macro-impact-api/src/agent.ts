import { createAgent } from "@lucid-agents/core";
import { noopExtension as httpExtension } from "@lucid-agents/http";
import { paymentsFromEnv } from "@lucid-agents/payments";
import { noopExtension as walletExtension } from "@lucid-agents/wallet";
import { noopExtension as identityExtension } from "@lucid-agents/identity";
import { noopExtension as a2aExtension } from "@lucid-agents/a2a";
import { noopExtension as ap2Extension } from "@lucid-agents/ap2";
import { Hono } from "@lucid-agents/hono";
import { getEventsHandler } from "./routes/events";
import { getImpactVectorsHandler } from "./routes/impact-vectors";
import { postScenarioScoreHandler } from "./routes/scenario-score";
import { computeFreshness } from "./logic/events";

function assertEnv() {
  const receivable = process.env.PAYMENTS_RECEIVABLE_ADDRESS;
  if (!receivable) {
    throw new Error("PAYMENTS_RECEIVABLE_ADDRESS is required");
  }
  if (process.env.FACILITATOR_URL !== "https://facilitator.daydreams.systems") {
    throw new Error("FACILITATOR_URL must be https://facilitator.daydreams.systems");
  }
  if (process.env.NETWORK !== "base") {
    throw new Error("NETWORK must be base");
  }
}

function paymentRequired(c: any, priceUsdc: number) {
  return c.json(
    {
      error: {
        code: "PAYMENT_REQUIRED",
        message: `x402 payment required: ${priceUsdc.toFixed(3)} USDC`,
      },
      freshness: computeFreshness(new Date().toISOString(), 1),
    },
    402,
  );
}

function requirePayment(priceUsdc: number) {
  return async (c: any, next: () => Promise<Response>) => {
    const token = c.req.header("x402-payment");
    if (token !== "paid") {
      return paymentRequired(c, priceUsdc);
    }
    return await next();
  };
}

export function buildApp() {
  assertEnv();
  const payments = paymentsFromEnv();

  const agent = createAgent({
    name: "macro-impact-api",
    payments,
    extensions: [
      httpExtension({}),
      walletExtension({ network: "base" }),
      identityExtension({}),
      a2aExtension({}),
      ap2Extension({}),
    ],
  });
  void agent;

  const app = new Hono();

  app.get("/v1/macro/events", getEventsHandler);
  app.get("/v1/macro/impact-vectors", requirePayment(0.001), getImpactVectorsHandler);
  app.post("/v1/macro/scenario-score", requirePayment(0.002), postScenarioScoreHandler);

  return app;
}
