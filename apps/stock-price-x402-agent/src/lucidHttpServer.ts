import * as LucidHttp from "@lucid-agents/http";

export type FetchHandler = (request: Request) => Response | Promise<Response>;

export interface StartHttpServerOptions {
  port: number;
  handler: FetchHandler;
}

export interface StartedHttpServer {
  runtime: "lucid-http" | "bun";
  port: number;
  stop: () => Promise<void>;
}

type UnknownFn = (...args: unknown[]) => unknown;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function collectStarters(): UnknownFn[] {
  const starters: UnknownFn[] = [];
  const names = ["serve", "startServer", "createServer", "createHttpServer"] as const;

  const moduleRecord = asRecord(LucidHttp);
  const defaultRecord = moduleRecord ? asRecord(moduleRecord.default) : null;

  for (const source of [moduleRecord, defaultRecord]) {
    if (!source) continue;
    for (const name of names) {
      const maybeFn = source[name];
      if (typeof maybeFn === "function") {
        starters.push(maybeFn as UnknownFn);
      }
    }
  }

  return starters;
}

async function invokeStarter(starter: UnknownFn, port: number, handler: FetchHandler): Promise<unknown> {
  const attempts: unknown[][] = [
    [{ port, fetch: handler }],
    [{ port, handler }],
    [handler, { port }],
    [port, handler]
  ];

  let lastError: unknown = null;

  for (const args of attempts) {
    try {
      const result = starter(...args);
      if (result instanceof Promise) {
        return await result;
      }
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to start server with provided starter.");
}

function createStopper(serverHandle: unknown): () => Promise<void> {
  if (typeof serverHandle === "function") {
    return async () => {
      await Promise.resolve((serverHandle as () => unknown)());
    };
  }

  if (typeof serverHandle === "object" && serverHandle !== null) {
    const record = serverHandle as Record<string, unknown>;
    const stopFn = record.stop;
    const closeFn = record.close;
    const shutdownFn = record.shutdown;

    if (typeof stopFn === "function") {
      return async () => {
        await Promise.resolve((stopFn as (...args: unknown[]) => unknown).call(serverHandle));
      };
    }

    if (typeof closeFn === "function") {
      return async () => {
        await Promise.resolve((closeFn as (...args: unknown[]) => unknown).call(serverHandle));
      };
    }

    if (typeof shutdownFn === "function") {
      return async () => {
        await Promise.resolve((shutdownFn as (...args: unknown[]) => unknown).call(serverHandle));
      };
    }
  }

  return async () => {};
}

export async function startHttpServer(options: StartHttpServerOptions): Promise<StartedHttpServer> {
  const starters = collectStarters();

  for (const starter of starters) {
    try {
      const handle = await invokeStarter(starter, options.port, options.handler);
      return {
        runtime: "lucid-http",
        port: options.port,
        stop: createStopper(handle)
      };
    } catch {
      // Try next starter.
    }
  }

  const bunServer = Bun.serve({
    port: options.port,
    fetch: options.handler
  });

  return {
    runtime: "bun",
    port: bunServer.port,
    stop: async () => {
      bunServer.stop(true);
    }
  };
}