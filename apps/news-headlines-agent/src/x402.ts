import { createHmac, timingSafeEqual } from "node:crypto";
import * as LucidPayments from "@lucid-agents/payments";
import type { AppConfig } from "./config";
import { json } from "./http";

export interface PaymentValidationOk {
  ok: true;
}

export interface PaymentValidationFail {
  ok: false;
  reason: string;
}

export type PaymentValidationResult = PaymentValidationOk | PaymentValidationFail;

function canonicalTarget(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function secureHexEquals(leftHex: string, rightHex: string): boolean {
  try {
    const left = Buffer.from(leftHex, "hex");
    const right = Buffer.from(rightHex, "hex");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function buildPayload(
  method: string,
  target: string,
  priceUsd: string,
  timestamp: number,
  nonce: string,
): string {
  return `${method.toUpperCase()}:${target}:${priceUsd}:${timestamp}:${nonce}`;
}

async function tryLucidPaymentsVerification(
  request: Request,
  url: URL,
  config: AppConfig,
  paymentHeader: string,
): Promise<boolean | null> {
  const paymentModule = LucidPayments as Record<string, unknown>;
  const candidates = ["verifyX402Payment", "verifyPayment", "verifyPaymentHeader"];

  for (const fnName of candidates) {
    const maybeFn = paymentModule[fnName];
    if (typeof maybeFn !== "function") continue;

    try {
      const result = await (maybeFn as (...args: unknown[]) => unknown)({
        request,
        method: request.method.toUpperCase(),
        path: canonicalTarget(url),
        amountUsd: config.x402PriceUsd,
        paymentHeader,
      });

      if (result === true) return true;
      if (result === false) return false;

      if (typeof result === "object" && result !== null && "ok" in result) {
        return Boolean((result as { ok: boolean }).ok);
      }
    } catch {
      return null;
    }
  }

  return null;
}

export async function validatePaymentHeader(
  request: Request,
  url: URL,
  config: AppConfig,
): Promise<PaymentValidationResult> {
  const paymentHeader =
    request.headers.get("x402-payment") ||
    request.headers.get("x-payment") ||
    request.headers.get("payment");

  if (!paymentHeader) {
    return {
      ok: false,
      reason: "Missing payment header. Expected x402-payment.",
    };
  }

  const lucidResult = await tryLucidPaymentsVerification(request, url, config, paymentHeader);
  if (lucidResult === true) return { ok: true };
  if (lucidResult === false) {
    return { ok: false, reason: "Payment rejected by @lucid-agents/payments verifier." };
  }

  if (config.x402StaticValidHeader && paymentHeader === config.x402StaticValidHeader) {
    return { ok: true };
  }

  const match = /^v1:(\d{10}):([A-Za-z0-9_-]{8,64}):([a-f0-9]{64})$/.exec(paymentHeader.trim());
  if (!match) {
    return {
      ok: false,
      reason: "Invalid payment header format. Expected v1:<unix_ts>:<nonce>:<hmac_sha256_hex>.",
    };
  }

  const timestamp = Number.parseInt(match[1], 10);
  const nonce = match[2];
  const providedSignature = match[3];

  const now = Math.floor(Date.now() / 1000);
  const age = Math.abs(now - timestamp);
  if (age > config.x402MaxSkewSeconds) {
    return {
      ok: false,
      reason: `Expired payment signature (${age}s skew).`,
    };
  }

  const payload = buildPayload(
    request.method,
    canonicalTarget(url),
    config.x402PriceUsd,
    timestamp,
    nonce,
  );
  const expectedSignature = signPayload(payload, config.x402Secret);

  if (!secureHexEquals(providedSignature, expectedSignature)) {
    return {
      ok: false,
      reason: "Invalid payment signature.",
    };
  }

  return { ok: true };
}

export function paymentRequiredResponse(
  request: Request,
  url: URL,
  config: AppConfig,
  reason: string,
): Response {
  const target = canonicalTarget(url);

  return json(
    402,
    {
      error: "Payment Required",
      reason,
      x402: {
        amountUsd: config.x402PriceUsd,
        header: "x402-payment",
        algorithm: "hmac-sha256-v1",
        payloadTemplate: `${request.method.toUpperCase()}:${target}:${config.x402PriceUsd}:<unix_ts>:<nonce>`,
      },
    },
    {
      "www-authenticate": `x402 amount="${config.x402PriceUsd}", header="x402-payment"`,
      "x402-price-usd": config.x402PriceUsd,
      "x402-header": "x402-payment",
      "x402-algorithm": "hmac-sha256-v1",
    },
  );
}