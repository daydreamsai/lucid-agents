import type {
  SendMessageRequest,
  TaskError,
  TaskStatus,
  TaskUpdateEvent,
} from '@lucid-agents/types/a2a';
import type {
  AgentRuntime,
  BuildContext,
  EntrypointDef,
  Extension,
} from '@lucid-agents/types/core';
import type {
  HttpExtensionOptions,
  AgentHttpHandlers,
  AgentHttpRuntime,
  HttpIdempotencyStore,
} from '@lucid-agents/types/http';
import type { IdentityRuntime } from '@lucid-agents/types/identity';
import type { A2ARuntime } from '@lucid-agents/types/a2a';
import type { MppRuntime } from '@lucid-agents/types/mpp';
import type { PaymentsRuntime } from '@lucid-agents/types/payments';
import { ZodValidationError } from '@lucid-agents/types/core';
import { authorizeEntrypointRequest } from './authorization';
import { invoke, invokeHandler } from './invoke';
import { jsonResponse, normalizeOrigin, readJson } from './utils';
import { renderLandingPage } from './landing-page';
import { stream } from './stream';
import { createSSEStream, type SSEStreamRunnerContext } from './sse';
import { createAgentRoutePlan } from './route-plan';
import { createInMemoryHttpIdempotencyStore } from './idempotency';

type HttpDependencies = {
  payments?: PaymentsRuntime;
  mpp?: MppRuntime;
  identity?: IdentityRuntime;
  a2a?: A2ARuntime;
};

function hasExplicitPrice(entrypoint: EntrypointDef): boolean {
  if (typeof entrypoint.price === 'string') {
    return entrypoint.price.trim().length > 0;
  }
  return Boolean(
    entrypoint.price &&
    ((typeof entrypoint.price.invoke === 'string' &&
      entrypoint.price.invoke.trim().length > 0) ||
      (typeof entrypoint.price.stream === 'string' &&
        entrypoint.price.stream.trim().length > 0))
  );
}

const TASK_STATUSES = new Set<TaskStatus>([
  'running',
  'completed',
  'failed',
  'cancelled',
]);
const TASK_ACCESS_HEADER = 'Task-Access-Token';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSendMessageRequest(value: unknown): value is SendMessageRequest {
  if (!isRecord(value) || typeof value.skillId !== 'string') return false;
  if (!value.skillId.trim() || !isRecord(value.message)) return false;
  const { role, content } = value.message;
  if (role !== 'user' && role !== 'assistant' && role !== 'system')
    return false;
  if (!isRecord(content)) return false;
  const validContent =
    typeof content.text === 'string' || Array.isArray(content.parts);
  if (!validContent) return false;
  if (value.contextId !== undefined && typeof value.contextId !== 'string') {
    return false;
  }
  if (value.metadata !== undefined && !isRecord(value.metadata)) return false;
  return true;
}

