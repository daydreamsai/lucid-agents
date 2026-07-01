import * as LucidPayments from "@lucid-agents/payments";
import type { PaymentVerificationResult } from "./types";

interface PaymentEnforcerOptions {
  priceUsd: number;
  resource: string;
  network: string;
  payTo?: string;
  devToken?: string;
}

interface InternalVerificationResult {
  ok: boolean;
  headers?: Record<string, string>;
  message?: string;
}

const PAYMENT_HEADER_CANDIDATES = ["x402-payment", "x-payment", "authorization"];

function toHeaderRecord(value: unknown): Record<string, string> {
  if (!value) {
    return {};
  }

  if (value instanceof Headers) {
    const out: Record<string, string> = {};
    for (const [k, v] of value.entries()) {
      out[k] = v;
    }
    return out;
  }

  if (Array.isArray(value)) {
    const out: Record<string, string> = {};
    for (const entry of value) {
      if (Array.isArray(entry) && entry.length === 2) {
        out[String(entry[0])] = String(entry[1]);
      }
    }
    return out;
  }

  if (typeof value === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v != null) {
        out[k] = String(v);
      }
    }
    return out;
  }

  return {};
}

function extractPaymentHeader(request: Request): string | null {
  for (const headerName of PAYMENT_HEADER_CANDIDATES) {
    const raw = request.headers.get(headerName);
    if (!raw) {
      continue;
    }

    if (headerName === "authorization") {
      const lower = raw.toLowerCase();
      if (lower.startsWith("bearer ")) {
        return raw.slice(7).trim();
      }
      if (lower.startsWith("x402 ")) {
        return raw.slice(5).trim();
      }
    }

    return raw.trim();
  }

  return null;
}

function collectContainers(lib: Record<string, unknown>): Record<string, unknown>[] {
  const containers: Record<string, unknown>[] = [lib];
  const nestedKeys = ["default", "x402", "payments", "payment"];

  for (const key of nestedKeys) {
    const value = lib[key];
    if (value && typeof value === "object") {
      containers.push(value as Record<string, unknown>);
    }
  }

  return containers;
}

async function tryInvoke(
  fn: (...args: unknown[]) => unknown,
  request: Request,
  paymentHeader: string,
  context: Record<string, unknown>
): Promise<unknown> {
  const attempts: Array<() => unknown> = [
    () => fn(request, context),
    () => fn(context),
    () => fn(paymentHeader, context),
    () => fn({ request, paymentHeader, ...context })
  ];

  for (const attempt of attempts) {
    try {
      const result = await Promise.resolve(attempt());
      if (result !== undefined) {
        return result;
      }
    } catch {
      // Try next invocation pattern.
    }
  }

  return undefined;
}

