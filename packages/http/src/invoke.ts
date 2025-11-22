import { randomUUID } from 'node:crypto';

import type {
  AgentRuntime,
  EntrypointDef,
  AgentContext,
} from '@lucid-agents/types/core';
import { ZodValidationError } from '@lucid-agents/types/core';

import { errorResponse, extractInput, jsonResponse, readJson } from './http-utils';
import { parseInput, parseOutput } from './validation';

export type InvokeResult = {
  output: unknown;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
};

/**
 * Internal invoke function that calls the handler.
 * Used by both HTTP invoke and tasks handler.
 */
export async function invokeHandler(
  entrypoint: EntrypointDef,
  rawInput: unknown,
  context: {
    signal: AbortSignal;
    headers: Headers;
    runId: string;
    runtime: AgentRuntime;
  }
): Promise<InvokeResult> {
  if (!entrypoint.handler) {
    throw new Error(`Entrypoint "${entrypoint.key}" has no handler`);
  }

  // Validate input
  const resolvedInput = parseInput(entrypoint, rawInput);

  // Create protocol-agnostic context (add headers to metadata)
  const runContext: AgentContext = {
    key: entrypoint.key,
    input: resolvedInput,
    signal: context.signal,
    metadata: {
      headers: context.headers,
    },
    runId: context.runId,
    runtime: context.runtime,
  };

  // Call handler
  const result = await entrypoint.handler(runContext);

  // Validate output
  const output = parseOutput(entrypoint, result.output);

  return {
    output,
    usage: result.usage,
    model: result.model,
  };
}

/**
 * HTTP-specific invoke function.
 * Parses HTTP request, validates input/output, calls handler, formats HTTP response.
 */
export async function invoke(
  req: Request,
  entrypointKey: string,
  runtime: AgentRuntime
): Promise<Response> {
  const entrypoint = runtime.agent.getEntrypoint(entrypointKey);
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
    const result = await invokeHandler(entrypoint, rawInput, {
      signal: req.signal,
      headers: req.headers,
      runId,
      runtime,
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
}

