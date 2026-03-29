import * as LucidHttp from "@lucid-agents/http";

export type FetchHandler = (request: Request) => Promise<Response> | Response;

export interface StartedServer {
  runtime: string;
  stop: () => void;
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders
  });
}

export function startServer(port: number, handler: FetchHandler): StartedServer {
  const loadedLucidHttpExports = Object.keys(LucidHttp as Record<string, unknown>).length;

  const server = Bun.serve({
    port,
    fetch: handler
  });

  return {
    runtime: `bun (with @lucid-agents/http loaded: ${loadedLucidHttpExports} exports)`,
    stop: () => {
      try {
        server.stop(true);
      } catch {
        // no-op
      }
    }
  };
}