function parseVerifierResult(raw: unknown): InternalVerificationResult | null {
  if (typeof raw === "boolean") {
    return { ok: raw };
  }

  if (raw instanceof Response) {
    return {
      ok: raw.status < 400,
      headers: toHeaderRecord(raw.headers),
      message: raw.status >= 400 ? `Payment rejected with status ${raw.status}` : undefined
    };
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const ok =
    Boolean(value.ok) ||
    Boolean(value.valid) ||
    Boolean(value.paid) ||
    Boolean(value.success) ||
    Boolean(value.verified) ||
    (typeof value.status === "number" && value.status < 400);

  const headers = toHeaderRecord(value.headers ?? value.challengeHeaders ?? value.paymentHeaders);
  const messageCandidate = value.message ?? value.error ?? value.reason;
  const message = typeof messageCandidate === "string" ? messageCandidate : undefined;

  return { ok, headers, message };
}

async function verifyWithLucidLibrary(
  request: Request,
  paymentHeader: string,
  options: PaymentEnforcerOptions
): Promise<InternalVerificationResult | null> {
  const lib = LucidPayments as Record<string, unknown>;
  const containers = collectContainers(lib);
  const functionNames = [
    "verifyPayment",
    "verifyRequestPayment",
    "validatePayment",
    "verify",
    "checkPayment"
  ];

  const context = {
    amountUsd: options.priceUsd,
    amount: options.priceUsd,
    currency: "USD",
    resource: options.resource,
    network: options.network,
    payTo: options.payTo,
    paymentHeader
  };

  for (const container of containers) {
    for (const functionName of functionNames) {
      const candidate = container[functionName];
      if (typeof candidate !== "function") {
        continue;
      }

      const raw = await tryInvoke(candidate as (...args: unknown[]) => unknown, request, paymentHeader, context);
      const parsed = parseVerifierResult(raw);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

async function buildChallengeHeadersFromLibrary(
  options: PaymentEnforcerOptions
): Promise<Record<string, string>> {
  const lib = LucidPayments as Record<string, unknown>;
  const containers = collectContainers(lib);
  const functionNames = [
    "build402Headers",
    "buildPaymentRequiredHeaders",
    "paymentRequiredHeaders",
    "createPaymentRequiredHeaders",
    "challengeHeaders",
    "getPaymentRequestHeaders"
  ];

  const context = {
    amountUsd: options.priceUsd,
    amount: options.priceUsd,
    currency: "USD",
    resource: options.resource,
    network: options.network,
    payTo: options.payTo
  };

  for (const container of containers) {
    for (const functionName of functionNames) {
      const candidate = container[functionName];
      if (typeof candidate !== "function") {
        continue;
      }

      try {
        const result = await Promise.resolve((candidate as (...args: unknown[]) => unknown)(context));
        if (result) {
          if (result instanceof Response) {
            return toHeaderRecord(result.headers);
          }
          return toHeaderRecord(result);
        }
      } catch {
        // Try next candidate
      }
    }
  }

  return {};
}

function normalizePrice(priceUsd: number): number {
  if (Number.isFinite(priceUsd) && priceUsd > 0) {
    return priceUsd;
  }
  return 0.001;
}

export class X402PaymentEnforcer {
  private readonly options: PaymentEnforcerOptions;

  constructor(options: PaymentEnforcerOptions) {
    this.options = {
      ...options,
      priceUsd: normalizePrice(options.priceUsd)
    };
  }

  private async challengeHeaders(): Promise<Record<string, string>> {
    const baseHeaders: Record<string, string> = {
      "x402-required": "true",
      "x402-price-usd": this.options.priceUsd.toFixed(3),
      "x402-currency": "USD",
      "x402-resource": this.options.resource,
      "x402-network": this.options.network,
      "www-authenticate": `x402 resource="${this.options.resource}", amount_usd="${this.options.priceUsd.toFixed(3)}"`
    };

    if (this.options.payTo) {
      baseHeaders["x402-pay-to"] = this.options.payTo;
    }

    const libraryHeaders = await buildChallengeHeadersFromLibrary(this.options);
    return { ...baseHeaders, ...libraryHeaders };
  }

  async verify(request: Request): Promise<PaymentVerificationResult> {
    const paymentHeader = extractPaymentHeader(request);

    if (!paymentHeader) {
      return {
        ok: false,
        message: "Missing payment header",
        headers: await this.challengeHeaders()
      };
    }

    const libraryResult = await verifyWithLucidLibrary(request, paymentHeader, this.options);
    if (libraryResult) {
      if (libraryResult.ok) {
        return {
          ok: true,
          headers: {
            "x402-status": "paid",
            ...(libraryResult.headers ?? {})
          }
        };
      }

      return {
        ok: false,
        message: libraryResult.message ?? "Invalid payment",
        headers: {
          ...(await this.challengeHeaders()),
          ...(libraryResult.headers ?? {})
        }
      };
    }

    if (this.options.devToken && paymentHeader === this.options.devToken) {
      return {
        ok: true,
        headers: {
          "x402-status": "paid",
          "x402-verification": "dev-token"
        }
      };
    }

    return {
      ok: false,
      message: "Invalid payment",
      headers: await this.challengeHeaders()
    };
  }
}

export function createPaymentEnforcer(options: PaymentEnforcerOptions): X402PaymentEnforcer {
  return new X402PaymentEnforcer(options);
}