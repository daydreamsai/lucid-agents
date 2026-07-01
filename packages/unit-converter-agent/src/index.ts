import { ConversionError, convertUnits } from "./converter";
import { startHttpServer } from "./http";
import { isPaidRequest, loadX402Config, paymentRequiredResponse } from "./payment";

const paymentConfig = loadX402Config();
const port = Number(Bun.env.PORT ?? "3000");

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const merged = new Headers(headers);
  if (!merged.has("content-type")) {
    merged.set("content-type", "application/json; charset=utf-8");
  }
  if (!merged.has("cache-control")) {
    merged.set("cache-control", "no-store");
  }

  return new Response(JSON.stringify(data), { status, headers: merged });
}

export async function app(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
  }

  if (url.pathname === "/health") {
    return json({ ok: true, service: "unit-converter-agent" });
  }

  if (url.pathname !== "/convert") {
    return json({ error: "Not Found" }, 404);
  }

  const paid = await isPaidRequest(request, paymentConfig);
  if (!paid) {
    return paymentRequiredResponse(paymentConfig, request.url);
  }

  const valueRaw = url.searchParams.get("value");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (valueRaw === null || !from || !to) {
    return json(
      {
        error: "Missing required query params. Expected: value, from, to",
        example: "/convert?value=100&from=km&to=miles"
      },
      400
    );
  }

  const value = Number(valueRaw);

  try {
    const conversion = convertUnits(value, from, to);
    return json(conversion, 200);
  } catch (error) {
    if (error instanceof ConversionError) {
      return json({ error: error.message }, 400);
    }

    console.error("[unit-converter-agent] unexpected error", error);
    return json({ error: "Internal Server Error" }, 500);
  }
}

export const server = import.meta.main ? startHttpServer(port, app) : null;

if (import.meta.main) {
  console.log(`[unit-converter-agent] listening on port ${port}`);
}