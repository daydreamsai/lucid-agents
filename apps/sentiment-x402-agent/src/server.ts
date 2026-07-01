import { analyzeSentiment } from "./sentiment";
import { config } from "./config";
import { enforceX402 } from "./x402";
import { lucidRuntimeHeaders } from "./lucid";

interface SentimentRequestBody {
  text?: unknown;
}

function buildHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type, x402-payment, x-payment, payment, authorization",
    ...lucidRuntimeHeaders()
  });

  if (extra) {
    const extras = new Headers(extra);
    for (const [key, value] of extras.entries()) {
      headers.set(key, value);
    }
  }

  return headers;
}

function json(status: number, payload: unknown, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: buildHeaders(extraHeaders)
  });
}

async function handleSentiment(request: Request): Promise<Response> {
  const payment = await enforceX402(request);
  if (!payment.ok) {
    return payment.response;
  }

  let body: SentimentRequestBody;
  try {
    body = (await request.json()) as SentimentRequestBody;
  } catch {
    return json(400, { error: "invalid_json", message: "Request body must be valid JSON." });
  }

  if (typeof body.text !== "string") {
    return json(400, { error: "invalid_input", message: "Body must include string field: text" });
  }

  const text = body.text.trim();
  if (text.length === 0) {
    return json(400, { error: "invalid_input", message: "text must not be empty" });
  }

  if (text.length > 15000) {
    return json(413, { error: "text_too_large", message: "text exceeds max length of 15000 chars" });
  }

  try {
    const analysis = await analyzeSentiment(text);
    return json(200, analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    return json(500, { error: "sentiment_error", message });
  }
}

async function fetchHandler(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildHeaders() });
  }

  if (request.method === "GET" && pathname === "/health") {
    return json(200, {
      status: "ok",
      service: "sentiment-x402-agent",
      priceUsd: config.priceUsd
    });
  }

  if (request.method === "POST" && pathname === "/sentiment") {
    return handleSentiment(request);
  }

  return json(404, { error: "not_found", message: "Route not found" });
}

export interface RunningServer {
  readonly port: number;
  stop: () => void;
}

export function startServer(port: number): RunningServer {
  const server = Bun.serve({
    port,
    fetch: fetchHandler
  });

  return {
    port: server.port,
    stop: () => server.stop(true)
  };
}