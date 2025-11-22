import { randomUUID } from 'node:crypto';

import type {
  AgentRuntime,
  StreamEnvelope,
  StreamPushEnvelope,
  StreamResult,
} from '@lucid-agents/types/core';
import { ZodValidationError } from '@lucid-agents/types/core';

import { errorResponse, extractInput, jsonResponse, readJson } from './http-utils';
import { createSSEStream, type SSEStreamRunnerContext } from './sse';
import { parseInput } from './validation';

/**
 * HTTP-specific stream function.
 * Parses HTTP request, validates input, calls stream handler, emits SSE events.
 */
export async function stream(
  req: Request,
  entrypointKey: string,
  runtime: AgentRuntime
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

  const rawBody = await readJson(req);
  const rawInput = extractInput(rawBody);

  const runId = randomUUID();
  console.info(
    '[agent-kit:entrypoint] stream',
    `key=${entrypoint.key}`,
    `runId=${runId}`
  );

  let sequence = 0;
  const nowIso = () => new Date().toISOString();
  const allocateSequence = () => sequence++;

  return createSSEStream(async ({ write, close }: SSEStreamRunnerContext) => {
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
      // Validate input
      const input = parseInput(entrypoint, rawInput);

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
      };

      // Call stream handler
      const result: StreamResult = await entrypoint.stream(runContext, emit);

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
  });
}

