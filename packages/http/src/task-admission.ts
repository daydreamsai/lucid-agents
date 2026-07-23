import type {
  A2ATaskRuntime,
  ExecuteTaskOptions,
  PreparedTaskExecution,
  Task,
  TaskStatus,
} from '@lucid-agents/types/a2a';

type TaskAuthorizationAdmission = {
  abort?: () => Promise<void>;
  isCommitted?: () => boolean;
  recoverCommittedResponse?: (response: Response) => Response;
  finalize: (response: Response) => Promise<Response>;
};

type TaskExecutionAdmissionOptions = {
  runtime: A2ATaskRuntime;
  taskId: string;
  accessToken: string;
  capabilityResponse: Response;
  authorization: TaskAuthorizationAdmission;
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
  taskId: string,
  accessToken: string
): Promise<Task | undefined> {
  const cancelled = await runtime
    .cancel(taskId, accessToken)
    .catch(() => undefined);
  if (cancelled && TERMINAL_TASK_STATUSES.has(cancelled.status)) {
    return cancelled;
  }
  const stored = await runtime.get(taskId, accessToken).catch(() => undefined);
  return stored && TERMINAL_TASK_STATUSES.has(stored.status)
    ? stored
    : undefined;
}

function terminalCapabilityResponse(
  taskId: string,
  accessToken: string,
  task: Task,
  source: Response
): Response {
  return preserveTaskCapability(
    Response.json({ taskId, accessToken, status: task.status }),
    source
  );
}

function unconfirmedTerminalResponse(
  taskId: string,
  accessToken: string,
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
        taskId,
        accessToken,
      },
      { status: 503 }
    ),
    source
  );
}

function recoverCommittedCapability(
  authorization: TaskAuthorizationAdmission,
  capabilityResponse: Response
): Response {
  return (
    authorization.recoverCommittedResponse?.(capabilityResponse) ??
    capabilityResponse
  );
}

/**
 * Terminalize a pre-reserved task. Committed payment responses retain the
 * receipt and return the durable terminal task capability.
 */
export async function rejectReservedTask(options: {
  runtime: A2ATaskRuntime;
  taskId: string;
  accessToken: string;
  response: Response;
  committed: boolean;
  executionClaim?: Pick<PreparedTaskExecution, 'release'>;
}): Promise<Response> {
  options.executionClaim?.release();
  const task = await cancelTask(
    options.runtime,
    options.taskId,
    options.accessToken
  );
  return options.committed
    ? task
      ? terminalCapabilityResponse(
          options.taskId,
          options.accessToken,
          task,
          options.response
        )
      : unconfirmedTerminalResponse(
          options.taskId,
          options.accessToken,
          options.response
        )
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
    const task = await cancelTask(
      options.runtime,
      options.taskId,
      options.accessToken
    );
    if (options.authorization.isCommitted?.() === true) {
      const committedResponse = recoverCommittedCapability(
        options.authorization,
        capabilityResponse
      );
      return {
        response: task
          ? terminalCapabilityResponse(
              options.taskId,
              options.accessToken,
              task,
              committedResponse
            )
          : unconfirmedTerminalResponse(
              options.taskId,
              options.accessToken,
              committedResponse
            ),
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
      await cancelTask(options.runtime, options.taskId, options.accessToken);
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
    await cancelTask(options.runtime, options.taskId, options.accessToken);
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
    const task = await cancelTask(
      options.runtime,
      options.taskId,
      options.accessToken
    );
    if (committed) {
      return {
        response: task
          ? terminalCapabilityResponse(
              options.taskId,
              options.accessToken,
              task,
              acceptedResponse
            )
          : unconfirmedTerminalResponse(
              options.taskId,
              options.accessToken,
              acceptedResponse
            ),
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
