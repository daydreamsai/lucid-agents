export function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has("content-type")) {
    finalHeaders.set("content-type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: finalHeaders,
  });
}