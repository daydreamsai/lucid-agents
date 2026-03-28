import * as LucidPayments from "@lucid-agents/payments";
import { env } from "./env";

const USD = "USD";

function json(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function paymentRequiredResponse(message = "Payment required for this endpoint."): Response {
  return json(
    402,
    {
      error: "Payment Required",
      message,
      x402: {
        amount: env.X402_PRICE_USD,
        currency: USD,
        network: env.X402_NETWORK,
        requiredHeader: env.X402_PAYMENT_HEADER
      }
    },
    {
      "x402-version": "1",
      "x402-amount-usd": env.X402_PRICE_USD,
      "x402-currency": USD,
      "x402-network": env.X402_NETWORK,
      "x402-required-header": env.X402_PAYMENT_HEADER
    }
  );
}

async function tryLucidPaymentValidation(request: Request, rawBody: string, paymentHeader: string): Promise<boolean | null> {
  const candidates = [
    "validateX402Payment",
    "validatePaymentHeader",
    "verifyPayment",
    "validatePayment",
    "isPaymentValid"
  ] as const;

  const pkg = LucidPayments as Record<string, unknown>;

  for (const name of candidates) {
    const fn = pkg[name];
    if (typeof fn !== "function") {
      continue;
    }

    try {
      const result = await (
        fn as (input: {
          paymentHeader: string;
          request: Request;
          headers: Headers;
          method: string;
          path: string;
          body: string;
          amount: string;
          currency: string;
        }) => Promise<unknown> | unknown
      )({
        paymentHeader,
        request,
        headers: request.headers,
        method: request.method,
        path: new URL(request.url).pathname,
        body: rawBody,
        amount: env.X402_PRICE_USD,
        currency: USD
      });

      if (typeof result === "boolean") {
        return result;
      }

      if (result && typeof result === "object") {
        const obj = result as Record<string, unknown>;

        if (typeof obj.valid === "boolean") {
          return obj.valid;
        }
        if (typeof obj.ok === "boolean") {
          return obj.ok;
        }
      }
    } catch {
      // try next strategy
    }
  }

  return null;
}

async function isValidPayment(request: Request, rawBody: string, paymentHeader: string): Promise<boolean> {
  const lucidResult = await tryLucidPaymentValidation(request, rawBody, paymentHeader);
  if (typeof lucidResult === "boolean") {
    return lucidResult;
  }

  // Fallback deterministic validator (token-based) for environments without a packaged validator.
  return paymentHeader === env.X402_PAYMENT_TOKEN;
}

export async function enforceX402Payment(request: Request, rawBody: string): Promise<Response | null> {
  const paymentHeader = request.headers.get(env.X402_PAYMENT_HEADER);

  if (!paymentHeader) {
    return paymentRequiredResponse();
  }

  const valid = await isValidPayment(request, rawBody, paymentHeader);

  if (!valid) {
    return paymentRequiredResponse("Invalid payment header.");
  }

  return null;
}