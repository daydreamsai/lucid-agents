import express, {
  type Express,
  type NextFunction,
  type Request as ExpressRequest,
  type RequestHandler,
  type Response as ExpressResponse,
} from 'express';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { TLSSocket } from 'node:tls';
import type { AgentHttpRuntime, EntrypointDef } from '@lucid-agents/core';
import type { AgentMeta } from '@lucid-agents/types/core';
import type { CreateAgentAppReturn } from '@lucid-agents/types/core';
import {
  createAgentHttpRuntime,
  type CreateAgentHttpOptions,
} from '@lucid-agents/core';
import { withPayments } from './paywall';

type NodeRequestInit = RequestInit & { duplex?: 'half' };

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);

export type CreateAgentAppOptions = CreateAgentHttpOptions & {
  /**
   * Hook called before mounting agent routes.
   * Register global middleware here (logging, security headers, etc).
   */
  beforeMount?: (app: Express) => void;
  /**
   * Hook called after mounting agent routes.
   * Useful for adding additional routes or error handlers.
   */
  afterMount?: (app: Express) => void;
};

export function createAgentApp(
  meta: AgentMeta,
  opts?: CreateAgentAppOptions
): CreateAgentAppReturn<
  Express,
  AgentHttpRuntime,
  AgentHttpRuntime['agent'],
  AgentHttpRuntime['config']
> {
  const runtime = createAgentHttpRuntime(meta, opts);
  const app = express();

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

    app.post(
      invokePath,
      createRouteHandler(runtime.handlers.invoke, { key: entrypoint.key })
    );

    withPayments({
      app,
      path: streamPath,
      entrypoint,
      kind: 'stream',
      payments: runtime.payments?.config,
    });

    app.post(
      streamPath,
      createRouteHandler(runtime.handlers.stream, { key: entrypoint.key })
    );
  };

  app.get('/health', createRouteHandler(runtime.handlers.health));
  app.get('/entrypoints', createRouteHandler(runtime.handlers.entrypoints));
  app.get(
    '/.well-known/agent.json',
    createRouteHandler(runtime.handlers.manifest)
  );
  app.get(
    '/.well-known/agent-card.json',
    createRouteHandler(runtime.handlers.manifest)
  );
  app.get('/favicon.svg', createRouteHandler(runtime.handlers.favicon));

  if (runtime.handlers.landing && opts?.landingPage !== false) {
    app.get('/', createRouteHandler(runtime.handlers.landing));
  } else {
    app.get('/', (_req, res) => {
      res.status(404).send('Landing disabled');
    });
  }

  const addEntrypoint = (def: EntrypointDef) => {
    runtime.entrypoints.add(def);
    const entrypoint = runtime
      .entrypoints.snapshot()
      .find(item => item.key === def.key);
    if (!entrypoint) {
      throw new Error(`Failed to register entrypoint "${def.key}"`);
    }
    registerEntrypointRoutes(entrypoint);
  };

  for (const entrypoint of runtime.entrypoints.snapshot()) {
    registerEntrypointRoutes(entrypoint);
  }

  opts?.afterMount?.(app);

  return {
    app,
    runtime,
    agent: runtime.agent,
    addEntrypoint,
    config: runtime.config,
  };
}

function createRouteHandler(
  handler: (req: Request) => Promise<Response>
): RequestHandler;
function createRouteHandler<TParams extends Record<string, unknown>>(
  handler: (req: Request, params: TParams) => Promise<Response>,
  params: TParams
): RequestHandler;
function createRouteHandler(
  handler: (
    req: Request,
    params?: Record<string, unknown>
  ) => Promise<Response>,
  params?: Record<string, unknown>
): RequestHandler {
  return async (
    req: ExpressRequest,
    res: ExpressResponse,
    next: NextFunction
  ) => {
    try {
      const request = toWebRequest(req);
      const response = await handler(request, params);
      await sendResponse(res, response);
    } catch (error) {
      next(error);
    }
  };
}

function isEncryptedSocket(
  socket: ExpressRequest['socket']
): socket is TLSSocket {
  return Boolean((socket as TLSSocket).encrypted);
}

function toWebRequest(req: ExpressRequest): Request {
  const protocol =
    req.protocol ?? (isEncryptedSocket(req.socket) ? 'https' : 'http');
  const host = req.get('host') ?? 'localhost';
  const url = new URL(
    req.originalUrl || req.url || '/',
    `${protocol}://${host}`
  );
  const method = (req.method ?? 'GET').toUpperCase();

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    } else {
      headers.append(key, String(value));
    }
  }

  const init: NodeRequestInit = {
    method,
    headers,
  };

  if (!METHODS_WITHOUT_BODY.has(method) && req.readable) {
    init.body = Readable.toWeb(req) as unknown as BodyInit;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

async function sendResponse(
  res: ExpressResponse,
  response: Response
): Promise<void> {
  res.status(response.status);
  res.statusMessage = response.statusText || res.statusMessage;

  const headerMap = new Map<string, string[]>();
  response.headers.forEach((value, key) => {
    const normalized = key;
    const existing = headerMap.get(normalized) ?? [];
    existing.push(value);
    headerMap.set(normalized, existing);
  });

  for (const [key, values] of headerMap) {
    if (values.length === 1) {
      res.setHeader(key, values[0]);
    } else {
      res.setHeader(key, values);
    }
  }

  const webBody =
    response.body as unknown as WebReadableStream<Uint8Array> | null;

  if (!webBody) {
    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(webBody);

  await new Promise<void>((resolve, reject) => {
    let completed = false;
    const finalize = () => {
      if (completed) return;
      completed = true;
      nodeStream.destroy();
      resolve();
    };
    nodeStream.on('error', reject);
    res.on('error', reject);
    res.once('close', finalize);
    res.once('finish', finalize);
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }
    nodeStream.pipe(res);
  });
}
