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

import type {
  AgentRuntime,
  CreateAgentAppReturn,
} from '@lucid-agents/types/core';
import type {
  AgentHttpRoute,
  AgentHttpRuntime,
} from '@lucid-agents/types/http';

type NodeRequestInit = RequestInit & { duplex?: 'half' };

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);

export type CreateAgentAppOptions = {
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

/** Bind a completed HTTP runtime's canonical route plan to an Express app. */
export async function createAgentApp<
  TCapabilities extends { http: AgentHttpRuntime },
>(
  runtime: AgentRuntime<TCapabilities>,
  opts?: CreateAgentAppOptions
): Promise<
  CreateAgentAppReturn<
    Express,
    AgentRuntime<TCapabilities>,
    AgentRuntime['agent']
  >
> {
  if (!runtime.http) {
    throw new Error(
      'HTTP extension is required. Use app.use(http()) when building the runtime.'
    );
  }
  const app = express();

  opts?.beforeMount?.(app);

  for (const route of runtime.http.routes) {
    const handler = createPlannedRouteHandler(route);
    if (route.method === 'GET') app.get(route.path, handler);
    else app.post(route.path, handler);
  }

  const addEntrypoint: CreateAgentAppReturn<
    Express,
    AgentRuntime<TCapabilities>,
    AgentRuntime['agent']
  >['addEntrypoint'] = def => {
    runtime.entrypoints.add(def);
  };

  opts?.afterMount?.(app);

  return {
    app,
    runtime,
    agent: runtime.agent,
    addEntrypoint,
  };
}

function createPlannedRouteHandler(route: AgentHttpRoute): RequestHandler {
  return async (
    req: ExpressRequest,
    res: ExpressResponse,
    next: NextFunction
  ) => {
    try {
      const request = toWebRequest(req);
      const params = Object.fromEntries(
        route.params.map(name => [name, String(req.params[name] ?? '')])
      );
      const response = await route.handle(request, params);
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
