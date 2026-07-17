import type {
  AgentRuntime,
  EntrypointDef,
  AgentContext,
} from '@lucid-agents/types/core';
import type { AgentAuthContext } from '@lucid-agents/types/siwx';
import type { HttpIdempotencyStore } from '@lucid-agents/types/http';
import { ZodValidationError } from '@lucid-agents/types/core';

import { errorResponse, extractInput, jsonResponse, readJson } from './utils';
import { parseInput, parseOutput } from './validation';
import {
  authorizeEntrypointRequest,
  type AuthorizationRuntime,
} from './authorization';
import {
  fingerprintRequest,
  restoreResponse,
  snapshotResponse,
} from './idempotency';

export type InvokeResult = {
  output: unknown;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
};

export type InvokeOptions = {
  auth?: AgentAuthContext;
  idempotency?: {
    store: HttpIdempotencyStore;
    inProgressTtlMs: number;
    retentionMs: number;
    now?: () => number;
  };
};

function idempotencyError(
  code: string,
  message: string,
  status: number,
  source?: Response
): Response {
  const headers = new Headers(source?.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return Response.json({ error: { code, message } }, { status, headers });
}

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
    auth?: AgentAuthContext;
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
    auth: context.auth,
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
  runtime: AuthorizationRuntime,
  options?: InvokeOptions
): Promise<Response> {
  const entrypoint = runtime.agent.getEntrypoint(entrypointKey);
  if (!entrypoint) {
    return errorResponse('entrypoint_not_found', 404);
  }
  if (!entrypoint.handler) {
    return errorResponse('not_implemented', 501);
  }

  const idempotencyKey = req.headers.get('Idempotency-Key')?.trim();
  const idempotency = options?.idempotency;
  if (
    idempotency &&
    idempotencyKey &&
    (idempotencyKey.length < 20 || idempotencyKey.length > 256)
  ) {
    return idempotencyError(
      'invalid_idempotency_key',
      'Idempotency-Key must contain 20 to 256 characters',
      400
    );
  }

  const authorization = await authorizeEntrypointRequest(
    req.clone(),
    entrypoint,
    'invoke',
    runtime,
    options?.auth,
    {
      allowMppIdempotencyRecovery: Boolean(idempotency && idempotencyKey),
    }
  );
  if (authorization.authorized === false) {
    return authorization.response;
  }

  let idempotencyClaim:
    | {
        scope: string;
        key: string;
        ownerId: string;
      }
    | undefined;
  if (idempotency && idempotencyKey) {
    const currentTime = (idempotency.now ?? Date.now)();
    const scope = `entrypoint:${entrypoint.key}:invoke`;
    const ownerId = globalThis.crypto.randomUUID();
    try {
      const claim = await idempotency.store.claim(
        scope,
        idempotencyKey,
        await fingerprintRequest(req, authorization.subject),
        ownerId,
        currentTime + idempotency.inProgressTtlMs,
        currentTime
      );
      if (claim.state === 'completed') {
        const replay = authorization.decorate(restoreResponse(claim.response));
        replay.headers.set('Idempotency-Replayed', 'true');
        return replay;
      }
      if (claim.state === 'in_progress') {
        const response = idempotencyError(
          'idempotency_in_progress',
          'An invocation with this Idempotency-Key is already in progress',
          409
        );
        response.headers.set('Retry-After', '1');
        return response;
      }
      if (claim.state === 'conflict') {
        return idempotencyError(
          'idempotency_key_conflict',
          'Idempotency-Key was already used for a different request',
          409
        );
      }
      idempotencyClaim = { scope, key: idempotencyKey, ownerId };
    } catch (error) {
      return idempotencyError(
        'idempotency_store_error',
        error instanceof Error ? error.message : 'Idempotency store failed',
        503
      );
    }
  }

  const releaseIdempotency = async (response: Response): Promise<Response> => {
    if (!idempotencyClaim || !idempotency) return response;
    try {
      await idempotency.store.release(
        idempotencyClaim.scope,
        idempotencyClaim.key,
        idempotencyClaim.ownerId
      );
      return response;
    } catch (error) {
      return idempotencyError(
        'idempotency_store_error',
        error instanceof Error ? error.message : 'Idempotency store failed',
        503,
        response
      );
    }
  };

  let admission: Awaited<ReturnType<typeof authorization.admit>>;
  try {
    admission = await authorization.admit();
  } catch (error) {
    return releaseIdempotency(
      idempotencyError(
        'authorization_admission_failed',
        error instanceof Error
          ? error.message
          : 'Authorization admission failed',
        503
      )
    );
  }
  if (!admission.admitted) {
    return releaseIdempotency(admission.response);
  }

  const abortAdmission = async (response: Response): Promise<Response> => {
    try {
      await admission.abort();
      return response;
    } catch (error) {
      return idempotencyError(
        'authorization_abort_failed',
        error instanceof Error ? error.message : 'Authorization cleanup failed',
        503,
        response
      );
    }
  };

  const finalize = async (response: Response): Promise<Response> => {
    const completeIdempotency = async (
      completedResponse: Response,
      returnedResponse: Response = completedResponse
    ): Promise<Response> => {
      if (!idempotencyClaim || !idempotency) return returnedResponse;
      try {
        const completed = await idempotency.store.complete(
          idempotencyClaim.scope,
          idempotencyClaim.key,
          idempotencyClaim.ownerId,
          await snapshotResponse(completedResponse),
          (idempotency.now ?? Date.now)() + idempotency.retentionMs
        );
        if (!completed) {
          return idempotencyError(
            'idempotency_claim_lost',
            'The invocation idempotency claim expired before completion',
            503,
            returnedResponse
          );
        }
        return returnedResponse;
      } catch (error) {
        // Do not release after execution or settlement: retaining the claim
        // prevents a retry from running and charging the invocation again.
        return idempotencyError(
          'idempotency_store_error',
          error instanceof Error ? error.message : 'Idempotency store failed',
          503,
          returnedResponse
        );
      }
    };

    const successfulResponse =
      idempotencyClaim &&
      idempotency &&
      response.status >= 200 &&
      response.status < 300
        ? response.clone()
        : undefined;

    let finalized: Response;
    try {
      finalized = await admission.finalize(response);
    } catch (error) {
      const failed = await abortAdmission(
        idempotencyError(
          'authorization_finalization_failed',
          error instanceof Error
            ? error.message
            : 'Authorization finalization failed',
          503
        )
      );
      return admission.isCommitted?.() && successfulResponse
        ? completeIdempotency(successfulResponse, failed)
        : releaseIdempotency(failed);
    }
    if (!idempotencyClaim || !idempotency) return finalized;
    if (finalized.status < 200 || finalized.status >= 300) {
      return admission.isCommitted?.() && successfulResponse
        ? completeIdempotency(successfulResponse, finalized)
        : releaseIdempotency(finalized);
    }
    return completeIdempotency(finalized);
  };

  const runId = crypto.randomUUID();
  console.info(
    '[agent-kit:entrypoint] invoke',
    `key=${entrypoint.key}`,
    `runId=${runId}`
  );

  let rawBody: unknown;
  try {
    rawBody = await readJson(req);
  } catch {
    return finalize(
      jsonResponse(
        { error: { code: 'invalid_request', message: 'Invalid JSON' } },
        { status: 400 }
      )
    );
  }

  try {
    const rawInput = extractInput(rawBody);
    const result = await invokeHandler(entrypoint, rawInput, {
      signal: req.signal,
      headers: req.headers,
      runId,
      runtime,
      auth: authorization.auth,
    });

    return finalize(
      jsonResponse({
        run_id: runId,
        status: 'succeeded',
        output: result.output,
        usage: result.usage,
        model: result.model,
      })
    );
  } catch (err) {
    if (err instanceof ZodValidationError) {
      if (err.kind === 'input') {
        return finalize(
          jsonResponse(
            {
              error: { code: 'invalid_input', issues: err.issues },
            },
            { status: 400 }
          )
        );
      }
      return finalize(
        jsonResponse(
          {
            error: { code: 'invalid_output', issues: err.issues },
          },
          { status: 500 }
        )
      );
    }
    const message = (err as Error)?.message || 'error';
    return finalize(
      jsonResponse(
        {
          error: {
            code: 'internal_error',
            message,
          },
        },
        { status: 500 }
      )
    );
  }
}
