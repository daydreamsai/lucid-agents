import { AgentMeta, CreateAgentHttpOptions, AgentHttpRuntime } from '@lucid-agents/agent-kit';

type TanStackRequestHandler = (ctx: {
    request: Request;
}) => Promise<Response>;
type TanStackRouteHandler<P extends Record<string, string>> = (ctx: {
    request: Request;
    params: P;
}) => Promise<Response>;
type TanStackHandlers = {
    health: TanStackRequestHandler;
    entrypoints: TanStackRequestHandler;
    manifest: TanStackRequestHandler;
    favicon: TanStackRequestHandler;
    landing?: TanStackRequestHandler;
    invoke: TanStackRouteHandler<{
        key: string;
    }>;
    stream: TanStackRouteHandler<{
        key: string;
    }>;
};
type TanStackRuntime = {
    runtime: AgentHttpRuntime;
    handlers: TanStackHandlers;
};
declare function createTanStackHandlers(runtime: AgentHttpRuntime): TanStackHandlers;
declare function createTanStackRuntime(meta: AgentMeta, opts?: CreateAgentHttpOptions): TanStackRuntime;

export { type TanStackHandlers, type TanStackRequestHandler, type TanStackRouteHandler, type TanStackRuntime, createTanStackHandlers, createTanStackRuntime };