function readTaskAccessToken(
  request: Request,
  options: { generate?: boolean } = {}
): { accessToken: string } | { response: Response } {
  const supplied = request.headers.get(TASK_ACCESS_HEADER)?.trim();
  const accessToken =
    supplied || (options.generate ? globalThis.crypto.randomUUID() : undefined);
  if (!accessToken || accessToken.length < 20 || accessToken.length > 256) {
    return {
      response: jsonResponse(
        {
          error: {
            code: 'task_access_required',
            message: `${TASK_ACCESS_HEADER} must contain 20 to 256 characters`,
          },
        },
        { status: supplied ? 400 : 401 }
      ),
    };
  }
  return { accessToken };
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function taskErrorFrom(error: unknown): TaskError {
  if (error instanceof ZodValidationError) {
    return {
      code: error.kind === 'input' ? 'invalid_input' : 'invalid_output',
      message: error.kind === 'input' ? 'Invalid input' : 'Invalid output',
      details: error.issues,
    };
  }
  return {
    code: 'internal_error',
    message: error instanceof Error ? error.message : 'Task failed',
  };
}

function taskCapabilityUnavailable(): Response {
  return jsonResponse(
    {
      error: {
        code: 'a2a_tasks_not_enabled',
        message: 'A2A task operations require the a2a() extension',
      },
    },
    { status: 404 }
  );
}

function normalizeBasePath(basePath: string | undefined): string {
  if (!basePath || basePath === '/') return '';
  return `/${basePath.replace(/^\/+|\/+$/g, '')}`;
}

const resolveFaviconSvg = (icon?: string): string => {
  const defaultFaviconSvg = `
<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">

        <path fill-rule="evenodd" clip-rule="evenodd" d="M190.172 87.9213C175.564 99.6095 149.992 119.93 148.083 121.365C147.121 122.089 146.334 122.867 146.334 123.096C146.334 123.556 158.5 135.45 159.278 135.75C159.547 135.854 163.56 132.818 168.197 129.004L176.626 122.071L180.274 125.648C182.281 127.616 186.595 131.882 189.86 135.129L195.798 141.032L206.977 141.007C227.117 140.962 230.707 140.265 235.701 135.435C240.683 130.617 240.151 127.577 234.041 125.949C232.998 125.671 227.163 125.233 221.074 124.977C210.495 124.531 209.886 124.442 207.355 122.967C204.531 121.321 192.95 110.815 192.754 109.721C192.609 108.916 202.942 100.385 206.449 98.4141C208.856 97.0614 209.588 96.9633 218.553 96.7939L228.096 96.6137L227.749 106.441L227.402 116.267H237.172H246.94V111.466C246.94 108.824 247.1 100.789 247.295 93.6119L247.649 80.5605L223.489 80.5784L199.327 80.5962L190.172 87.9213ZM266.435 98.2701L266.577 115.98H275.185H283.793L283.592 106.333L283.391 96.6864H293.046C300.247 96.6864 303.306 96.9074 305.082 97.5563C307.895 98.5831 320.377 108.488 320.377 109.693C320.377 110.867 308.501 121.804 305.582 123.318C303.405 124.448 301.936 124.617 291.056 124.987C279.179 125.391 275.964 125.872 273.471 127.621C271.433 129.05 271.886 130.947 275.14 134.596C276.743 136.393 279.037 138.642 280.239 139.592C281.44 140.543 282.428 141.584 282.435 141.906C282.442 142.228 279.785 145.334 276.53 148.807C273.275 152.28 270.612 155.269 270.612 155.447C270.612 155.626 274.849 159.602 280.027 164.283C285.205 168.9
`;

  if (icon && typeof icon === 'string') {
    return icon;
  }

  return defaultFaviconSvg;
};

export function http(
  options?: HttpExtensionOptions
): Extension<{ http: AgentHttpRuntime }, HttpDependencies> {
  let faviconSvg: string | undefined;
  let faviconDataUrl: string | undefined;
  const landingEnabled = options?.landingPage !== false;
  const basePath = normalizeBasePath(options?.basePath);
  const idempotencyOptions = options?.idempotency;
  const configuredIdempotency =
    idempotencyOptions === false ? undefined : idempotencyOptions;
  const idempotencyEnabled = idempotencyOptions !== false;
  const inProgressTtlMs =
    idempotencyOptions === false
      ? 0
      : (configuredIdempotency?.inProgressTtlMs ?? 15 * 60 * 1_000);
  const retentionMs =
    idempotencyOptions === false
      ? 0
      : (configuredIdempotency?.retentionMs ?? 24 * 60 * 60 * 1_000);
  let idempotencyStore: HttpIdempotencyStore | undefined;

  if (
    idempotencyEnabled &&
    (!Number.isFinite(inProgressTtlMs) || inProgressTtlMs <= 0)
  ) {
    throw new Error('idempotency.inProgressTtlMs must be a positive number');
  }
  if (
    idempotencyEnabled &&
    (!Number.isFinite(retentionMs) || retentionMs <= 0)
  ) {
    throw new Error('idempotency.retentionMs must be a positive number');
  }

  return {
    name: 'http',
    after: [
      'wallets',
      'payments',
      'mpp',
      'identity',
      'a2a',
      'ap2',
      'analytics',
      'catalog',
      'scheduler',
    ],
    build(ctx: BuildContext<HttpDependencies>): { http: AgentHttpRuntime } {
      const runtime = ctx.runtime;
      const meta = runtime.agent.config.meta;
      idempotencyStore = idempotencyEnabled
        ? (configuredIdempotency?.store ??
          createInMemoryHttpIdempotencyStore({
            maxEntries: configuredIdempotency?.maxEntries,
          }))
        : undefined;

      // Compute favicon once
      faviconSvg = resolveFaviconSvg(meta.icon);
      faviconDataUrl = `data:image/svg+xml;base64,${toBase64(faviconSvg)}`;

      const manifestPath = `${basePath}/.well-known/agent-card.json`;
      const x402ClientExample = [
        'import { config } from "dotenv";',
        'import {',
        '  decodeXPaymentResponse,',
        '  wrapFetchWithPayment,',
        '  createSigner,',
        '  type Hex,',
        '} from "@x402/fetch";',
        '',
        'config();',
        '',
        'const privateKey = process.env.AGENT_WALLET_PRIVATE_KEY as Hex | string;',
        'const agentUrl = process.env.AGENT_URL as string; // e.g. https://agent.example.com',
        'const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /entrypoints/echo/invoke',
        'const url = `${agentUrl}${endpointPath}`;',
        '',
        'if (!agentUrl || !privateKey || !endpointPath) {',
        '  console.error("Missing required environment variables");',
        '  console.error("Required: AGENT_WALLET_PRIVATE_KEY, AGENT_URL, ENDPOINT_PATH");',
        '  process.exit(1);',
        '}',
        '',
        '/**',
        ' * Demonstrates paying for a protected resource using @x402/fetch.',
        ' *',
        ' * Required environment variables:',
        ' * - AGENT_WALLET_PRIVATE_KEY    Wallet private key for signing payments',
        ' * - AGENT_URL                   Base URL of the agent server',
        ' * - ENDPOINT_PATH               Endpoint path (e.g. /entrypoints/echo/invoke)',
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

      const activePayments = runtime.payments?.config;
      const identityRuntime = runtime.identity;

      const actualHandlers: AgentHttpHandlers = {
        health: async () => {
          return jsonResponse({ ok: true, version: meta.version });
        },
        entrypoints: async () => {
          return jsonResponse({ items: runtime.entrypoints.list() });
        },
        manifest: async req => {
          const publicBaseUrl = `${normalizeOrigin(req)}${basePath}`;
          return jsonResponse(runtime.manifest.build(publicBaseUrl));
        },
        oasf: async req => {
          const record = identityRuntime?.buildOASFRecord?.(req.url);
          if (!record) {
            return jsonResponse(
              {
                error: {
                  code: 'not_found',
                  message: 'OASF record is not enabled',
                },
              },
              { status: 404 }
            );
          }
          return jsonResponse(record);
        },
        landing: landingEnabled
          ? async req => {
              const origin = `${normalizeOrigin(req)}${basePath}`;
              const entrypoints = runtime.entrypoints.snapshot();
              const html = await renderLandingPage({
                meta,
                origin,
                entrypoints,
                activePayments,
                resolvePrice: runtime.payments?.resolvePrice,
                manifestPath,
                faviconDataUrl: faviconDataUrl!,
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
          return new Response(faviconSvg!, {
            headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
          });
        },
        invoke: async (req, params) => {
          return invoke(req, params.key, runtime, {
            idempotency: idempotencyStore
              ? { store: idempotencyStore, inProgressTtlMs, retentionMs }
              : undefined,
          });
        },
        stream: async (req, params) => {
          return stream(req, params.key, runtime);
        },
        tasks: async req => {
          const taskRuntime = runtime.a2a?.tasks;
          if (!taskRuntime) return taskCapabilityUnavailable();

          let requestBody: SendMessageRequest;
          try {
            const body = await readJson(req);
            if (!isSendMessageRequest(body)) {
              return jsonResponse(
                {
                  error: {
                    code: 'invalid_request',
                    message: 'Invalid request body',
                  },
                },
                { status: 400 }
              );
            }
            requestBody = body;
          } catch {
            return jsonResponse(
              { error: { code: 'invalid_request', message: 'Invalid JSON' } },
              { status: 400 }
            );
          }

          const { skillId, message, contextId } = requestBody;
          const taskAccess = readTaskAccessToken(req, { generate: true });
          if ('response' in taskAccess) return taskAccess.response;
          const { accessToken } = taskAccess;

          const taskEntrypoint = runtime.agent.getEntrypoint(skillId);
          if (!taskEntrypoint) {
            return jsonResponse(
              {
                error: {
                  code: 'skill_not_found',
                  message: `Skill "${skillId}" not found`,
                },
              },
              { status: 404 }
            );
          }

          if (!taskEntrypoint.handler) {
            return jsonResponse(
              {
                error: {
                  code: 'not_implemented',
                  message: `Skill "${skillId}" has no handler`,
                },
              },
              { status: 501 }
            );
          }

          const authorization = await authorizeEntrypointRequest(
            req.clone(),
            taskEntrypoint,
            'invoke',
            runtime
          );
          if (authorization.authorized === false) {
            return authorization.response;
          }
          let admission: Awaited<ReturnType<typeof authorization.admit>>;
          try {
            admission = await authorization.admit();
          } catch (error) {
            return jsonResponse(
              {
                error: {
                  code: 'authorization_admission_failed',
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Authorization admission failed',
                },
              },
              { status: 503 }
            );
          }
          if (!admission.admitted) return admission.response;

          let rawInput: unknown;
          // Guard: message.content must be an object to use 'in' operator
          if (
            message.content &&
            typeof message.content === 'object' &&
            !Array.isArray(message.content) &&
            'text' in message.content
          ) {
            try {
              rawInput = JSON.parse(
                (message.content as { text: unknown }).text as string
              );
            } catch {
              rawInput = (message.content as { text: unknown }).text;
            }
          } else if (
            message.content &&
            typeof message.content === 'object' &&
            !Array.isArray(message.content) &&
            'parts' in message.content &&
            Array.isArray((message.content as { parts: unknown }).parts) &&
            (message.content as { parts: unknown[] }).parts.length > 0
          ) {
            const firstPart = (message.content as { parts: unknown[] })
              .parts[0];
            // Guard: firstPart must be an object to use 'in' operator
            if (
              firstPart &&
              typeof firstPart === 'object' &&
              !Array.isArray(firstPart) &&
              'text' in firstPart
            ) {
              rawInput = (firstPart as { text: unknown }).text;
            } else {
              rawInput = firstPart;
            }
          } else {
            rawInput = message.content;
          }

          const taskId = globalThis.crypto.randomUUID();

          try {
            await taskRuntime.reserve({ taskId, contextId, accessToken });
          } catch (error) {
            return admission.finalize(
              jsonResponse(
                {
                  error: {
                    code:
                      error instanceof Error &&
                      error.name === 'TaskCapacityError'
                        ? 'task_capacity_exhausted'
                        : 'task_creation_failed',
                    message:
                      error instanceof Error
                        ? error.message
                        : 'Unable to reserve task capacity',
                  },
                },
                { status: 503 }
              )
            );
          }

          let taskResponse = jsonResponse({
            taskId,
            accessToken,
            status: 'running' as TaskStatus,
          });
          taskResponse = await admission.finalize(taskResponse);
          if (taskResponse.status < 200 || taskResponse.status >= 300) {
            await taskRuntime.cancel(taskId, accessToken);
            return taskResponse;
          }

          console.info(
            '[agent-kit:task] create',
            `taskId=${taskId}`,
            `skillId=${skillId}`
          );

          try {
            await taskRuntime.execute(taskId, {
              execute: async signal => {
                const result = await invokeHandler(taskEntrypoint, rawInput, {
                  signal,
                  headers: req.headers,
                  runId: taskId,
                  runtime,
                  auth: authorization.auth,
                });
                return {
                  output: result.output,
                  usage: result.usage,
                  model: result.model,
                };
              },
              mapError: taskErrorFrom,
            });
          } catch (error) {
            await taskRuntime.cancel(taskId, accessToken);
            return jsonResponse(
              {
                error: {
                  code: 'task_execution_failed',
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Unable to start task execution',
                },
              },
              { status: 503 }
            );
          }

          return taskResponse;
        },
        getTask: async (req, params) => {
          const taskRuntime = runtime.a2a?.tasks;
          if (!taskRuntime) return taskCapabilityUnavailable();
          const taskAccess = readTaskAccessToken(req);
          if ('response' in taskAccess) return taskAccess.response;
          const { taskId } = params;
          const task = await taskRuntime.get(taskId, taskAccess.accessToken);

          if (!task) {
            return jsonResponse(
              {
                error: {
                  code: 'task_not_found',
                  message: `Task "${taskId}" not found`,
                },
              },
              { status: 404 }
            );
          }

          return jsonResponse(task);
        },
        listTasks: async req => {
          const taskRuntime = runtime.a2a?.tasks;
          if (!taskRuntime) return taskCapabilityUnavailable();
          const taskAccess = readTaskAccessToken(req);
          if ('response' in taskAccess) return taskAccess.response;
          const url = new URL(req.url);
          const contextId = url.searchParams.get('contextId') || undefined;
          const statusParam = url.searchParams.get('status');
          const statuses = statusParam
            ? statusParam.split(',').filter(Boolean)
            : undefined;
          if (
            statuses?.some(status => !TASK_STATUSES.has(status as TaskStatus))
          ) {
            return jsonResponse(
              {
                error: {
                  code: 'invalid_request',
                  message: 'status contains an unsupported task state',
                },
              },
              { status: 400 }
            );
          }
          const limit = Number(url.searchParams.get('limit') ?? 50);
          const offset = Number(url.searchParams.get('offset') ?? 0);
          if (
            !Number.isSafeInteger(limit) ||
            limit < 0 ||
            limit > 1_000 ||
            !Number.isSafeInteger(offset) ||
            offset < 0
          ) {
            return jsonResponse(
              {
                error: {
                  code: 'invalid_request',
                  message:
                    'limit must be an integer from 0 to 1000 and offset must be a non-negative integer',
                },
              },
              { status: 400 }
            );
          }

          return jsonResponse(
            await taskRuntime.list(taskAccess.accessToken, {
              contextId,
              status: statuses as TaskStatus[] | undefined,
              limit,
              offset,
            })
          );
        },
        cancelTask: async (req, params) => {
          const taskRuntime = runtime.a2a?.tasks;
          if (!taskRuntime) return taskCapabilityUnavailable();
          const taskAccess = readTaskAccessToken(req);
          if ('response' in taskAccess) return taskAccess.response;
          const { taskId } = params;
          const task = await taskRuntime.get(taskId, taskAccess.accessToken);

          if (!task) {
            return jsonResponse(
              {
                error: {
                  code: 'task_not_found',
                  message: `Task "${taskId}" not found`,
                },
              },
              { status: 404 }
            );
          }

          if (task.status !== 'running') {
            return jsonResponse(
              {
                error: {
                  code: 'invalid_state',
                  message: `Task "${taskId}" is not running`,
                },
              },
              { status: 400 }
            );
          }

          const updatedTask = await taskRuntime.cancel(
            taskId,
            taskAccess.accessToken
          );
          if (!updatedTask || updatedTask.status !== 'cancelled') {
            return jsonResponse(
              {
                error: {
                  code: 'invalid_state',
                  message: `Task "${taskId}" is not running`,
                },
              },
              { status: 409 }
            );
          }
          console.info('[agent-kit:task] cancelled', `taskId=${taskId}`);

          return jsonResponse(updatedTask);
        },
        subscribeTask: async (req, params) => {
          const taskRuntime = runtime.a2a?.tasks;
          if (!taskRuntime) return taskCapabilityUnavailable();
          const taskAccess = readTaskAccessToken(req);
          if ('response' in taskAccess) return taskAccess.response;
          const { taskId } = params;
          const task = await taskRuntime.get(taskId, taskAccess.accessToken);

          if (!task) {
            return jsonResponse(
              {
                error: {
                  code: 'task_not_found',
                  message: `Task "${taskId}" not found`,
                },
              },
              { status: 404 }
            );
          }

          return createSSEStream(
            async ({ write, close }: SSEStreamRunnerContext) => {
              let finished = false;
              let lastEvent = '';
              let unsubscribe = () => {};
              const safetyTimeout = setTimeout(finish, 5 * 60 * 1_000);

              function finish(): void {
                if (finished) return;
                finished = true;
                clearTimeout(safetyTimeout);
                unsubscribe();
                close();
              }

              const emit = (event: TaskUpdateEvent): void => {
                if (finished) return;
                const serialized = JSON.stringify(event.data);
                const signature = `${event.type}:${serialized}`;
                if (signature === lastEvent) return;
                lastEvent = signature;
                write({ event: event.type, data: serialized });
                if (
                  (event.type === 'resultUpdate' &&
                    event.data.status === 'completed') ||
                  (event.type === 'error' && event.data.status === 'failed') ||
                  (event.type === 'statusUpdate' &&
                    event.data.status === 'cancelled')
                ) {
                  finish();
                }
              };

              unsubscribe = await taskRuntime.subscribe(
                taskId,
                taskAccess.accessToken,
                emit
              );
              if (finished) {
                unsubscribe();
                return;
              }
              const current = await taskRuntime.get(
                taskId,
                taskAccess.accessToken
              );
              if (!current) {
                finish();
                return;
              }

              emit({
                type: 'statusUpdate',
                data: { taskId, status: current.status },
              });
              if (current.status === 'completed' && current.result) {
                emit({
                  type: 'resultUpdate',
                  data: {
                    taskId,
                    status: current.status,
                    result: current.result,
                  },
                });
              } else if (current.status === 'failed' && current.error) {
                emit({
                  type: 'error',
                  data: {
                    taskId,
                    status: current.status,
                    error: current.error,
                  },
                });
              }

              req.signal.addEventListener('abort', finish, { once: true });
            }
          );
        },
      };

      return {
        http: {
          basePath,
          handlers: actualHandlers,
          routes: createAgentRoutePlan({
            basePath,
            handlers: actualHandlers,
            hasTasks: Boolean(runtime.a2a?.tasks),
          }),
        },
      };
    },
    onEntrypointAdded(entrypoint, runtime) {
      const capabilities = runtime as AgentRuntime<HttpDependencies>;
      if (
        hasExplicitPrice(entrypoint) &&
        capabilities.payments &&
        capabilities.mpp &&
        !entrypoint.paymentProtocol
      ) {
        throw new Error(
          `Entrypoint "${entrypoint.key}" is priced while both x402 and MPP are installed. ` +
            'Set paymentProtocol to "x402" or "mpp".'
        );
      }
      if (
        entrypoint.siwx?.authOnly &&
        (!capabilities.payments?.siwxConfig?.enabled ||
          !capabilities.payments.siwxStorage)
      ) {
        throw new Error(
          `Entrypoint "${entrypoint.key}" is authOnly but no enabled SIWX runtime is configured.`
        );
      }
    },
    async dispose() {
      await idempotencyStore?.close?.();
    },
  };
}
