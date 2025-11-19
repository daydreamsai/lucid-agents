import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import type {
  AgentKitConfig,
  AgentMeta,
  AgentRuntime,
  AP2Config,
} from '@lucid-agents/types/core';
import type { TrustConfig } from '@lucid-agents/types/identity';
import type { PaymentsConfig } from '@lucid-agents/types/payments';

import { ZodValidationError } from '../core/agent';
import { createAgentRuntime, type CreateAgentRuntimeOptions } from '../runtime';
import { renderLandingPage } from '../ui/landing-page';
import { createSSEStream, type SSEStreamRunnerContext } from './sse';
import type {
  EntrypointDef,
  StreamEnvelope,
  StreamPushEnvelope,
  StreamResult,
} from './types';

export type CreateAgentHttpOptions = {
  payments?: PaymentsConfig | false;
  ap2?: AP2Config;
  trust?: TrustConfig;
  entrypoints?: Iterable<EntrypointDef>;
  config?: AgentKitConfig;
  landingPage?: boolean;
};

export type AgentHttpHandlers = {
  health: (req: Request) => Promise<Response>;
  entrypoints: (req: Request) => Promise<Response>;
  manifest: (req: Request) => Promise<Response>;
  landing?: (req: Request) => Promise<Response>;
  favicon: (req: Request) => Promise<Response>;
  invoke: (req: Request, params: { key: string }) => Promise<Response>;
  stream: (req: Request, params: { key: string }) => Promise<Response>;
};

export type AgentHttpRuntime = AgentRuntime & {
  handlers: AgentHttpHandlers;
};

const jsonResponse = (
  payload: unknown,
  init?: ConstructorParameters<typeof Response>[1]
): Response => {
  const body = JSON.stringify(payload);
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }
  return new Response(body, { ...init, headers });
};

const errorResponse = (
  code: string,
  status: number,
  details?: unknown
): Response => {
  return jsonResponse(
    {
      error: {
        code,
        ...(details ? { details } : {}),
      },
    },
    { status }
  );
};

const readJson = async (req: Request): Promise<unknown> => {
  try {
    return await req.clone().json();
  } catch {
    return undefined;
  }
};

const extractInput = (payload: unknown): unknown => {
  if (payload && typeof payload === 'object' && 'input' in payload) {
    const { input } = payload as { input?: unknown };
    return input ?? {};
  }
  return {};
};

const resolveFaviconSvg = (meta: AgentMeta): string => {
  const defaultFaviconSvg = `
<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">

        <path fill-rule="evenodd" clip-rule="evenodd" d="M190.172 87.9213C175.564 99.6095 149.992 119.93 148.083 121.365C147.121 122.089 146.334 122.867 146.334 123.096C146.334 123.556 158.5 135.45 159.278 135.75C159.547 135.854 163.56 132.818 168.197 129.004L176.626 122.071L180.274 125.648C182.281 127.616 186.595 131.882 189.86 135.129L195.798 141.032L206.977 141.007C227.117 140.962 230.707 140.265 235.701 135.435C240.683 130.617 240.151 127.577 234.041 125.949C232.998 125.671 227.163 125.233 221.074 124.977C210.495 124.531 209.886 124.442 207.355 122.967C204.531 121.321 192.95 110.815 192.754 109.721C192.609 108.916 202.942 100.385 206.449 98.4141C208.856 97.0614 209.588 96.9633 218.553 96.7939L228.096 96.6137L227.749 106.441L227.402 116.267H237.172H246.94V111.466C246.94 108.824 247.1 100.789 247.295 93.6119L247.649 80.5605L223.489 80.5784L199.327 80.5962L190.172 87.9213ZM266.435 98.2701L266.577 115.98H275.185H283.793L283.592 106.333L283.391 96.6864H293.046C300.247 96.6864 303.306 96.9074 305.082 97.5563C307.895 98.5831 320.377 108.488 320.377 109.693C320.377 110.867 308.501 121.804 305.582 123.318C303.405 124.448 301.936 124.617 291.056 124.987C279.179 125.391 275.964 125.872 273.471 127.621C271.433 129.05 271.886 130.947 275.14 134.596C276.743 136.393 279.037 138.642 280.239 139.592C281.44 140.543 282.428 141.584 282.435 141.906C282.442 142.228 279.785 145.334 276.53 148.807C273.275 152.28 270.612 155.269 270.612 155.447C270.612 155.626 274.849 159.602 280.027 164.283C285.205 168.9
`;

  if (meta.icon && typeof meta.icon === 'string') {
    return meta.icon;
  }

  return defaultFaviconSvg;
};

