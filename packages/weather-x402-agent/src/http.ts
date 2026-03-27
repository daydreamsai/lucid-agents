import * as LucidHttp from "@lucid-agents/http";

export type FetchHandler = (request: Request) => Response | Promise<Response>;

export function serveHttp(fetch: FetchHandler, port: number): unknown {
  const http = LucidHttp as Record<string, unknown>;

  if (typeof http.serve === "function") {
    return (http.serve as (args: { port: number; fetch: FetchHandler }) => unknown)({
      port,
      fetch,
    });
  }

  if (typeof http.createServer === "function") {
    const server = (http.createServer as (args: { port: number; fetch: FetchHandler }) => unknown)({
      port,
      fetch,
    });

    const maybeServer = server as { listen?: (listenPort?: number) => void };
    if (typeof maybeServer.listen === "function") {
      maybeServer.listen(port);
    }

    return server;
  }

  return Bun.serve({ port, fetch });
}