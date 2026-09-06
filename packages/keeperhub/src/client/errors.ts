import type { ExecutionState, SimulationResult } from './types';

export interface KeeperHubErrorOptions {
  status: number;
  code?: string | undefined;
  body?: unknown;
  requestId?: string | undefined;
  /** Safe to send the same request again under the same Idempotency-Key. */
  retryable?: boolean | undefined;
}

/** Any non-2xx answer from KeeperHub that is not modelled more precisely below. */
export class KeeperHubError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly body: unknown;
  readonly requestId: string | undefined;
  readonly retryable: boolean;

  constructor(message: string, options: KeeperHubErrorOptions) {
    super(message);
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code;
    this.body = options.body;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
  }
}

export class AuthError extends KeeperHubError {}

export class SpendingCapExceeded extends KeeperHubError {}

/** Dry run said the transaction would not land. Nothing was signed or broadcast. */
export class PreflightFailed extends KeeperHubError {
  readonly wouldRevert = true as const;
  readonly failureKind: string | undefined;
  readonly revertReason: string | undefined;
  readonly simulation: SimulationResult;

  constructor(
    message: string,
    simulation: SimulationResult,
    options: KeeperHubErrorOptions
  ) {
    super(message, options);
    this.simulation = simulation;
    this.failureKind = simulation.failureKind;
    this.revertReason = simulation.revertReason;
  }
}

/** 409 idempotency_in_progress: the same key is still being processed. Retry the same key. */
export class IdempotencyInProgress extends KeeperHubError {
  constructor(message: string, options: KeeperHubErrorOptions) {
    super(message, { ...options, retryable: true });
  }
}

/** 409 idempotency_conflict: the key was bound to a different body. Never rotate blindly. */
export class IdempotencyConflict extends KeeperHubError {
  readonly originalExecutionId: string | null;

  constructor(
    message: string,
    originalExecutionId: string | null,
    options: KeeperHubErrorOptions
  ) {
    super(message, { ...options, retryable: false });
    this.originalExecutionId = originalExecutionId;
  }
}

export class RateLimited extends KeeperHubError {
  readonly retryAfterSeconds: number;

  constructor(
    message: string,
    retryAfterSeconds: number,
    options: KeeperHubErrorOptions
  ) {
    super(message, { ...options, retryable: true });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type ExecutionFailureReason =
  | 'failed'
  | 'no_receipt'
  | 'unverified_receipt'
  | 'receipt_not_success'
  | 'unexpected_status';

/** The execution reached a terminal state that is not a verified success. */
export class ExecutionFailed extends Error {
  readonly reason: ExecutionFailureReason;
  readonly state: ExecutionState;

  constructor(reason: ExecutionFailureReason, state: ExecutionState) {
    const detail = state.error ? `: ${state.error}` : '';
    super(
      `KeeperHub execution ${state.executionId} ${reason} (status=${state.status}` +
        `${state.transactionHash ? `, tx=${state.transactionHash}` : ''})${detail}`
    );
    this.name = 'ExecutionFailed';
    this.reason = reason;
    this.state = state;
  }
}

/**
 * The execution did not reach a terminal state within the wait budget.
 * The outcome is unknown, not failed. Do not re-send with a fresh key.
 */
export class ExecutionUnconfirmed extends Error {
  readonly state: ExecutionState;
  readonly waitedMs: number;

  constructor(state: ExecutionState, waitedMs: number) {
    super(
      `KeeperHub execution ${state.executionId} still ${state.status} after ${waitedMs}ms` +
        `${state.transactionHash ? ` (tx=${state.transactionHash})` : ''}; outcome unknown, do not re-send`
    );
    this.name = 'ExecutionUnconfirmed';
    this.state = state;
    this.waitedMs = waitedMs;
  }
}