export function createAgentHttpRuntime(
  meta: AgentMeta,
  opts: CreateAgentHttpOptions = {}
): AgentHttpRuntime {
  // Create core runtime first
  const runtime = createAgentRuntime(meta, opts as CreateAgentRuntimeOptions);

  const activePayments = runtime.payments?.config;

  const faviconSvg = resolveFaviconSvg(meta);
  const faviconDataUrl = `data:image/svg+xml;base64,${Buffer.from(
    faviconSvg
  ).toString('base64')}`;

  const landingEnabled = opts?.landingPage !== false;
  const manifestPath = '/.well-known/agent-card.json';
  const x402ClientExample = [
    'import { config } from "dotenv";',
    'import {',
    '  decodeXPaymentResponse,',
    '  wrapFetchWithPayment,',
    '  createSigner,',
    '  type Hex,',
    '} from "x402-fetch";',
    '',
    'config();',
    '',
    'const privateKey = process.env.PRIVATE_KEY as Hex | string;',
    'const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com',
    'const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather',
    'const url = `${baseURL}${endpointPath}`; // e.g. https://example.com/weather',
    '',
    'if (!baseURL || !privateKey || !endpointPath) {',
    '  console.error("Missing required environment variables");',
    '  process.exit(1);',
    '}',
    '',
    '/**',
    ' * Demonstrates paying for a protected resource using x402-fetch.',
    ' *',
    ' * Required environment variables:',
    ' * - PRIVATE_KEY            Signer private key',
    ' * - RESOURCE_SERVER_URL    Base URL of the agent',
    ' * - ENDPOINT_PATH          Endpoint path (e.g. /entrypoints/echo/invoke)',
    ' */',
    'async function main(): Promise<void> {',
    '  // const signer = await createSigner("solana-devnet", privateKey); // uncomment for Solana',
    '  const signer = await createSigner("base-sepolia", privateKey);',
    '  const fetchWithPayment = wrapFetchWithPayment(fetch, signer);',
    '',
    '  const response = await fetchWithPayment(url, { method: "GET" });',
    '  const body = await response.json();',
    '  console.log(body);',
    '',
    '  const paymentResponse = decodeXPaymentResponse(',
    '    response.headers.get("x-payment-response")!',
    '  );',
    '  console.log(paymentResponse);',
    '}',
    '',
    'main().catch((error) => {',
    '  console.error(error?.response?.data?.error ?? error);',
    '  process.exit(1);',
    '});',
  ].join('\n');

  const handlers: AgentHttpHandlers = {
    health: async () => {
      return jsonResponse({ ok: true, version: meta.version });
    },
    entrypoints: async () => {
      return jsonResponse({ items: runtime.entrypoints.list() });
    },
    manifest: async req => {
      const origin = new URL(req.url).origin;
      return jsonResponse(runtime.manifest.build(origin));
    },
    landing: landingEnabled
      ? async req => {
          const origin = new URL(req.url).origin;
          const entrypoints = runtime.entrypoints.snapshot();
          const html = renderLandingPage({
            meta,
            origin,
            entrypoints,
            activePayments,
            manifestPath,
            faviconDataUrl,
            x402ClientExample,
          });
          return new Response(String(html), {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
            },
          });
        }
      : undefined,
    favicon: async () => {
      return new Response(faviconSvg, {
        headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
      });
    },
    invoke: async (req, params) => {
      const entrypoint = runtime.agent.getEntrypoint(params.key);
      if (!entrypoint) {
        return errorResponse('entrypoint_not_found', 404);
      }
      if (!entrypoint.handler) {
        return errorResponse('not_implemented', 501);
      }

      const rawBody = await readJson(req);
      const rawInput = extractInput(rawBody);
      const runId = randomUUID();
      console.info(
        '[agent-kit:entrypoint] invoke',
        `key=${entrypoint.key}`,
        `runId=${runId}`
      );
      try {
        const result = await runtime.agent.invoke(entrypoint.key, rawInput, {
          signal: req.signal,
          headers: req.headers,
          runId,
        });
        return jsonResponse({
          run_id: runId,
          status: 'succeeded',
          output: result.output,
          usage: result.usage,
          model: result.model,
        });
      } catch (err) {
        if (err instanceof ZodValidationError) {
          if (err.kind === 'input') {
            return jsonResponse(
              {
                error: { code: 'invalid_input', issues: err.issues },
              },
              { status: 400 }
            );
          }
          return jsonResponse(
            {
              error: { code: 'invalid_output', issues: err.issues },
            },
            { status: 500 }
          );
        }
        const message = (err as Error)?.message || 'error';
        return jsonResponse(
          {
            error: {
              code: 'internal_error',
              message,
            },
          },
          { status: 500 }
        );
      }
    },
    stream: async (req, params) => {
      const entrypoint = runtime.agent.getEntrypoint(params.key);
      if (!entrypoint) {
        return errorResponse('entrypoint_not_found', 404);
      }
      if (!entrypoint.stream) {
        return jsonResponse(
          { error: { code: 'stream_not_supported', key: entrypoint.key } },
          { status: 400 }
        );
      }

      const rawBody = await readJson(req);
      const rawInput = extractInput(rawBody);
      let input = rawInput;
      if (entrypoint.input) {
        const parsed = entrypoint.input.safeParse(rawInput);
        if (!parsed.success) {
          return jsonResponse(
            { error: { code: 'invalid_input', issues: parsed.error.issues } },
            { status: 400 }
          );
        }
        input = parsed.data;
      }

      const runId = randomUUID();
      console.info(
        '[agent-kit:entrypoint] stream',
        `key=${entrypoint.key}`,
        `runId=${runId}`
      );

      let sequence = 0;
      const nowIso = () => new Date().toISOString();
      const allocateSequence = () => sequence++;

      return createSSEStream(
        async ({ write, close }: SSEStreamRunnerContext) => {
          const sendEnvelope = (
            payload: StreamEnvelope | StreamPushEnvelope
          ) => {
            const currentSequence =
              payload.sequence != null ? payload.sequence : allocateSequence();
            const createdAt = payload.createdAt ?? nowIso();
            const envelope: StreamEnvelope = {
              ...(payload as StreamEnvelope),
              runId,
              sequence: currentSequence,
              createdAt,
            };
            write({
              event: envelope.kind,
              data: JSON.stringify(envelope),
              id: String(currentSequence),
            });
          };

          sendEnvelope({
            kind: 'run-start',
            runId,
          });

          const emit = async (chunk: StreamPushEnvelope) => {
            sendEnvelope(chunk);
          };

          try {
            const result: StreamResult = await runtime.agent.stream(
              entrypoint.key,
              input,
              emit,
              {
                signal: req.signal,
                headers: req.headers,
                runId,
              }
            );

            sendEnvelope({
              kind: 'run-end',
              runId,
              status: result.status ?? 'succeeded',
              output: result.output,
              usage: result.usage,
              model: result.model,
              error: result.error,
              metadata: result.metadata,
            });
            close();
          } catch (err) {
            if (err instanceof ZodValidationError && err.kind === 'input') {
              sendEnvelope({
                kind: 'error',
                code: 'invalid_input',
                message: 'Invalid input',
              });
              sendEnvelope({
                kind: 'run-end',
                runId,
                status: 'failed',
                error: { code: 'invalid_input' },
              });
              close();
              return;
            }
            const message = (err as Error)?.message || 'error';
            sendEnvelope({
              kind: 'error',
              code: 'internal_error',
              message,
            });
            sendEnvelope({
              kind: 'run-end',
              runId,
              status: 'failed',
              error: { code: 'internal_error', message },
            });
            close();
          }
        }
      );
    },
  };

  // Return combined runtime with HTTP handlers
  return {
    ...runtime,
    handlers,
  };
}
