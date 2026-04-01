import { config } from "./config";
import { lucidRuntimeHeaders, verifyWithLucidPayments } from "./lucid";

export interface PaymentOk {
  readonly ok: true;
  readonly token: string;
}

export interface PaymentFail {
  readonly ok: false;
  readonly response: Response;
}

export type PaymentResult = PaymentOk | PaymentFail;

const HEADER_CANDIDATES = ["x402-payment", "x-payment", "payment", "authorization"] as const;

function json(status: number, data: unknown): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    ...lucidRuntimeHeaders()
  });

  return new Response(JSON.stringify(data), { status, headers });
}

function normalizeToken(rawHeader: string): string {
  const trimmed = rawHeader.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
}

function findPaymentHeader(request: Request): string | null {
  const explicit = request.headers.get(config.paymentHeaderName);
  if (explicit) return explicit;

  for (const headerName of HEADER_CANDIDATES) {
    const value = request.headers.get(headerName);
    if (value) return value;
  }

  return null;
}

function getAcceptedTokens(): Set<string> {
  const tokens = new Set<string>();

  for (const token of config.validTokens) {
    tokens.add(token);
  }

  if (config.fallbackPaymentToken.length > 0) {
    tokens.add(config.fallbackPaymentToken);
  }

  return tokens;
}

function paymentRequiredResponse(reason: "missing_payment" | "invalid_payment"): Response {
  const message =
    reason === "missing_payment"
      ? "Payment required. Include a valid x402 payment header."
      : "Invalid payment. Include a valid x402 payment header.";

  return json(402, {
    error: "payment_required",
    reason,
    message,
    x402: {
      amountUsd: config.priceUsd,
      acceptedHeader: config.paymentHeaderName,
      endpoint: "/sentiment",
      method: "POST"
    }
  });
}

export async function enforceX402(request: Request): Promise<PaymentResult> {
  const headerValue = findPaymentHeader(request);
  if (!headerValue) {
    return { ok: false, response: paymentRequiredResponse("missing_payment") };
  }

  const token = normalizeToken(headerValue);
  const acceptedTokens = getAcceptedTokens();

  if (acceptedTokens.has(token)) {
    return { ok: true, token };
  }

  const lucidVerified = await verifyWithLucidPayments({
    request,
    paymentHeader: token,
    amountUsd: config.priceUsd
  });

  if (lucidVerified) {
    return { ok: true, token };
  }

  return { ok: false, response: paymentRequiredResponse("invalid_payment") };
}