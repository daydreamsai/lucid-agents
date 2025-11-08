import { createAgentHttpRuntime } from '@lucid-agents/agent-kit';

// src/runtime.ts
function adaptRequestHandler(handler) {
  return async ({ request }) => handler(request);
}
function adaptRouteHandler(handler) {
  return async ({ request, params }) => handler(request, params);
}
function createTanStackHandlers(runtime) {
  const { handlers } = runtime;
  return {
    health: adaptRequestHandler(handlers.health),
    entrypoints: adaptRequestHandler(handlers.entrypoints),
    manifest: adaptRequestHandler(handlers.manifest),
    favicon: adaptRequestHandler(handlers.favicon),
    landing: handlers.landing ? adaptRequestHandler(handlers.landing) : void 0,
    invoke: adaptRouteHandler(handlers.invoke),
    stream: adaptRouteHandler(handlers.stream)
  };
}
function createTanStackRuntime(meta, opts = {}) {
  const runtime = createAgentHttpRuntime(meta, opts);
  return {
    runtime,
    handlers: createTanStackHandlers(runtime)
  };
}

export { createTanStackHandlers, createTanStackRuntime };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map