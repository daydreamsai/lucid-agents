import * as LucidHttpModule from "@lucid-agents/http";
import * as LucidPaymentsModule from "@lucid-agents/payments";

type AnyRecord = Record<string, unknown>;
type AnyFunction = (...args: any[]) => unknown;

const lucidHttp = LucidHttpModule as unknown as AnyRecord;
const lucidPayments = LucidPaymentsModule as unknown as AnyRecord;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null;
}

function asFunction(value: unknown): AnyFunction | null {
  return typeof value === "function" ? (value as AnyFunction) : null;
}

function resultIsValid(result: unknown): boolean {
  if (typeof result === "boolean") return result;
  if (!isRecord(result)) return false;

  const candidates = ["ok", "valid", "verified", "success", "accepted", "paid"];
  for (const key of candidates) {
    if (result[key] === true) return true;
  }

  return false;
}

function getCandidateVerifiers(moduleRoot: AnyRecord): AnyFunction[] {
  const names = [
    "verifyPayment",
    "verifyX402Payment",
    "validatePayment",
    "verify",
    "checkPayment",
    "authenticatePayment"
  ];

  const roots: unknown[] = [
    moduleRoot,
    moduleRoot.payments,
    moduleRoot.x402,
    moduleRoot.payment,
    moduleRoot.verifier
  ];

  const verifiers: AnyFunction[] = [];

  for (const root of roots) {
    if (!isRecord(root)) continue;
    for (const name of names) {
      const fn = asFunction(root[name]);
      if (fn) verifiers.push(fn);
    }
  }

  return verifiers;
}

export async function verifyWithLucidPayments(args: {
  request: Request;
  paymentHeader: string;
  amountUsd: number;
}): Promise<boolean> {
  const verifiers = getCandidateVerifiers(lucidPayments);
  if (verifiers.length === 0) return false;

  const payload = {
    request: args.request,
    headers: args.request.headers,
    paymentHeader: args.paymentHeader,
    amountUsd: args.amountUsd,
    priceUsd: args.amountUsd,
    amount: args.amountUsd
  };

  for (const verify of verifiers) {
    try {
      const direct = await verify(payload);
      if (resultIsValid(direct)) return true;
    } catch {
      // Try alternate call signatures.
    }

    try {
      const alternate = await verify(args.request, {
        paymentHeader: args.paymentHeader,
        amountUsd: args.amountUsd
      });
      if (resultIsValid(alternate)) return true;
    } catch {
      // ignore and continue
    }

    try {
      const minimal = await verify(args.paymentHeader);
      if (resultIsValid(minimal)) return true;
    } catch {
      // ignore and continue
    }
  }

  return false;
}

export function lucidRuntimeHeaders(): Record<string, string> {
  return {
    "x-lucid-http-loaded": Object.keys(lucidHttp).length > 0 ? "true" : "false",
    "x-lucid-payments-loaded": Object.keys(lucidPayments).length > 0 ? "true" : "false"
  };
}