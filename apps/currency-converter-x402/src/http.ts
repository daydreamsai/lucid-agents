import * as lucidHttp from "@lucid-agents/http";

type JsonFactory = (body: unknown, init?: ResponseInit) => Response;

function asExportsMap(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function resolveJsonFactory(): JsonFactory | null {
  const exportsMap = asExportsMap(lucidHttp);

  const candidateA = exportsMap.json;
  if (typeof candidateA === "function") {
    return candidateA as JsonFactory;
  }

  const candidateB = exportsMap.createJsonResponse;
  if (typeof candidateB === "function") {
    return candidateB as JsonFactory;
  }

  return null;
}

const jsonFactory = resolveJsonFactory();

export const lucidHttpRuntimeInfo = {
  exportCount: Object.keys(asExportsMap(lucidHttp)).length
};

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  if (jsonFactory) {
    return jsonFactory(body, init);
  }

  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}