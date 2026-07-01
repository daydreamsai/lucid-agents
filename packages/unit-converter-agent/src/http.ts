import * as LucidHttp from "@lucid-agents/http";

export type FetchHandler = (request: Request) => Response | Promise<Response>;

export function startHttpServer(fetchHandler: FetchHandler, port: number): unknown {
  const sdk = LucidHttp as Record<string, unknown>;

  const serve = sdk["serve"];
  if (typeof serve === "function") {
    try {
      return (serve as (...args: unknown[]) => unknown)({ port, fetch: fetchHandler });
    } catch {
      // fall through
    }
    try {
      return (serve as (...args: unknown[]) => unknown)(fetchHandler, { port });
    } catch {
      // fall through
    }
  }

  const createServer = sdk["createServer"];
  if (typeof createServer === "function") {
    try {
      return (createServer as (...args: unknown[]) => unknown)({ port, fetch: fetchHandler });
    } catch {
      // fall through
    }
    try {
      return (createServer as (...args: unknown[]) => unknown)(fetchHandler, { port });
    } catch {
      // fall through
    }
  }

  const startServer = sdk["startServer"];
  if (typeof startServer === "function") {
    try {
      return (startServer as (...args: unknown[]) => unknown)({ port, fetch: fetchHandler });
    } catch {
      // fall through
    }
  }

  return Bun.serve({
    port,
    fetch: fetchHandler
  });
}