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

  let input: unknown;
  try {
    const rawBody = await readJson(req);
    input = parseInput(entrypoint, extractInput(rawBody));
  } catch (err) {
    if (err instanceof ZodValidationError && err.kind === 'input') {
      return admission.finalize(
        jsonResponse(
          { error: { code: 'invalid_input', issues: err.issues } },
          { status: 400 }
        )
      );
    }
    return admission.finalize(
      jsonResponse(
        { error: { code: 'invalid_request', message: 'Invalid JSON' } },
        { status: 400 }
      )
    );
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
    async ({ write, close }: SSEStreamRunnerContext) => {
      const sendEnvelope = (payload: StreamEnvelope | StreamPushEnvelope) => {
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
        // Create protocol-agnostic context (add headers to metadata)
        const runContext = {
          key: entrypoint.key,
          input,
          signal: req.signal,
          metadata: {
            headers: req.headers,
          },
          runId,
          runtime,
          auth: authorization.auth,
        };

        // Call stream handler
        const result: StreamResult = await streamHandler(runContext, emit);

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

  return admission.finalize(response);
}
