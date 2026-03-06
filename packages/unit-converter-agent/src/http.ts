import * as LucidHttp from "@lucid-agents/http";

export type RequestHandler = (request: Request) => Response | Promise<Response>;

export interface StartedServer {
  stop?: () => void;
  port?: number;
}

function tryStartViaLucidHttp(port: number, handler: RequestHandler): StartedServer | null {
  const api = LucidHttp as unknown as Record<string, unknown>;

  const candidates: Array<[name: string, call: (fn: (...args: unknown[]) => unknown) => unknown]> = [
    ["serve", (fn) => fn({ port, fetch: handler })],
    ["startServer", (fn) => fn({ port, fetch: handler })],
    ["createServer", (fn) => fn({ port, fetch: handler })],
    ["createHttpServer", (fn) => fn({ port, fetch: handler })]
  ];

  for (const [name, call] of candidates) {
    const maybeFn = api[name];
    if (typeof maybeFn !== "function") {
      continue;
    }

    try {
      const result = call(maybeFn as (...args: unknown[]) => unknown);
      if (result) {
        return result as StartedServer;
      }
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

export function startHttpServer(port: number, handler: RequestHandler): StartedServer {
  const lucidServer = tryStartViaLucidHttp(port, handler);
  if (lucidServer) {
    return lucidServer;
  }

  return Bun.serve({
    port,
    fetch: handler
  });
}