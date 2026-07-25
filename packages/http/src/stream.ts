import type { AgentAuthContext } from '@lucid-agents/types/siwx';
import type {
  StreamEnvelope,
  StreamPushEnvelope,
  StreamResult,
} from '@lucid-agents/types/http';
import { ZodValidationError } from '@lucid-agents/types/core';

import { errorResponse, extractInput, jsonResponse, readJson } from './utils';
import { createSSEStream, type SSEStreamRunnerContext } from './sse';
import { parseInput } from './validation';
import {
  authorizeEntrypointRequest,
  type AuthorizationRuntime,
} from './authorization';

class SessionMeterUnavailableError extends Error {
  readonly problem: Response;

  constructor(problem: Response) {
    super('Tempo session balance is unavailable');
    this.name = 'SessionMeterUnavailableError';
    this.problem = problem;
  }
}

class SessionAccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionAccountingError';
  }
}

async function sessionProblemData(response: Response): Promise<string> {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('json')) {
    try {
      return JSON.stringify(await response.clone().json());
    } catch {
      // Fall through to a deterministic generic Problem Details document.
    }
  }
  return JSON.stringify({
    type: 'https://paymentauth.org/problems/session/insufficient-balance',
    title: 'Insufficient Balance',
    status: 402,
    detail: 'The Tempo session cannot fund the next stream unit.',
  });
}

/**
 * HTTP-specific stream function.
 * Parses HTTP request, validates input, calls stream handler, emits SSE events.
 */
