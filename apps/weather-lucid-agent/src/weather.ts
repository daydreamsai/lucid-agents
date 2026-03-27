export interface WeatherResult {
  city: string;
  temp_c: number;
  condition: string;
  humidity: number;
}

interface WttrCondition {
  temp_C?: string;
  humidity?: string;
  weatherDesc?: Array<{ value?: string }>;
}

interface WttrNearestArea {
  areaName?: Array<{ value?: string }>;
}

interface WttrResponse {
  current_condition?: WttrCondition[];
  nearest_area?: WttrNearestArea[];
}

function safeNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchWeather(city: string, timeoutMs: number): Promise<WeatherResult> {
  const normalizedCity = city.trim();
  if (normalizedCity.length === 0) {
    throw new Error("City is required.");
  }

  const weatherUrl = `https://wttr.in/${encodeURIComponent(normalizedCity)}?format=j1`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(weatherUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "lucid-weather-agent/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Weather upstream request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as WttrResponse;
    const condition = payload.current_condition?.[0];
    if (!condition) {
      throw new Error(`No weather data found for "${normalizedCity}".`);
    }

    const temp = safeNumber(condition.temp_C);
    const humidity = safeNumber(condition.humidity);
    const weatherLabel = condition.weatherDesc?.[0]?.value?.trim() ?? "Unknown";

    if (temp === null || humidity === null) {
      throw new Error(`Incomplete weather payload for "${normalizedCity}".`);
    }

    const resolvedCity =
      payload.nearest_area?.[0]?.areaName?.[0]?.value?.trim() || normalizedCity;

    return {
      city: resolvedCity,
      temp_c: Number(temp.toFixed(1)),
      condition: weatherLabel,
      humidity: Math.round(humidity)
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Weather upstream timed out.");
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Unknown weather upstream error.");
  } finally {
    clearTimeout(timeout);
  }
}