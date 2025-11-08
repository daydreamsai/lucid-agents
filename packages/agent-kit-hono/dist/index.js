import { Hono } from 'hono';
import { paymentMiddleware } from 'x402-hono';
import { resolveEntrypointPrice, createAgentHttpRuntime } from '@lucid-agents/agent-kit';
import { z } from 'zod';

// src/app.ts
function toJsonSchemaOrUndefined(s) {
  if (!s) return void 0;
  try {
    return z.toJSONSchema(s);
  } catch {
    return void 0;
  }
}

// src/paywall.ts
function withPayments({
  app,
  path,
  entrypoint,
  kind,
  payments,
  facilitator,
  middlewareFactory = paymentMiddleware
}) {
  if (!payments) return false;
  const network = entrypoint.network ?? payments.network;
  if (!network) return false;
  const price = resolveEntrypointPrice(entrypoint, payments, kind);
  if (!price) return false;
  if (!payments.payTo) return false;
  const requestSchema = toJsonSchemaOrUndefined(entrypoint.input);
  const responseSchema = toJsonSchemaOrUndefined(entrypoint.output);
  const description = entrypoint.description ?? `${entrypoint.key}${kind === "stream" ? " (stream)" : ""}`;
  const postMimeType = kind === "stream" ? "text/event-stream" : "application/json";
  const inputSchema = {
    bodyType: "json",
    ...requestSchema ? { bodyFields: { input: requestSchema } } : {}
  };
  const outputSchema = kind === "invoke" && responseSchema ? { output: responseSchema } : void 0;
  const resolvedFacilitator = facilitator ?? { url: payments.facilitatorUrl };
  const postRoute = {
    price,
    network,
    config: {
      description,
      mimeType: postMimeType,
      discoverable: true,
      inputSchema,
      outputSchema
    }
  };
  const getRoute = {
    price,
    network,
    config: {
      description,
      mimeType: "application/json",
      discoverable: true,
      inputSchema,
      outputSchema
    }
  };
  app.use(
    path,
    middlewareFactory(
      payments.payTo,
      {
        [`POST ${path}`]: postRoute,
        [`GET ${path}`]: getRoute
      },
      resolvedFacilitator
    )
  );
  return true;
}
function createAgentApp(meta, opts) {
  const runtime = createAgentHttpRuntime(meta, opts);
  const app = new Hono();
  opts?.beforeMount?.(app);
  const registerEntrypointRoutes = (entrypoint) => {
    const invokePath = `/entrypoints/${entrypoint.key}/invoke`;
    const streamPath = `/entrypoints/${entrypoint.key}/stream`;
    withPayments({
      app,
      path: invokePath,
      entrypoint,
      kind: "invoke",
      payments: runtime.payments
    });
    app.post(
      invokePath,
      (c) => runtime.handlers.invoke(c.req.raw, { key: entrypoint.key })
    );
    if (entrypoint.stream) {
      withPayments({
        app,
        path: streamPath,
        entrypoint,
        kind: "stream",
        payments: runtime.payments
      });
      app.post(
        streamPath,
        (c) => runtime.handlers.stream(c.req.raw, { key: entrypoint.key })
      );
    }
  };
  app.get("/health", (c) => runtime.handlers.health(c.req.raw));
  app.get(
    "/entrypoints",
    (c) => runtime.handlers.entrypoints(c.req.raw)
  );
  app.get(
    "/.well-known/agent.json",
    (c) => runtime.handlers.manifest(c.req.raw)
  );
  app.get(
    "/.well-known/agent-card.json",
    (c) => runtime.handlers.manifest(c.req.raw)
  );
  app.get("/favicon.svg", (c) => runtime.handlers.favicon(c.req.raw));
  if (runtime.handlers.landing && opts?.landingPage !== false) {
    app.get("/", (c) => runtime.handlers.landing(c.req.raw));
  } else {
    app.get("/", (c) => c.text("Landing disabled", 404));
  }
  const addEntrypoint = (def) => {
    runtime.addEntrypoint(def);
    const entrypoint = runtime.snapshotEntrypoints().find((item) => item.key === def.key);
    if (!entrypoint) {
      throw new Error(`Failed to register entrypoint "${def.key}"`);
    }
    registerEntrypointRoutes(entrypoint);
  };
  for (const entrypoint of runtime.snapshotEntrypoints()) {
    registerEntrypointRoutes(entrypoint);
  }
  opts?.afterMount?.(app);
  return {
    app,
    agent: runtime.agent,
    addEntrypoint,
    config: runtime.config,
    get payments() {
      return runtime.payments;
    }
  };
}

export { createAgentApp, toJsonSchemaOrUndefined, withPayments };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map