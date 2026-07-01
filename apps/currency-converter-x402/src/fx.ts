export interface ConvertCurrencyInput {
  apiBaseUrl: string;
  from: string;
  to: string;
  amount: number;
  timeoutMs: number;
}

export interface ConvertCurrencyResult {
  result: number;
  rate: number;
}

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFrankfurterResponse(raw: unknown, target: string, requestedAmount: number): ConvertCurrencyResult {
  if (!isRecord(raw)) {
    throw new Error("Invalid FX API response shape.");
  }

  const rates = raw.rates;
  if (!isRecord(rates)) {
    throw new Error("FX API response missing rates.");
  }

  const rawResult = rates[target];
  if (typeof rawResult !== "number" || !Number.isFinite(rawResult)) {
    throw new Error(`FX API response missing rate for ${target}.`);
  }

  const result = rawResult;
  const rate = result / requestedAmount;

  return { result, rate };
}

export async function convertCurrency(input: ConvertCurrencyInput): Promise<ConvertCurrencyResult> {
  const { apiBaseUrl, from, to, amount, timeoutMs } = input;

  const endpoint = new URL("/latest", apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`);
  endpoint.searchParams.set("from", from);
  endpoint.searchParams.set("to", to);
  endpoint.searchParams.set("amount", String(amount));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`FX provider returned HTTP ${response.status}.`);
    }

    const data = (await response.json()) as FrankfurterResponse;
    return parseFrankfurterResponse(data, to, amount);
  } finally {
    clearTimeout(timeout);
  }
}