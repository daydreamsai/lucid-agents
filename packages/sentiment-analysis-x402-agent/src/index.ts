import * as LucidHttp from "@lucid-agents/http";
import * as LucidPayments from "@lucid-agents/payments";
import { assertStartupConfig, env } from "./env";
import { startHttpServer } from "./http";
import { enforceX402Payment } from "./payment";
import { analyzeSentiment } from "./sentiment";
import type { SentimentRequestBody } from "./types";

function json(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

function parseSentimentRequest(rawBody: string): SentimentRequestBody | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const text = (parsed as { text?: unknown }).text;
    if (typeof text !== "string") {
      return null;
    }

    return { text };
  } catch {
    return null;
  }
}

async function handleSentiment(request: Request): Promise<Response> {
  const rawBody = await request.text();

  const paymentResponse = await enforceX402Payment(request, rawBody);
  if (paymentResponse) {
    return paymentResponse;
  }

  const payload = parseSentimentRequest(rawBody);
  if (!payload) {
    return json(400, {
      error: "Bad Request",
      message: "Expected JSON body: {\"text\":\"I love this product\"}"
    });
  }

  try {
    const sentiment = await analyzeSentiment(payload.text);
    return json(200, sentiment);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected sentiment provider error.";
    return json(502, {
      error: "Sentiment Provider Error",
      message
    });
  }
}

async function requestHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === "/") {
    return json(200, {
      name: "sentiment-analysis-x402-agent",
      endpoints: ["POST /sentiment", "GET /health"]
    });
  }

  if (request.method === "GET" && path === "/health") {
    return json(200, {
      ok: true,
      service: "sentiment-analysis-x402-agent",
      lucidHttpExports: Object.keys(LucidHttp).length,
      lucidPaymentExports: Object.keys(LucidPayments).length,
      paymentHeader: env.X402_PAYMENT_HEADER,
      priceUsd: env.X402_PRICE_USD
    });
  }

  if (request.method === "POST" && path === "/sentiment") {
    return handleSentiment(request);
  }

  return json(404, {
    error: "Not Found"
  });
}

assertStartupConfig();

const server = await startHttpServer(env.PORT, requestHandler);

console.log(
  `[sentiment-analysis-x402-agent] listening on port ${env.PORT} via ${server.flavor}`
);

const stop = async () => {
  if (server.stop) {
    await server.stop();
  }
  process.exit(0);
};

process.on("SIGINT", () => {
  void stop();
});

process.on("SIGTERM", () => {
  void stop();
});