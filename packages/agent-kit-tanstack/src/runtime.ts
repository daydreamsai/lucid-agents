import {
  createAgentHttpRuntime,
  type AgentHttpRuntime,
  type AgentMeta,
  type CreateAgentHttpOptions,
} from "@lucid-agents/agent-kit";

export type TanStackRequestHandler = (ctx: { request: Request }) => Promise<Response>;

export type TanStackRouteHandler<P extends Record<string, string>> = (ctx: {
  request: Request;
  params: P;
}) => Promise<Response>;

export type TanStackHandlers = {
  health: TanStackRequestHandler;
  entrypoints: TanStackRequestHandler;
  manifest: TanStackRequestHandler;
  favicon: TanStackRequestHandler;
  landing?: TanStackRequestHandler;
  invoke: TanStackRouteHandler<{ key: string }>;
  stream: TanStackRouteHandler<{ key: string }>;
};

export type TanStackRuntime = {
  runtime: AgentHttpRuntime;
  handlers: TanStackHandlers;
};

function adaptRequestHandler(
  handler: (req: Request) => Promise<Response>
): TanStackRequestHandler {
  return async ({ request }) => handler(request);
}

function adaptRouteHandler<P extends Record<string, string>>(
  handler: (req: Request, params: P) => Promise<Response>
): TanStackRouteHandler<P> {
  return async ({ request, params }) => handler(request, params);
}

export function createTanStackHandlers(
  runtime: AgentHttpRuntime
): TanStackHandlers {
  const { handlers } = runtime;
  return {
    health: adaptRequestHandler(handlers.health),
    entrypoints: adaptRequestHandler(handlers.entrypoints),
    manifest: adaptRequestHandler(handlers.manifest),
    favicon: adaptRequestHandler(handlers.favicon),
    landing: handlers.landing
      ? adaptRequestHandler(handlers.landing)
      : undefined,
    invoke: adaptRouteHandler(handlers.invoke),
    stream: adaptRouteHandler(handlers.stream),
  };
}

export function createTanStackRuntime(
  meta: AgentMeta,
  opts: CreateAgentHttpOptions = {}
): TanStackRuntime {
  const runtime = createAgentHttpRuntime(meta, opts);
  return {
    runtime,
    handlers: createTanStackHandlers(runtime),
  };
}
