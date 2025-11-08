import type { EntrypointDef, PaymentsConfig } from "./types";
import { resolveEntrypointPrice } from "./agent";

export type PaywallContext = {
  request: {
    method: string;
    url: string;
    headers: Headers;
    body?: unknown;
  };
  entrypoint: EntrypointDef;
  payments: PaymentsConfig;
  kind: "invoke" | "stream";
};

export type PaywallResult =
  | { ok: true }
  | { ok: false; status: number; body: unknown };

export async function validatePayment(
  ctx: PaywallContext
): Promise<PaywallResult> {
  const { entrypoint, payments, kind } = ctx;

  const price = resolveEntrypointPrice(entrypoint, payments, kind);
  if (!price) {
    // Entry point is free – consider paywall satisfied.
    return { ok: true };
  }

  const network = entrypoint.network ?? payments.network;
  const proofHeaders = extractPaymentHeaders(ctx.request.headers);

  if (!proofHeaders) {
    return {
      ok: false,
      status: 402,
      body: {
        error: "Payment Required",
        price,
        network,
        facilitatorUrl: payments.facilitatorUrl,
      },
    };
  }

  const isValid = await verifyPaymentProof({
    payTo: payments.payTo,
    price,
    network,
    facilitatorUrl: payments.facilitatorUrl,
    proof: proofHeaders,
    requestMethod: ctx.request.method,
    requestUrl: ctx.request.url,
    requestBody: ctx.request.body,
  });

  if (!isValid) {
    return {
      ok: false,
      status: 402,
      body: { error: "Invalid payment proof" },
    };
  }

  return { ok: true };
}

type PaymentProofHeaders = Record<string, string>;

function extractPaymentHeaders(headers: Headers): PaymentProofHeaders | null {
  const proofEntries: PaymentProofHeaders = {};
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase().startsWith("x402-")) {
      proofEntries[key.toLowerCase()] = value;
    }
  }

  if (Object.keys(proofEntries).length === 0) {
    return null;
  }

  // Minimal required headers per x402 spec
  if (!proofEntries["x402-proof"] || !proofEntries["x402-signature"]) {
    return null;
  }

  return proofEntries;
}

type VerifyPaymentOptions = {
  payTo: PaymentsConfig["payTo"];
  price: string;
  network: PaymentsConfig["network"];
  facilitatorUrl: PaymentsConfig["facilitatorUrl"];
  proof: PaymentProofHeaders;
  requestMethod: string;
  requestUrl: string;
  requestBody?: unknown;
};

async function verifyPaymentProof(
  options: VerifyPaymentOptions
): Promise<boolean> {
  try {
    const response = await fetch(
      new URL("/verify", options.facilitatorUrl).toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payTo: options.payTo,
          price: options.price,
          network: options.network,
          proof: options.proof,
          request: {
            method: options.requestMethod,
            url: options.requestUrl,
            body: options.requestBody,
          },
        }),
      }
    );

    if (!response.ok) return false;
    const result = (await response.json()) as { valid?: boolean };
    return result.valid === true;
  } catch (error) {
    console.error("[agent-core] verifyPaymentProof failed", error);
    return false;
  }
}
