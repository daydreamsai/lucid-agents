import type {
  A2ATaskRuntime,
  ExecuteTaskOptions,
  PreparedTaskExecution,
  TaskAccess,
  Task,
  TaskStatus,
} from '@lucid-agents/types/a2a';

import type { AdmittedEntrypointAdmission } from './authorization';

type TaskExecutionAdmissionOptions = {
  runtime: A2ATaskRuntime;
  task: TaskAccess;
  capabilityResponse: Response;
  authorization: AdmittedEntrypointAdmission;
  executionClaim: PreparedTaskExecution;
  execution: ExecuteTaskOptions;
  executionErrorResponse: (error: unknown) => Response;
};

type TaskExecutionAdmissionResult = {
  response: Response;
  accepted: boolean;
};

/** Keep the accepted task body while carrying settlement response metadata. */
function preserveTaskCapability(
  response: Response,
  source: Response
): Response {
  const headers = new Headers(response.headers);
  for (const name of [
    'Payment-Receipt',
    'Payment-Response',
    'X-Payment-Response',
  ]) {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.delete('Content-Length');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const TERMINAL_TASK_STATUSES = new Set<TaskStatus>([
  'completed',
  'failed',
  'cancelled',
]);

async function cancelTask(
  runtime: A2ATaskRuntime,
  access: TaskAccess
): Promise<Task | undefined> {
  const cancelled = await runtime
    .cancel(access.taskId, access.accessToken)
    .catch(() => undefined);
  if (cancelled && TERMINAL_TASK_STATUSES.has(cancelled.status)) {
    return cancelled;
  }
  const stored = await runtime
    .get(access.taskId, access.accessToken)
    .catch(() => undefined);
  return stored && TERMINAL_TASK_STATUSES.has(stored.status)
    ? stored
    : undefined;
}

function terminalCapabilityResponse(
  access: TaskAccess,
  task: Task,
  source: Response
): Response {
  return preserveTaskCapability(
    Response.json({ ...access, status: task.status }),
    source
  );
}

function unconfirmedTerminalResponse(
  access: TaskAccess,
  source: Response
): Response {
  return preserveTaskCapability(
    Response.json(
      {
        error: {
          code: 'task_terminalization_failed',
          message:
            'Payment committed, but the terminal task state could not be confirmed. Retain this capability and query the task again.',
        },
        ...access,
      },
      { status: 503 }
    ),
    source
  );
}

function recoverCommittedCapability(
  authorization: AdmittedEntrypointAdmission,
  capabilityResponse: Response
): Response {
  return authorization.recoverCommittedResponse(capabilityResponse);
}

/**
 * Terminalize a pre-reserved task. Committed payment responses retain the
 * receipt and return the durable terminal task capability.
 */
export async function rejectReservedTask(options: {
  runtime: A2ATaskRuntime;
  task: TaskAccess;
  response: Response;
  committed: boolean;
  executionClaim?: Pick<PreparedTaskExecution, 'release'>;
}): Promise<Response> {
  options.executionClaim?.release();
  const task = await cancelTask(options.runtime, options.task);
  return options.committed
    ? task
      ? terminalCapabilityResponse(options.task, task, options.response)
      : unconfirmedTerminalResponse(options.task, options.response)
    : options.response;
}

/**
 * Finalize authorization against an already durable reservation and prepared
 * claim, then activate task execution. Post-commit activation failures become
 * confirmed
 * terminal capabilities instead of losing the payer's task handle.
 */
export async function admitTaskExecution(
  options: TaskExecutionAdmissionOptions
): Promise<TaskExecutionAdmissionResult> {
  const capabilityResponse = options.capabilityResponse.clone();

  try {
    await options.executionClaim.renew();
  } catch (error) {
    options.executionClaim.release();
    const task = await cancelTask(options.runtime, options.task);
    if (options.authorization.isCommitted?.() === true) {
      const committedResponse = recoverCommittedCapability(
        options.authorization,
        capabilityResponse
      );
      return {
        response: task
          ? terminalCapabilityResponse(options.task, task, committedResponse)
          : unconfirmedTerminalResponse(options.task, committedResponse),
        accepted: true,
      };
    }
    await options.authorization.abort?.().catch(() => undefined);
    return {
      response: options.executionErrorResponse(error),
      accepted: false,
    };
  }

  let finalized: Response;
  let committed = false;
  try {
    finalized = await options.authorization.finalize(
      options.capabilityResponse
    );
  } catch (error) {
    committed = options.authorization.isCommitted?.() === true;
    if (!committed) {
      options.executionClaim.release();
      await cancelTask(options.runtime, options.task);
      await options.authorization.abort?.().catch(() => undefined);
      return {
        response: options.executionErrorResponse(error),
        accepted: false,
      };
    }
    finalized = recoverCommittedCapability(
      options.authorization,
      capabilityResponse
    );
  }

  committed ||= options.authorization.isCommitted?.() === true;
  const finalizedSuccessfully =
    finalized.status >= 200 && finalized.status < 300;
  if (!finalizedSuccessfully && !committed) {
    options.executionClaim.release();
    await cancelTask(options.runtime, options.task);
    await options.authorization.abort?.().catch(() => undefined);
    return { response: finalized, accepted: false };
  }

  const acceptedResponse = committed
    ? preserveTaskCapability(capabilityResponse, finalized)
    : finalized;

  try {
    await options.executionClaim.activate(options.execution);
  } catch (error) {
    options.executionClaim.release();
    const task = await cancelTask(options.runtime, options.task);
    if (committed) {
      return {
        response: task
          ? terminalCapabilityResponse(options.task, task, acceptedResponse)
          : unconfirmedTerminalResponse(options.task, acceptedResponse),
        accepted: true,
      };
    }
    await options.authorization.abort?.().catch(() => undefined);
    return {
      response: options.executionErrorResponse(error),
      accepted: false,
    };
  }

  return {
    response: acceptedResponse,
    accepted: true,
  };
}
