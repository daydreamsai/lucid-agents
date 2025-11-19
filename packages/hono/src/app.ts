import { Hono } from 'hono';
import type {
  AgentMeta,
  EntrypointDef,
  CreateAgentAppReturn,
} from '@lucid-agents/types/core';
import { withPayments } from './paywall';
import {
  createAgentHttpRuntime,
  type CreateAgentHttpOptions,
  type AgentHttpRuntime,
} from '@lucid-agents/core';

export type CreateAgentAppOptions = CreateAgentHttpOptions & {
  /**
   * Hook called before mounting agent routes.
   * Use this to register custom middleware that should run before agent handlers.
   */
  beforeMount?: (app: Hono) => void;
  /**
   * Hook called after mounting all agent routes.
   * Use this to register additional custom routes or error handlers.
   */
  afterMount?: (app: Hono) => void;
};

export function createAgentApp(
  meta: AgentMeta,
  opts?: CreateAgentAppOptions
): CreateAgentAppReturn<
  Hono,
  AgentHttpRuntime,
  ReturnType<typeof createAgentHttpRuntime>['agent'],
  ReturnType<typeof createAgentHttpRuntime>['config']
> {
  const runtime = createAgentHttpRuntime(meta, opts);
  const app = new Hono();

  // Allow custom middleware before agent routes
  opts?.beforeMount?.(app);

  const registerEntrypointRoutes = (entrypoint: EntrypointDef) => {
    const invokePath = `/entrypoints/${entrypoint.key}/invoke` as const;
    const streamPath = `/entrypoints/${entrypoint.key}/stream` as const;

    withPayments({
      app,
      path: invokePath,
      entrypoint,
      kind: 'invoke',
      payments: runtime.payments?.config,
    });

    app.post(invokePath, c =>
      runtime.handlers.invoke(c.req.raw, { key: entrypoint.key })
    );

    // Always register stream route for API consistency, even if entrypoint.stream is undefined.
    // The runtime handler will return 400 "stream_not_supported" if streaming isn't configured.
    // This ensures clients get a proper error (400) rather than "route not found" (404).
    // Benefits: AI agents can optimistically try streaming without querying the manifest first,
    // then fall back to invoke on 400. This reduces round-trips and simplifies client logic.
    withPayments({
      app,
      path: streamPath,
      entrypoint,
      kind: 'stream',
      payments: runtime.payments?.config,
    });

    app.post(streamPath, c =>
      runtime.handlers.stream(c.req.raw, { key: entrypoint.key })
    );
  };

  // Core routes
  app.get('/health', c => runtime.handlers.health(c.req.raw));
  app.get('/entrypoints', c => runtime.handlers.entrypoints(c.req.raw));
  app.get('/.well-known/agent.json', c => runtime.handlers.manifest(c.req.raw));
  app.get('/.well-known/agent-card.json', c =>
    runtime.handlers.manifest(c.req.raw)
  );

  app.get('/favicon.svg', c => runtime.handlers.favicon(c.req.raw));

  if (runtime.handlers.landing && opts?.landingPage !== false) {
    app.get('/', c => runtime.handlers.landing!(c.req.raw));
  } else {
    app.get('/', c => c.text('Landing disabled', 404));
  }

  const addEntrypoint = (def: EntrypointDef) => {
    runtime.entrypoints.add(def);
    const entrypoint = runtime
      .entrypoints.snapshot()
      .find((item: EntrypointDef) => item.key === def.key);
    if (!entrypoint) {
      throw new Error(`Failed to register entrypoint "${def.key}"`);
    }
    registerEntrypointRoutes(entrypoint);
  };

  for (const entrypoint of runtime.entrypoints.snapshot()) {
    registerEntrypointRoutes(entrypoint);
  }

  // Allow custom routes and handlers after agent routes
  opts?.afterMount?.(app);

  const result: CreateAgentAppReturn<
    Hono,
    AgentHttpRuntime,
    ReturnType<typeof createAgentHttpRuntime>['agent'],
    ReturnType<typeof createAgentHttpRuntime>['config']
  > = {
    app,
    runtime,
    agent: runtime.agent,
    addEntrypoint,
    config: runtime.config,
  };
  return result;
}
