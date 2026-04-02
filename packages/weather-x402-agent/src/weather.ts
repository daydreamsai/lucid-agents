import type { WeatherResponse } from "./types";

interface WttrCondition {
  temp_C?: string;
  humidity?: string;
  weatherDesc?: Array<{ value?: string }>;
}

interface WttrResponse {
  current_condition?: WttrCondition[];
}

function cleanCity(city: string): string {
  const normalized = city.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new Error("City is required");
  }
  if (normalized.length > 100) {
    throw new Error("City is too long");
  }
  return normalized;
}

export async function lookupWeather(cityInput: string): Promise<WeatherResponse> {
  const city = cleanCity(cityInput);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const endpoint = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "user-agent": "lucid-weather-x402-agent/1.0",
        "accept": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Weather upstream returned ${response.status}`);
    }

    const data = (await response.json()) as WttrResponse;
    const current = data.current_condition?.[0];

    const temp = Number(current?.temp_C);
    const humidity = Number(current?.humidity);
    const condition = current?.weatherDesc?.[0]?.value?.trim() || "Unknown";

    if (!Number.isFinite(temp) || !Number.isFinite(humidity)) {
      throw new Error("Invalid weather payload");
    }

    return {
      city,
      temp_c: temp,
      condition,
      humidity,
    };
  } finally {
    clearTimeout(timeout);
  }
}