import { Hono } from "hono";
import type { AgentMeta, EntrypointDef } from "@lucid-agents/agent-kit";
import { withPayments } from "./paywall";
import {
  createAgentHttpRuntime,
  type CreateAgentHttpOptions,
} from "@lucid-agents/agent-kit";

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
) {
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
      kind: "invoke",
      payments: runtime.payments,
    });

    app.post(invokePath, (c) =>
      runtime.handlers.invoke(c.req.raw, { key: entrypoint.key })
    );

    if (entrypoint.stream) {
      withPayments({
        app,
        path: streamPath,
        entrypoint,
        kind: "stream",
        payments: runtime.payments,
      });

      app.post(streamPath, (c) =>
        runtime.handlers.stream(c.req.raw, { key: entrypoint.key })
      );
    }
  };

  // Core routes
  app.get("/health", (c) => runtime.handlers.health(c.req.raw));
  app.get("/entrypoints", (c) =>
    runtime.handlers.entrypoints(c.req.raw)
  );
  app.get("/.well-known/agent.json", (c) =>
    runtime.handlers.manifest(c.req.raw)
  );
  app.get("/.well-known/agent-card.json", (c) =>
    runtime.handlers.manifest(c.req.raw)
  );

  app.get("/favicon.svg", (c) => runtime.handlers.favicon(c.req.raw));

  if (runtime.handlers.landing && opts?.landingPage !== false) {
    app.get("/", (c) => runtime.handlers.landing!(c.req.raw));
  } else {
    app.get("/", (c) => c.text("Landing disabled", 404));
  }

  const addEntrypoint = (def: EntrypointDef) => {
    runtime.addEntrypoint(def);
    const entrypoint = runtime
      .snapshotEntrypoints()
      .find((item) => item.key === def.key);
    if (!entrypoint) {
      throw new Error(`Failed to register entrypoint "${def.key}"`);
    }
    registerEntrypointRoutes(entrypoint);
  };

  for (const entrypoint of runtime.snapshotEntrypoints()) {
    registerEntrypointRoutes(entrypoint);
  }

  // Allow custom routes and handlers after agent routes
  opts?.afterMount?.(app);

  return {
    app,
    agent: runtime.agent,
    addEntrypoint,
    config: runtime.config,
    get payments() {
      return runtime.payments;
    },
  };
}
