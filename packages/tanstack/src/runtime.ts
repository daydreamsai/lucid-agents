import { AgentBuilder } from '@lucid-agents/core';
import type { AgentRuntime } from '@lucid-agents/types/core';

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

export type TanStackRuntime = {
  runtime: AgentRuntime;
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
  runtime: AgentRuntime
): TanStackHandlers {
  if (!runtime.handlers) {
    throw new Error(
      'HTTP extension is required. Use app.use(http()) when building the runtime.'
    );
  }

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
    tasks: adaptRequestHandler(handlers.tasks),
    getTask: adaptRouteHandler(handlers.getTask),
    listTasks: adaptRequestHandler(handlers.listTasks),
    cancelTask: adaptRouteHandler(handlers.cancelTask),
    subscribeTask: adaptRouteHandler(handlers.subscribeTask),
  };
}

export async function createTanStackRuntime(
  agent: AgentBuilder
): Promise<TanStackRuntime> {
  // Build the agent runtime
  const runtime: AgentRuntime = await agent.build();

  return {
    runtime,
    handlers: createTanStackHandlers(runtime),
  };
}
