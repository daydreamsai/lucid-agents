import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import type {
  SendMessageRequest,
  Task,
  TaskError,
  TaskResult,
  TaskStatus,
} from '@lucid-agents/types/a2a';
import type {
  AgentRuntime,
  BuildContext,
  EntrypointDef,
  Extension,
  StreamResult,
} from '@lucid-agents/types/core';
import type {
  HttpExtensionOptions,
  AgentHttpHandlers,
} from '@lucid-agents/types/http';

import { ZodValidationError } from '@lucid-agents/types/core';
import { invoke, invokeHandler } from './invoke';
import {
  errorResponse,
  extractInput,
  jsonResponse,
  readJson,
} from './http-utils';
import { renderLandingPage } from './landing-page';
import { stream } from './stream';
import { createSSEStream, type SSEStreamRunnerContext } from './sse';

type TaskEntry = {
  task: Task;
  controller?: AbortController;
};

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
): Extension<{ handlers: AgentHttpHandlers }> {
  // Task state stored in extension closure (not in runtime)
  const tasks = new Map<string, TaskEntry>();

  let faviconSvg: string | undefined;
  let faviconDataUrl: string | undefined;
  const landingEnabled = options?.landingPage !== false;
  let handlers: AgentHttpHandlers | undefined;

  return {
    name: 'http',
    build(_ctx: BuildContext): { handlers: AgentHttpHandlers } {
      // Handlers will be created in onBuild hook after runtime is fully constructed
      // Return placeholder - will be replaced in onBuild
      handlers = {} as AgentHttpHandlers;
      return { handlers };
    },
    onBuild(runtime: AgentRuntime) {
      const meta = runtime.agent.config.meta;

      // Compute favicon once
      faviconSvg = resolveFaviconSvg(meta.icon);
      faviconDataUrl = `data:image/svg+xml;base64,${Buffer.from(
        faviconSvg
      ).toString('base64')}`;

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
        ' * Demonstrates paying for a protected resource using x402-fetch.',
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

      const actualHandlers: AgentHttpHandlers = {
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
              const html = await renderLandingPage({
                meta,
                origin,
                entrypoints,
                activePayments,
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
          return invoke(req, params.key, runtime);
        },
        stream: async (req, params) => {
          return stream(req, params.key, runtime);
        },
        tasks: async req => {
          let requestBody: SendMessageRequest;
          try {
            const body = await readJson(req);
            if (
              !body ||
              typeof body !== 'object' ||
              !('message' in body) ||
              !('skillId' in body)
            ) {
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
            requestBody = body as SendMessageRequest;
          } catch {
            return jsonResponse(
              { error: { code: 'invalid_request', message: 'Invalid JSON' } },
              { status: 400 }
            );
          }

          const { skillId, message, contextId } = requestBody;

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

          let rawInput: unknown;
          if ('text' in message.content) {
            try {
              rawInput = JSON.parse(message.content.text);
            } catch {
              rawInput = message.content.text;
            }
          } else if (
            'parts' in message.content &&
            message.content.parts.length > 0
          ) {
            const firstPart = message.content.parts[0];
            rawInput = 'text' in firstPart ? firstPart.text : firstPart;
          } else {
            rawInput = message.content;
          }

          const taskId = randomUUID();
          const abortController = new AbortController();
          const now = new Date().toISOString();

          const task: Task = {
            taskId,
            status: 'running',
            contextId,
            createdAt: now,
            updatedAt: now,
          };

          tasks.set(taskId, {
            task,
            controller: abortController,
          });

          console.info(
            '[agent-kit:task] create',
            `taskId=${taskId}`,
            `skillId=${skillId}`
          );

          invokeHandler(taskEntrypoint, rawInput, {
            signal: abortController.signal,
            headers: req.headers,
            runId: taskId,
            runtime,
          })
            .then(result => {
              const entry = tasks.get(taskId);
              if (!entry) return;

              const currentStatus = entry.task.status;
              if (
                currentStatus === 'completed' ||
                currentStatus === 'failed' ||
                currentStatus === 'cancelled'
              ) {
                return;
              }

              const updatedTask: Task = {
                ...entry.task,
                status: 'completed',
                result: {
                  output: result.output,
                  usage: result.usage,
                  model: result.model,
                } as TaskResult,
                updatedAt: new Date().toISOString(),
              };
              tasks.set(taskId, {
                task: updatedTask,
                controller: entry.controller,
              });
              console.info('[agent-kit:task] completed', `taskId=${taskId}`);
            })
            .catch(err => {
              const entry = tasks.get(taskId);
              if (!entry) return;

              const currentStatus = entry.task.status;
              if (
                currentStatus === 'completed' ||
                currentStatus === 'failed' ||
                currentStatus === 'cancelled'
              ) {
                return;
              }

              if (err.name === 'AbortError') {
                const updatedTask: Task = {
                  ...entry.task,
                  status: 'cancelled',
                  updatedAt: new Date().toISOString(),
                };
                tasks.set(taskId, {
                  task: updatedTask,
                  controller: entry.controller,
                });
                console.info('[agent-kit:task] cancelled', `taskId=${taskId}`);
                return;
              }

              let error: TaskError;
              if (err instanceof ZodValidationError) {
                if (err.kind === 'input') {
                  error = {
                    code: 'invalid_input',
                    message: 'Invalid input',
                    details: err.issues,
                  };
                } else {
                  error = {
                    code: 'invalid_output',
                    message: 'Invalid output',
                    details: err.issues,
                  };
                }
              } else {
                error = {
                  code: 'internal_error',
                  message: (err as Error)?.message || 'error',
                };
              }

              const updatedTask: Task = {
                ...entry.task,
                status: 'failed',
                error,
                updatedAt: new Date().toISOString(),
              };
              tasks.set(taskId, {
                task: updatedTask,
                controller: entry.controller,
              });
              console.info(
                '[agent-kit:task] failed',
                `taskId=${taskId}`,
                `error=${error.code}`
              );
            });

          return jsonResponse({
            taskId,
            status: 'running' as TaskStatus,
          });
        },
        getTask: async (req, params) => {
          const { taskId } = params;
          const entry = tasks.get(taskId);

          if (!entry) {
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

          return jsonResponse(entry.task);
        },
        listTasks: async req => {
          const url = new URL(req.url);
          const contextId = url.searchParams.get('contextId') || undefined;
          const statusParam = url.searchParams.get('status');
          const status = statusParam
            ? ((statusParam.includes(',')
                ? statusParam.split(',')
                : statusParam) as TaskStatus | TaskStatus[])
            : undefined;
          const limit = parseInt(url.searchParams.get('limit') || '50', 10);
          const offset = parseInt(url.searchParams.get('offset') || '0', 10);

          let filteredTasks = Array.from(tasks.values()).map(
            entry => entry.task
          );

          if (contextId) {
            filteredTasks = filteredTasks.filter(
              t => t.contextId === contextId
            );
          }

          if (status) {
            const statusArray = Array.isArray(status) ? status : [status];
            filteredTasks = filteredTasks.filter(t =>
              statusArray.includes(t.status)
            );
          }

          const total = filteredTasks.length;
          const paginatedTasks = filteredTasks.slice(offset, offset + limit);
          const hasMore = offset + limit < total;

          return jsonResponse({
            tasks: paginatedTasks,
            total,
            hasMore,
          });
        },
        cancelTask: async (req, params) => {
          const { taskId } = params;
          const entry = tasks.get(taskId);

          if (!entry) {
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

          if (entry.task.status !== 'running') {
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

          if (entry.controller) {
            entry.controller.abort();
          }

          const updatedTask: Task = {
            ...entry.task,
            status: 'cancelled',
            updatedAt: new Date().toISOString(),
          };

          tasks.set(taskId, {
            task: updatedTask,
            controller: entry.controller,
          });
          console.info('[agent-kit:task] cancelled', `taskId=${taskId}`);

          return jsonResponse(updatedTask);
        },
        subscribeTask: async (req, params) => {
          const { taskId } = params;
          const entry = tasks.get(taskId);

          if (!entry) {
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

          const task = entry.task;
          return createSSEStream(
            async ({ write, close }: SSEStreamRunnerContext) => {
              let lastStatus = task.status;

              write({
                event: 'statusUpdate',
                data: JSON.stringify({
                  taskId,
                  status: task.status,
                }),
              });

              if (task.status === 'completed' && task.result) {
                write({
                  event: 'resultUpdate',
                  data: JSON.stringify({
                    taskId,
                    status: task.status,
                    result: task.result,
                  }),
                });
                close();
                return;
              }

              if (task.status === 'failed' && task.error) {
                write({
                  event: 'error',
                  data: JSON.stringify({
                    taskId,
                    status: task.status,
                    error: task.error,
                  }),
                });
                close();
                return;
              }

              if (task.status === 'cancelled') {
                write({
                  event: 'statusUpdate',
                  data: JSON.stringify({
                    taskId,
                    status: task.status,
                  }),
                });
                close();
                return;
              }

              const checkInterval = setInterval(() => {
                const currentEntry = tasks.get(taskId);
                if (!currentEntry) {
                  clearInterval(checkInterval);
                  close();
                  return;
                }

                const currentTask = currentEntry.task;
                if (currentTask.status !== lastStatus) {
                  write({
                    event: 'statusUpdate',
                    data: JSON.stringify({
                      taskId,
                      status: currentTask.status,
                    }),
                  });
                  lastStatus = currentTask.status;
                }

                if (currentTask.status === 'completed' && currentTask.result) {
                  write({
                    event: 'resultUpdate',
                    data: JSON.stringify({
                      taskId,
                      status: currentTask.status,
                      result: currentTask.result,
                    }),
                  });
                  clearInterval(checkInterval);
                  close();
                  return;
                }

                if (currentTask.status === 'failed' && currentTask.error) {
                  write({
                    event: 'error',
                    data: JSON.stringify({
                      taskId,
                      status: currentTask.status,
                      error: currentTask.error,
                    }),
                  });
                  clearInterval(checkInterval);
                  close();
                  return;
                }

                if (currentTask.status === 'cancelled') {
                  write({
                    event: 'statusUpdate',
                    data: JSON.stringify({
                      taskId,
                      status: currentTask.status,
                    }),
                  });
                  clearInterval(checkInterval);
                  close();
                  return;
                }
              }, 100);

              req.signal?.addEventListener('abort', () => {
                clearInterval(checkInterval);
                close();
              });

              setTimeout(
                () => {
                  clearInterval(checkInterval);
                  close();
                },
                5 * 60 * 1000
              );
            }
          );
        },
      };

      // Update runtime with actual handlers
      handlers = actualHandlers;
      (runtime as any).handlers = actualHandlers;
    },
  };
}
