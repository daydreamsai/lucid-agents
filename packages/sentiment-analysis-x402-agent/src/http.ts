import * as LucidHttp from "@lucid-agents/http";

export interface StartedServer {
  flavor: string;
  stop?: () => void | Promise<void>;
}

type Handler = (request: Request) => Promise<Response> | Response;

export async function startHttpServer(port: number, handler: Handler): Promise<StartedServer> {
  const lucid = LucidHttp as Record<string, unknown>;

  const maybeServe = lucid.serve;
  if (typeof maybeServe === "function") {
    try {
      const server = await (maybeServe as (config: { port: number; fetch: Handler }) => Promise<unknown> | unknown)({
        port,
        fetch: handler
      });

      const stop =
        server && typeof server === "object" && "stop" in server && typeof (server as { stop?: unknown }).stop === "function"
          ? () => (server as { stop: () => void | Promise<void> }).stop()
          : undefined;

      return { flavor: "@lucid-agents/http#serve", stop };
    } catch {
      // fall through
    }
  }

  const maybeCreateServer = lucid.createServer;
  if (typeof maybeCreateServer === "function") {
    try {
      const server = (maybeCreateServer as (config: { fetch: Handler }) => unknown)({ fetch: handler });

      if (server && typeof server === "object") {
        const srv = server as {
          listen?: (config: { port: number }) => Promise<void> | void;
          start?: (port: number) => Promise<void> | void;
          stop?: () => Promise<void> | void;
        };

        if (typeof srv.listen === "function") {
          await srv.listen({ port });
          return { flavor: "@lucid-agents/http#createServer.listen", stop: srv.stop };
        }

        if (typeof srv.start === "function") {
          await srv.start(port);
          return { flavor: "@lucid-agents/http#createServer.start", stop: srv.stop };
        }
      }
    } catch {
      // fall through
    }
  }

  const bunServer = Bun.serve({
    port,
    fetch: handler
  });

  return {
    flavor: "bun.serve (fallback; @lucid-agents/http imported)",
    stop: () => bunServer.stop(true)
  };
}