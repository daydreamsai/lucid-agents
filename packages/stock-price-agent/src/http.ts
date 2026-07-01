import * as LucidHttp from "@lucid-agents/http";

function normalizeHeaders(input?: HeadersInit): Headers {
  const headers = new Headers(input);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return headers;
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const lucid = LucidHttp as Record<string, unknown>;
  const fnNames = ["json", "createJsonResponse", "toJsonResponse"];

  for (const fnName of fnNames) {
    const maybeFn = lucid[fnName];
    if (typeof maybeFn === "function") {
      try {
        const maybeResponse = (maybeFn as (payload: unknown, responseInit?: ResponseInit) => unknown)(body, init);
        if (maybeResponse instanceof Response) {
          return maybeResponse;
        }
      } catch {
        // fall through to default response
      }
    }
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers: normalizeHeaders(init.headers)
  });
}

export function methodNotAllowed(allowedMethods: string[]): Response {
  return json(
    { error: "Method Not Allowed" },
    { status: 405, headers: { allow: allowedMethods.join(", ") } }
  );
}