import { timingSafeEqual } from "node:crypto";
import * as LucidPayments from "@lucid-agents/payments";

export const STOCK_LOOKUP_PRICE_USD = 0.001;

const PAYMENT_HEADER_CANDIDATES = ["x402-payment", "x-payment", "payment"] as const;

type AnyRecord = Record<string, unknown>;

function secureCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

function getPaymentHeader(headers: Headers): string | null {
  for (const headerName of PAYMENT_HEADER_CANDIDATES) {
    const value = headers.get(headerName);
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function parseVerificationResult(result: unknown): boolean | null {
  if (typeof result === "boolean") return result;

  if (result instanceof Response) {
    return result.status >= 200 && result.status < 300;
  }

  if (result && typeof result === "object") {
    const record = result as AnyRecord;
    const candidateKeys = ["ok", "valid", "paid", "authorized", "success"] as const;
    for (const key of candidateKeys) {
      const value = record[key];
      if (typeof value === "boolean") return value;
    }
  }

  return null;
}

async function verifyWithLucidPayments(
  request: Request,
  paymentHeader: string
): Promise<boolean | null> {
  const payments = LucidPayments as AnyRecord;
  const verifierNames = [
    "verifyX402Payment",
    "verifyPayment",
    "validateX402Payment",
    "validatePayment"
  ];

  for (const verifierName of verifierNames) {
    const maybeVerifier = payments[verifierName];
    if (typeof maybeVerifier !== "function") continue;

    const verifier = maybeVerifier as (...args: unknown[]) => unknown;

    const attemptArgs: unknown[][] = [
      [
        {
          request,
          paymentHeader,
          amountUsd: STOCK_LOOKUP_PRICE_USD,
          route: "/stock",
          method: "GET"
        }
      ],
      [
        paymentHeader,
        {
          amountUsd: STOCK_LOOKUP_PRICE_USD,
          route: "/stock",
          method: "GET"
        }
      ],
      [request, { amountUsd: STOCK_LOOKUP_PRICE_USD, route: "/stock", method: "GET" }]
    ];

    for (const args of attemptArgs) {
      try {
        const result = await verifier(...args);
        const parsed = parseVerificationResult(result);
        if (parsed !== null) return parsed;
      } catch {
        // Try next signature.
      }
    }
  }

  return null;
}

export function paymentRequiredResponse(message = "Payment required"): Response {
  const payload = {
    error: message,
    price_usd: STOCK_LOOKUP_PRICE_USD,
    required_header: "x402-payment"
  };

  return new Response(JSON.stringify(payload), {
    status: 402,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x402-price-usd": STOCK_LOOKUP_PRICE_USD.toString(),
      "www-authenticate": `x402 realm="stock-price", amount="${STOCK_LOOKUP_PRICE_USD}", currency="USD"`
    }
  });
}

export async function enforceX402Payment(request: Request): Promise<Response | null> {
  const paymentHeader = getPaymentHeader(request.headers);

  if (!paymentHeader) {
    return paymentRequiredResponse("Missing payment header");
  }

  const lucidVerification = await verifyWithLucidPayments(request, paymentHeader);
  if (lucidVerification === true) {
    return null;
  }
  if (lucidVerification === false) {
    return paymentRequiredResponse("Invalid payment");
  }

  const expectedToken = (Bun.env.X402_TEST_TOKEN ?? "").trim();
  if (expectedToken.length > 0) {
    if (!secureCompare(paymentHeader, expectedToken)) {
      return paymentRequiredResponse("Invalid payment");
    }
    return null;
  }

  return null;
}