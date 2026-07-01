import * as LucidPayments from "@lucid-agents/payments";
import { PRICE_USD, X402_VALID_TOKEN } from "./config";
import { json } from "./http";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizePaymentResult(result: unknown): boolean | null {
  if (typeof result === "boolean") {
    return result;
  }

  const obj = asRecord(result);
  if (!obj) {
    return null;
  }

  const candidates = ["valid", "paid", "ok", "success"];
  for (const key of candidates) {
    const value = obj[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

async function verifyWithLucidPayments(request: Request): Promise<boolean | null> {
  const lucidPayments = LucidPayments as Record<string, unknown>;
  const functionNames = [
    "verifyX402Payment",
    "verifyPayment",
    "validatePayment",
    "checkPayment",
    "isPaymentValid",
  ];

  for (const functionName of functionNames) {
    const candidate = lucidPayments[functionName];
    if (typeof candidate !== "function") {
      continue;
    }

    const fn = candidate as (...args: unknown[]) => unknown;
    const callShapes: Array<unknown[]> = [
      [request, { amountUsd: PRICE_USD, currency: "USD" }],
      [{ request, amountUsd: PRICE_USD, currency: "USD" }],
      [{ headers: request.headers, amountUsd: PRICE_USD, currency: "USD" }],
      [request],
    ];

    for (const args of callShapes) {
      try {
        const output = await fn(...args);
        const normalized = normalizePaymentResult(output);
        if (normalized === true) {
          return true;
        }
      } catch {
        // try next shape/export
      }
    }
  }

  return null;
}

function extractPaymentToken(headers: Headers): string | null {
  const candidates = ["x402-payment", "x-payment", "payment", "authorization"];

  for (const name of candidates) {
    const raw = headers.get(name);
    if (!raw) {
      continue;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    if (name === "authorization") {
      const bearerPrefix = "Bearer ";
      if (trimmed.startsWith(bearerPrefix)) {
        const token = trimmed.slice(bearerPrefix.length).trim();
        return token.length > 0 ? token : null;
      }
    }

    return trimmed;
  }

  return null;
}

function verifyFallbackToken(request: Request): boolean {
  const token = extractPaymentToken(request.headers);
  if (!token) {
    return false;
  }

  const allowedTokens = X402_VALID_TOKEN.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return allowedTokens.includes(token);
}

function paymentRequiredResponse(): Response {
  return json(
    {
      error: "Payment required",
      message: "This endpoint costs $0.001/request via x402. Add a valid payment header.",
      priceUsd: PRICE_USD,
      acceptedHeaders: ["x402-payment", "x-payment", "authorization: Bearer <token>"],
    },
    {
      status: 402,
      headers: {
        "x402-required": "true",
        "x402-price-usd": PRICE_USD.toFixed(3),
        "x402-currency": "USD",
      },
    },
  );
}

export async function ensurePaid(request: Request): Promise<Response | null> {
  const lucidResult = await verifyWithLucidPayments(request);
  if (lucidResult === true) {
    return null;
  }

  if (verifyFallbackToken(request)) {
    return null;
  }

  return paymentRequiredResponse();
}