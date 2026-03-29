import * as LucidPayments from "@lucid-agents/payments";
import type { PaymentVerificationResult } from "./types";

export const PRICE_USD = Number(Bun.env.X402_PRICE_USD ?? "0.001");

const PAYMENT_HEADERS = ["x402-payment", "x-payment", "payment", "authorization"] as const;

function normalizeToken(input: string): string {
  return input.trim().replace(/^(x402|bearer)\s+/i, "").trim();
}

function getExpectedToken(): string {
  return (Bun.env.X402_PAYMENT_TOKEN ?? "dev-paid-token").trim();
}

function extractPaymentToken(request: Request): string | null {
  for (const header of PAYMENT_HEADERS) {
    const value = request.headers.get(header);
    if (value && value.trim().length > 0) {
      return normalizeToken(value);
    }
  }
  return null;
}

async function tryLucidPaymentsVerification(request: Request): Promise<boolean | null> {
  const payments = LucidPayments as Record<string, unknown>;
  const candidateFunctions = [
    "verifyPayment",
    "verifyX402Payment",
    "verifyRequestPayment",
    "validatePayment",
  ] as const;

  for (const fnName of candidateFunctions) {
    const fn = payments[fnName];
    if (typeof fn !== "function") continue;

    try {
      const result = await (fn as (args: Record<string, unknown>) => Promise<unknown>)({
        request,
        amountUsd: PRICE_USD,
        route: "/weather",
      });

      if (result === true) return true;
      if (result && typeof result === "object") {
        const obj = result as Record<string, unknown>;
        if (obj.ok === true || obj.valid === true || obj.paid === true) {
          return true;
        }
      }
    } catch {
      // Keep trying known signatures, then fallback to local check.
    }
  }

  return null;
}

export async function verifyPayment(request: Request): Promise<PaymentVerificationResult> {
  const token = extractPaymentToken(request);
  if (!token) {
    return { ok: false, reason: "missing_payment_header" };
  }

  const lucidResult = await tryLucidPaymentsVerification(request);
  if (lucidResult === true) {
    return { ok: true };
  }

  const expected = getExpectedToken();
  if (token === expected) {
    return { ok: true };
  }

  return { ok: false, reason: "invalid_payment" };
}

async function tryLucidPaymentRequiredResponse(): Promise<Response | null> {
  const payments = LucidPayments as Record<string, unknown>;
  const candidateFunctions = [
    "createPaymentRequiredResponse",
    "paymentRequired",
    "challengeResponse",
  ] as const;

  for (const fnName of candidateFunctions) {
    const fn = payments[fnName];
    if (typeof fn !== "function") continue;

    try {
      const result = await (fn as (args: Record<string, unknown>) => Promise<unknown>)({
        amountUsd: PRICE_USD,
        route: "/weather",
        protocol: "x402",
      });

      if (result instanceof Response) return result;
    } catch {
      // Fall through to local response.
    }
  }

  return null;
}

export async function paymentRequiredResponse(reason = "payment_required"): Promise<Response> {
  const lucid = await tryLucidPaymentRequiredResponse();
  if (lucid) return lucid;

  return new Response(
    JSON.stringify({
      error: reason,
      protocol: "x402",
      amount_usd: PRICE_USD,
      required_header: "x-payment",
      message: "Payment required. Send a valid x402 payment token in x-payment header.",
    }),
    {
      status: 402,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "www-authenticate": `x402 realm="weather", amount="${PRICE_USD.toFixed(3)}"`,
        "x-payment-required": "true",
      },
    },
  );
}

export async function requirePaidRequest(request: Request): Promise<Response | null> {
  const verified = await verifyPayment(request);
  if (verified.ok) {
    return null;
  }
  return paymentRequiredResponse(verified.reason);
}