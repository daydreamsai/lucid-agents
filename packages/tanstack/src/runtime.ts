import type { AgentRuntime } from '@lucid-agents/types/core';
import type {
  AgentHttpRoute,
  AgentHttpRuntime,
} from '@lucid-agents/types/http';

export type TanStackRequestHandler = (ctx: {
  request: Request;
}) => Promise<Response>;

export type TanStackRouteHandler<P extends Record<string, string>> = (ctx: {
  request: Request;
  params: P;
}) => Promise<Response>;

export type TanStackHandlers = {
  health: TanStackRequestHandler;
  entrypoints: TanStackRequestHandler;
  manifest: TanStackRequestHandler;
  oasf: TanStackRequestHandler;
  favicon: TanStackRequestHandler;
  landing?: TanStackRequestHandler;
  invoke: TanStackRouteHandler<{ key: string }>;
  stream: TanStackRouteHandler<{ key: string }>;
  tasks: TanStackRequestHandler;
  getTask: TanStackRouteHandler<{ taskId: string }>;
  listTasks: TanStackRequestHandler;
  cancelTask: TanStackRouteHandler<{ taskId: string }>;
  subscribeTask: TanStackRouteHandler<{ taskId: string }>;
};

export type TanStackRuntime<
  TRuntime extends HttpAgentRuntime = HttpAgentRuntime,
> = {
  runtime: TRuntime;
  handlers: TanStackHandlers;
  routes: readonly AgentHttpRoute[];
};

type HttpAgentRuntime = AgentRuntime<{ http: AgentHttpRuntime }>;

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

/** Adapt a completed Fetch-native HTTP runtime to TanStack route handlers. */
export function createTanStackHandlers<TRuntime extends HttpAgentRuntime>(
  runtime: TRuntime
): TanStackHandlers {
  if (!runtime.http) {
    throw new Error(
      'HTTP extension is required. Use app.use(http()) when building the runtime.'
    );
  }

  const { handlers } = runtime.http;
  return {
    health: adaptRequestHandler(handlers.health),
    entrypoints: adaptRequestHandler(handlers.entrypoints),
    manifest: adaptRequestHandler(handlers.manifest),
    oasf: handlers.oasf
      ? adaptRequestHandler(handlers.oasf)
      : async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'not_found',
                message: 'OASF record is not enabled',
              },
            }),
            {
              status: 404,
              headers: { 'content-type': 'application/json' },
            }
          ),
    favicon: adaptRequestHandler(handlers.favicon),
    landing: handlers.landing
      ? adaptRequestHandler(handlers.landing)
      : undefined,
    invoke: adaptRouteHandler(handlers.invoke),
    stream: adaptRouteHandler(handlers.stream),
    tasks: adaptRequestHandler(handlers.tasks),
    getTask: adaptRouteHandler(handlers.getTask),
    listTasks: adaptRequestHandler(handlers.listTasks),
    cancelTask: adaptRouteHandler(handlers.cancelTask),
    subscribeTask: adaptRouteHandler(handlers.subscribeTask),
  };
}

/**
 * Expose TanStack handlers and the canonical route plan for a completed agent
 * runtime. This function does not create a second registry or paywall.
 */
export async function createTanStackRuntime<TRuntime extends HttpAgentRuntime>(
  runtime: TRuntime
): Promise<TanStackRuntime<TRuntime>> {
  return {
    runtime,
    handlers: createTanStackHandlers(runtime),
    routes: runtime.http.routes,
  };
}
