import { Hono } from 'hono';

import type {
  CreateAgentAppReturn,
  AgentRuntime,
} from '@lucid-agents/types/core';
import type { AgentHttpRuntime } from '@lucid-agents/types/http';

export type CreateAgentAppOptions = {
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

/** Bind a completed HTTP runtime's canonical route plan to a Hono app. */
export async function createAgentApp<
  TCapabilities extends { http: AgentHttpRuntime },
>(
  runtime: AgentRuntime<TCapabilities>,
  opts?: CreateAgentAppOptions
): Promise<
  CreateAgentAppReturn<Hono, AgentRuntime<TCapabilities>, AgentRuntime['agent']>
> {
  if (!runtime.http) {
    throw new Error(
      'HTTP extension is required. Use app.use(http()) when building the runtime.'
    );
  }
  const app = new Hono();

  // Allow custom middleware before agent routes
  opts?.beforeMount?.(app);

  for (const route of runtime.http.routes) {
    app.on(route.method, route.path, c => {
      const availableParams = c.req.param() as Record<string, string>;
      const params = Object.fromEntries(
        route.params.map(name => [name, availableParams[name] ?? ''])
      );
      return route.handle(c.req.raw, params);
    });
  }

  const addEntrypoint: CreateAgentAppReturn<
    Hono,
    AgentRuntime<TCapabilities>,
    AgentRuntime['agent']
  >['addEntrypoint'] = def => {
    runtime.entrypoints.add(def);
  };

  // Allow custom routes and handlers after agent routes
  opts?.afterMount?.(app);

  const result: CreateAgentAppReturn<
    Hono,
    AgentRuntime<TCapabilities>,
    AgentRuntime['agent']
  > = {
    app,
    runtime,
    agent: runtime.agent,
    addEntrypoint,
  };
  return result;
}