export async function stream(
  req: Request,
  entrypointKey: string,
  runtime: AuthorizationRuntime,
  options?: { auth?: AgentAuthContext }
): Promise<Response> {
  const entrypoint = runtime.agent.getEntrypoint(entrypointKey);
  if (!entrypoint) {
    return errorResponse('entrypoint_not_found', 404);
  }
  if (!entrypoint.stream) {
    return jsonResponse(
      { error: { code: 'stream_not_supported', key: entrypoint.key } },
      { status: 400 }
    );
  }
  const streamHandler = entrypoint.stream;

  if (runtime.mpp?.credentialPurpose?.(req) === 'management') {
    const managementAuthorization = await authorizeEntrypointRequest(
      req.clone(),
      entrypoint,
      'stream',
      runtime,
      options?.auth
    );
    if (managementAuthorization.authorized === false) {
      return managementAuthorization.response;
    }
    return jsonResponse(
      {
        error: {
          code: 'mpp_management_not_handled',
          message:
            'Verified MPP management credentials must produce a protocol response.',
        },
      },
      { status: 500 }
    );
  }

  let input: unknown;
  try {
    const rawBody = await readJson(req.clone());
    input = parseInput(entrypoint, extractInput(rawBody));
  } catch (err) {
    if (err instanceof ZodValidationError && err.kind === 'input') {
      return jsonResponse(
        { error: { code: 'invalid_input', issues: err.issues } },
        { status: 400 }
      );
    }
    return jsonResponse(
      { error: { code: 'invalid_request', message: 'Invalid JSON' } },
      { status: 400 }
    );
  }

  const authorization = await authorizeEntrypointRequest(
    req.clone(),
    entrypoint,
    'stream',
    runtime,
    options?.auth
  );
  if (authorization.authorized === false) {
    return authorization.response;
  }
  const cancelSessionMeter = async (): Promise<void> => {
    await authorization.sessionMeter?.cancel();
  };
  let admission: Awaited<ReturnType<typeof authorization.admit>>;
  try {
    admission = await authorization.admit();
  } catch (error) {
    await cancelSessionMeter();
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
  if (!admission.admitted) {
    await cancelSessionMeter();
    return admission.response;
  }

  const runId = crypto.randomUUID();
  console.info(
    '[agent-kit:entrypoint] stream',
    `key=${entrypoint.key}`,
    `runId=${runId}`
  );

  let sequence = 0;
  const nowIso = () => new Date().toISOString();
  const allocateSequence = () => sequence++;

  const response = createSSEStream(
    async ({ write, close, ready, signal }: SSEStreamRunnerContext) => {
      const sessionMeter = authorization.sessionMeter;
      let deliveredUnits = 0;
      let cancelMeterPromise: Promise<void> | undefined;
      let sessionFinalizationPromise: Promise<Response> | undefined;
      const cancelMeter = (): Promise<void> => {
        if (!sessionMeter) return Promise.resolve();
        cancelMeterPromise ??= sessionMeter.cancel();
        return cancelMeterPromise;
      };
      const actualSessionAmount = (): string => {
        if (!sessionMeter) return '0';
        return (
          BigInt(sessionMeter.unitAmount) * BigInt(deliveredUnits)
        ).toString();
      };
      const finalizeSession = async (): Promise<void> => {
        if (!sessionMeter) return;
        sessionFinalizationPromise ??= admission.finalize(
          new Response(null, { status: 200 }),
          {
            payment: {
              actualAmount: actualSessionAmount(),
              asset: authorization.sessionPayment?.asset,
              reference:
                authorization.sessionPayment?.reference ??
                sessionMeter.channelId,
            },
          }
        );
        const finalized = await sessionFinalizationPromise;
        if (finalized.status < 200 || finalized.status >= 300) {
          let message = 'Tempo session accounting failed';
          try {
            const body = (await finalized.clone().json()) as {
              error?: { message?: unknown };
            };
            if (typeof body.error?.message === 'string') {
              message = body.error.message;
            }
          } catch {
            // Preserve the deterministic fallback.
          }
          throw new SessionAccountingError(message);
        }
      };
      const sendEnvelope = async (
        payload: StreamEnvelope | StreamPushEnvelope
      ): Promise<void> => {
        const currentSequence =
          payload.sequence != null ? payload.sequence : allocateSequence();
        const createdAt = payload.createdAt ?? nowIso();
        const envelope: StreamEnvelope = {
          ...(payload as StreamEnvelope),
          runId,
          sequence: currentSequence,
          createdAt,
        };
        await write({
          event: envelope.kind,
          data: JSON.stringify(envelope),
          id: String(currentSequence),
        });
      };

      const emit = async (chunk: StreamPushEnvelope) => {
        await ready();
        if (sessionMeter) {
          const charge = await sessionMeter.charge({
            signal,
            onNeedVoucher: async event => {
              await write({
                event: event.event,
                data: JSON.stringify(event.data),
              });
            },
          });
          if (charge.status === 'unavailable') {
            throw new SessionMeterUnavailableError(charge.problem);
          }
          if (signal.aborted) {
            await charge.rollback();
            return;
          }
          try {
            await sendEnvelope(chunk);
          } catch (error) {
            await charge.rollback();
            throw error;
          }
          deliveredUnits += 1;
          return;
        }
        if (signal.aborted) return;
        await sendEnvelope(chunk);
        deliveredUnits += 1;
      };

      try {
        await sendEnvelope({
          kind: 'run-start',
          runId,
        });

        // Create protocol-agnostic context (add headers to metadata)
        const runContext = {
          key: entrypoint.key,
          input,
          signal,
          metadata: {
            headers: req.headers,
          },
          runId,
          runtime,
          auth: authorization.auth,
        };

        // Call stream handler
        const result: StreamResult = await streamHandler(runContext, emit);

        await cancelMeter();
        const sessionReceipt = sessionMeter
          ? await sessionMeter.receipt()
          : undefined;
        await finalizeSession();
        if (sessionReceipt) {
          await write({
            event: sessionReceipt.event,
            data: JSON.stringify(sessionReceipt.data),
          });
        }
        await sendEnvelope({
          kind: 'run-end',
          runId,
          status: result.status ?? 'succeeded',
          output: result.output,
          usage: result.usage,
          model: result.model,
          error: result.error,
          metadata: sessionReceipt
            ? {
                ...result.metadata,
                mppSession: {
                  channelId: sessionMeter!.channelId,
                  unitType: sessionMeter!.unitType,
                  deliveredUnits,
                  actualAmount: actualSessionAmount(),
                  spent: sessionReceipt.data.spent,
                  units: sessionReceipt.data.units,
                },
              }
            : result.metadata,
        });
        await close();
      } catch (err) {
        await cancelMeter().catch(() => undefined);
        let failure: unknown = err;
        try {
          await finalizeSession();
        } catch (accountingError) {
          failure = accountingError;
        }
        if (signal.aborted) return;
        if (failure instanceof SessionMeterUnavailableError) {
          await write({
            event: 'error',
            data: await sessionProblemData(failure.problem),
          });
          await sendEnvelope({
            kind: 'run-end',
            runId,
            status: 'failed',
            error: {
              code: 'session_payment_unavailable',
              message: failure.message,
            },
          });
          await close();
          return;
        }
        const accountingFailure = failure instanceof SessionAccountingError;
        const message = (failure as Error)?.message || 'error';
        await sendEnvelope({
          kind: 'error',
          code: accountingFailure
            ? 'session_accounting_failed'
            : 'internal_error',
          message,
        });
        await sendEnvelope({
          kind: 'run-end',
          runId,
          status: 'failed',
          error: {
            code: accountingFailure
              ? 'session_accounting_failed'
              : 'internal_error',
            message,
          },
        });
        await close();
      } finally {
        await cancelMeter().catch(() => undefined);
        await finalizeSession().catch(error => {
          if (!signal.aborted) {
            console.error(
              '[agent-kit:entrypoint] session finalization failed',
              error
            );
          }
        });
      }
    },
    { signal: req.signal }
  );

  if (authorization.sessionMeter) return authorization.decorate(response);
  return admission.finalize(response);
}
