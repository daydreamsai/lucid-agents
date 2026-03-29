import * as LucidHttp from "@lucid-agents/http";

export function json(payload: unknown, init?: ResponseInit): Response {
  const lucidHttp = LucidHttp as Record<string, unknown>;
  const maybeJson = lucidHttp["json"];

  if (typeof maybeJson === "function") {
    try {
      const response = (maybeJson as (body: unknown, init?: ResponseInit) => unknown)(payload, init);
      if (response instanceof Response) {
        return response;
      }
    } catch {
      // fall through to built-in response
    }
  }

  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}