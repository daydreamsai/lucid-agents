import {
  AuthError,
  ExecutionFailed,
  ExecutionUnconfirmed,
  IdempotencyConflict,
  IdempotencyInProgress,
  KeeperHubError,
  PreflightFailed,
  RateLimited,
  SpendingCapExceeded,
} from './errors';
import {
  canonicalContractCallBody,
  canonicalTransferBody,
  deriveContractCallKey,
  deriveTransferKey,
} from './idempotency';
import type {
  ClientEvent,
  ContractCallRequest,
  ExecutionAccepted,
  ExecutionState,
  FetchLike,
  Receipt,
  SimulationResult,
  TransferRequest,
  VerifiedExecution,
  WorkflowDefinition,
  WorkflowExecutionResult,
  WorkflowSummary,
  WorkflowTransactionHash,
} from './types';

export interface KeeperHubClientOptions {
  /** Organization API key (`kh_...`). Never a user `wfb_` key. */
  apiKey: string;
  /** Defaults to https://app.keeperhub.com */
  baseUrl?: string | undefined;
  /** Injected for tests and for wrapping (tracing, x402, ...). */
  fetch?: FetchLike | undefined;
  /** Injected for tests; defaults to a real timer. */
  sleep?: ((ms: number) => Promise<void>) | undefined;
  /** Injected for tests; defaults to Date.now. */
  now?: (() => number) | undefined;
  onEvent?: ((event: ClientEvent) => void) | undefined;
  /** Transient failures (5xx, network, 429) retried under the same key. Default 5. */
  maxAttempts?: number | undefined;
  /** How long to keep re-sending a key that answers 409 in_progress. Default 120 s. */
  inProgressMaxWaitMs?: number | undefined;
}

export interface ExecuteOptions {
  idempotencyKey: string;
}

export interface WaitOptions {
  /** Default 180 s. Past this the outcome is unknown and ExecutionUnconfirmed is thrown. */
  maxWaitMs?: number | undefined;
  minIntervalMs?: number | undefined;
  maxIntervalMs?: number | undefined;
  /** A state already fetched; skips the first status call when it is terminal. */
  initial?: ExecutionState | undefined;
}

export interface VerifyOptions extends WaitOptions {
  /** Explicit key. When absent, `taskId` is required and the key is derived per KeeperHub's rule. */
  idempotencyKey?: string | undefined;
  taskId?: string | undefined;
  /** Skip the dry run. Only for callers that already simulated the identical body. */
  skipSimulation?: boolean | undefined;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed']);
const DEFAULT_BASE_URL = 'https://app.keeperhub.com';
const TRANSFER_PATH = '/api/execute/transfer';
const CONTRACT_CALL_PATH = '/api/execute/contract-call';

const realSleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Typed client for KeeperHub direct execution.
 *
 * Every write follows the documented safe sequence: simulate with the exact body,
 * broadcast the same body under a stable Idempotency-Key, poll the status endpoint
 * honouring X-Poll-Interval-Hint, and only call the execution landed when every
 * receipt is verified with receiptStatus "success".
 */
export class KeeperHubClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly onEvent: ((event: ClientEvent) => void) | undefined;
  private readonly maxAttempts: number;
  private readonly inProgressMaxWaitMs: number;

  constructor(options: KeeperHubClientOptions) {
    if (!options.apiKey || !options.apiKey.trim()) {
      throw new Error('KeeperHubClient: apiKey is required');
    }
    if (options.apiKey.startsWith('wfb_')) {
      throw new Error(
        'KeeperHubClient: wfb_ keys authenticate webhooks only; use an organization kh_ key'
      );
    }
    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? realSleep;
    this.now = options.now ?? (() => Date.now());
    this.onEvent = options.onEvent;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 5);
    this.inProgressMaxWaitMs = options.inProgressMaxWaitMs ?? 120_000;
  }

  /** GET /api/keys: 200 means the key is valid and scoped to an organization. */
  async probe(): Promise<boolean> {
    const res = await this.request('GET', '/api/keys');
    return res.ok;
  }

  /** GET /api/user: the active organization's wallet (the account to fund), not the login address. */
  async me(): Promise<{
    id?: string;
    email?: string;
    walletAddress: string | null;
    raw: Record<string, unknown>;
  }> {
    const res = await this.request('GET', '/api/user');
    const json = await this.json(res);
    if (!res.ok) {
      throw this.mapError(res, json);
    }
    const record = asRecord(json);
    const me: {
      id?: string;
      email?: string;
      walletAddress: string | null;
      raw: Record<string, unknown>;
    } = {
      walletAddress:
        typeof record.walletAddress === 'string' ? record.walletAddress : null,
      raw: record,
    };
    if (typeof record.id === 'string') {
      me.id = record.id;
    }
    if (typeof record.email === 'string') {
      me.email = record.email;
    }
    return me;
  }

  async listChains(): Promise<unknown[]> {
    const res = await this.request('GET', '/api/chains');
    const json = await this.json(res);
    if (!res.ok) {
      throw this.mapError(res, json);
    }
    return Array.isArray(json)
      ? json
      : ((json as { chains?: unknown[] }).chains ?? []);
  }

  simulateTransfer(req: TransferRequest): Promise<SimulationResult> {
    return this.simulate(TRANSFER_PATH, canonicalTransferBody(req));
  }

  simulateContractCall(req: ContractCallRequest): Promise<SimulationResult> {
    return this.simulate(CONTRACT_CALL_PATH, canonicalContractCallBody(req));
  }

  executeTransfer(
    req: TransferRequest,
    options: ExecuteOptions
  ): Promise<ExecutionAccepted> {
    return this.execute(TRANSFER_PATH, canonicalTransferBody(req), options);
  }

  executeContractCall(
    req: ContractCallRequest,
    options: ExecuteOptions
  ): Promise<ExecutionAccepted> {
    return this.execute(
      CONTRACT_CALL_PATH,
      canonicalContractCallBody(req),
      options
    );
  }

  async getStatus(executionId: string): Promise<ExecutionState> {
    const path = `/api/execute/${encodeURIComponent(executionId)}/status`;
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const res = await this.request('GET', path, { attempt });
      const json = await this.json(res);
      if (res.ok) {
        const state = parseState(json, res);
        this.emit({ type: 'status', state });
        return state;
      }
      const error = this.mapError(res, json);
      if (
        attempt < this.maxAttempts &&
        (error instanceof RateLimited || res.status >= 500)
      ) {
        await this.backoff(
          error instanceof RateLimited
            ? error.retryAfterSeconds * 1000
            : 500 * attempt,
          'status retry'
        );
        continue;
      }
      throw error;
    }
  }

  /** Poll until KeeperHub reports a terminal state or the wait budget is spent. */
  async waitForTerminal(
    executionId: string,
    options: WaitOptions = {}
  ): Promise<ExecutionState> {
    const maxWaitMs = options.maxWaitMs ?? 180_000;
    const minIntervalMs = options.minIntervalMs ?? 500;
    const maxIntervalMs = options.maxIntervalMs ?? 10_000;
    const started = this.now();
    let state =
      options.initial && options.initial.executionId === executionId
        ? options.initial
        : undefined;
    if (state?.terminal) {
      return state;
    }
    for (;;) {
      if (state) {
        const hintMs =
          state.pollIntervalHint === null
            ? 2000
            : state.pollIntervalHint * 1000;
        const waitMs = Math.min(maxIntervalMs, Math.max(minIntervalMs, hintMs));
        const elapsed = this.now() - started;
        if (elapsed + waitMs > maxWaitMs) {
          throw new ExecutionUnconfirmed(state, elapsed);
        }
        await this.backoff(waitMs, `poll ${state.status}`);
      }
      state = await this.getStatus(executionId);
      if (state.terminal) {
        return state;
      }
    }
  }

  /** simulate → execute → wait → assert verified. The only way to get a VerifiedExecution. */
  async transferAndVerify(
    req: TransferRequest,
    options: VerifyOptions = {}
  ): Promise<VerifiedExecution> {
    const body = canonicalTransferBody(req);
    const idempotencyKey =
      options.idempotencyKey ??
      (await deriveTransferKey({
        taskId: requireTaskId(options),
        chainId: body.chainId,
        recipientAddress: body.recipientAddress,
        amount: body.amount,
        tokenAddress: body.tokenAddress,
      }));
    if (!options.skipSimulation) {
      await this.simulate(TRANSFER_PATH, body);
    }
    const accepted = await this.execute(TRANSFER_PATH, body, {
      idempotencyKey,
    });
    return this.verify(accepted, options);
  }

  async contractCallAndVerify(
    req: ContractCallRequest,
    options: VerifyOptions = {}
  ): Promise<VerifiedExecution> {
    const body = canonicalContractCallBody(req);
    const idempotencyKey =
      options.idempotencyKey ??
      (await deriveContractCallKey({
        taskId: requireTaskId(options),
        chainId: body.chainId,
        contractAddress: body.contractAddress,
        functionName: body.functionName,
        functionArgs: body.functionArgs,
        value: body.value,
      }));
    if (!options.skipSimulation) {
      await this.simulate(CONTRACT_CALL_PATH, body);
    }
    const accepted = await this.execute(CONTRACT_CALL_PATH, body, {
      idempotencyKey,
    });
    return this.verify(accepted, options);
  }

  /** Turn an accepted broadcast into proof, or throw with the exact reason it is not proof. */
  async verify(
    accepted: ExecutionAccepted,
    options: WaitOptions = {}
  ): Promise<VerifiedExecution> {
    const state = await this.waitForTerminal(accepted.executionId, options);
    const verified = assertVerified(state, accepted.idempotentReplay);
    this.emit({ type: 'verified', execution: verified });
    return verified;
  }

  /** GET /api/workflows: every workflow of the organization (bare array). */
  async listWorkflows(): Promise<WorkflowSummary[]> {
    const res = await this.request('GET', '/api/workflows');
    const json = await this.json(res);
    if (!res.ok) {
      throw this.mapError(res, json);
    }
    return (Array.isArray(json) ? json : []).map(parseWorkflowSummary);
  }

  /** POST /api/workflows/create: an agent-authored workflow (Schedule/Webhook/Event trigger plus actions). */
  async createWorkflow(
    definition: WorkflowDefinition
  ): Promise<WorkflowSummary> {
    const res = await this.request('POST', '/api/workflows/create', {
      body: definition,
    });
    const json = await this.json(res);
    if (!res.ok) {
      throw this.mapError(res, json);
    }
    const summary = parseWorkflowSummary(json);
    if (!summary.id) {
      throw new KeeperHubError('KeeperHub created a workflow without an id', {
        status: res.status,
        body: json,
      });
    }
    return summary;
  }

  /** POST /api/workflows/{id}/execute: returns immediately with the execution id. */
  async executeWorkflow(
    workflowId: string,
    input: Record<string, unknown> = {}
  ): Promise<{ executionId: string; status: string }> {
    const res = await this.request(
      'POST',
      `/api/workflows/${encodeURIComponent(workflowId)}/execute`,
      { body: { input } }
    );
    const json = await this.json(res);
    if (!res.ok) {
      throw this.mapError(res, json);
    }
    const record = asRecord(json);
    if (typeof record.executionId !== 'string') {
      throw new KeeperHubError(
        'KeeperHub started a workflow run without an executionId',
        { status: res.status, body: json }
      );
    }
    return {
      executionId: record.executionId,
      status: typeof record.status === 'string' ? record.status : 'running',
    };
  }

  /**
   * GET /api/workflows/executions/{id}/wait: server-side long poll (timeoutMs capped at 60 s).
   * Loops until `completed` or the deadline. A run that ends in anything but "success" is returned, not thrown.
   */
  async waitForWorkflowExecution(
    executionId: string,
    options: {
      deadlineMs?: number | undefined;
      timeoutMs?: number | undefined;
    } = {}
  ): Promise<WorkflowExecutionResult> {
    const deadlineMs = options.deadlineMs ?? 10 * 60_000;
    const timeoutMs = Math.min(
      60_000,
      Math.max(1000, options.timeoutMs ?? 55_000)
    );
    const started = this.now();
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const res = await this.request(
        'GET',
        `/api/workflows/executions/${encodeURIComponent(executionId)}/wait?timeoutMs=${timeoutMs}`,
        { attempt }
      );
      const json = await this.json(res);
      if (!res.ok) {
        const error = this.mapError(res, json);
        if (
          attempt < this.maxAttempts &&
          (error instanceof RateLimited || res.status >= 500)
        ) {
          await this.backoff(
            error instanceof RateLimited
              ? error.retryAfterSeconds * 1000
              : 500 * attempt,
            'workflow wait retry'
          );
          continue;
        }
        throw error;
      }
      const result = parseWorkflowExecution(json, executionId);
      if (result.completed) {
        return result;
      }
      if (this.now() - started >= deadlineMs) {
        return result;
      }
    }
  }

  private async simulate(
    path: string,
    body: object
  ): Promise<SimulationResult> {
    const res = await this.request('POST', path, {
      body: { ...body, simulate: true },
    });
    const json = await this.json(res);
    const record = asRecord(json);
    if (res.status === 400 && record.wouldRevert === true) {
      const result = parseSimulation(record);
      throw new PreflightFailed(describePreflight(result), result, {
        status: res.status,
        code: typeof record.code === 'string' ? record.code : undefined,
        body: json,
        requestId: res.headers.get('x-request-id') ?? undefined,
      });
    }
    if (!res.ok) {
      throw this.mapError(res, json);
    }
    const result = parseSimulation(record);
    if (!result.success || result.wouldRevert) {
      throw new PreflightFailed(describePreflight(result), result, {
        status: res.status,
        code: result.code,
        body: json,
      });
    }
    this.emit({ type: 'simulated', path, result });
    return result;
  }

  private async execute(
    path: string,
    body: object,
    options: ExecuteOptions
  ): Promise<ExecutionAccepted> {
    if (!options.idempotencyKey || !options.idempotencyKey.trim()) {
      throw new Error(
        'KeeperHubClient: idempotencyKey is required for a broadcast'
      );
    }
    const key = options.idempotencyKey.trim();
    const started = this.now();
    let attempt = 0;
    let transientFailures = 0;
    for (;;) {
      attempt += 1;
      let res: Response;
      try {
        res = await this.request('POST', path, {
          body,
          idempotencyKey: key,
          attempt,
        });
      } catch (networkError) {
        transientFailures += 1;
        if (transientFailures >= this.maxAttempts) {
          throw networkError;
        }
        await this.backoff(500 * transientFailures, 'network retry (same key)');
        continue;
      }
      const json = await this.json(res);
      if (res.ok) {
        const execution = parseAccepted(json);
        this.emit({ type: 'accepted', path, execution });
        return execution;
      }
      const error = this.mapError(res, json);
      if (error instanceof IdempotencyInProgress) {
        const waited = this.now() - started;
        const retryAfter = retryAfterMs(res) ?? Math.min(5000, 1000 * attempt);
        if (waited + retryAfter > this.inProgressMaxWaitMs) {
          throw error;
        }
        await this.backoff(retryAfter, 'idempotency in progress (same key)');
        continue;
      }
      if (error instanceof RateLimited || res.status >= 500) {
        transientFailures += 1;
        if (transientFailures >= this.maxAttempts) {
          throw error;
        }
        const waitMs =
          error instanceof RateLimited
            ? error.retryAfterSeconds * 1000
            : 500 * transientFailures;
        await this.backoff(waitMs, `${res.status} retry (same key)`);
        continue;
      }
      throw error;
    }
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; idempotencyKey?: string; attempt?: number } = {}
  ): Promise<Response> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      accept: 'application/json',
    };
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (options.idempotencyKey) {
      headers['idempotency-key'] = options.idempotencyKey;
    }
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }
    const attempt = options.attempt ?? 1;
    this.emit(
      options.idempotencyKey
        ? {
            type: 'request',
            method,
            path,
            attempt,
            idempotencyKey: options.idempotencyKey,
          }
        : { type: 'request', method, path, attempt }
    );
    const started = this.now();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    const requestId = res.headers.get('x-request-id');
    this.emit(
      requestId
        ? {
            type: 'response',
            method,
            path,
            status: res.status,
            ms: this.now() - started,
            requestId,
          }
        : {
            type: 'response',
            method,
            path,
            status: res.status,
            ms: this.now() - started,
          }
    );
    return res;
  }

  private async json(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { error: 'non_json_response', detail: text.slice(0, 500) };
    }
  }

  private mapError(res: Response, json: unknown): KeeperHubError {
    const record = asRecord(json);
    const code =
      typeof record.code === 'string'
        ? record.code
        : typeof record.error === 'string'
          ? record.error
          : undefined;
    const detail =
      typeof record.detail === 'string'
        ? record.detail
        : typeof record.error === 'string'
          ? record.error
          : typeof record.message === 'string'
            ? record.message
            : `HTTP ${res.status}`;
    const requestId =
      res.headers.get('x-request-id') ??
      (typeof record.request_id === 'string' ? record.request_id : undefined);
    const base = { status: res.status, code, body: json, requestId };
    if (res.status === 401) {
      return new AuthError(`KeeperHub rejected the API key: ${detail}`, base);
    }
    if (res.status === 409 && code === 'idempotency_in_progress') {
      return new IdempotencyInProgress(detail, base);
    }
    if (res.status === 409 && code === 'idempotency_conflict') {
      const original =
        typeof record.originalExecutionId === 'string'
          ? record.originalExecutionId
          : null;
      return new IdempotencyConflict(detail, original, base);
    }
    if (res.status === 429) {
      return new RateLimited(detail, (retryAfterMs(res) ?? 1000) / 1000, base);
    }
    if (res.status === 403 && /spending cap/i.test(detail)) {
      return new SpendingCapExceeded(detail, base);
    }
    return new KeeperHubError(`KeeperHub ${res.status}: ${detail}`, {
      ...base,
      retryable: res.status >= 500,
    });
  }

  private async backoff(ms: number, reason: string): Promise<void> {
    this.emit({ type: 'waiting', reason, ms });
    await this.sleep(ms);
  }

  private emit(event: ClientEvent): void {
    this.onEvent?.(event);
  }
}

function requireTaskId(options: VerifyOptions): string {
  if (!options.taskId || !options.taskId.trim()) {
    throw new Error(
      'KeeperHubClient: pass idempotencyKey or a stable taskId so a retry cannot pay twice'
    );
  }
  return options.taskId;
}

function retryAfterMs(res: Response): number | undefined {
  const header = res.headers.get('retry-after');
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseSimulation(record: Record<string, unknown>): SimulationResult {
  const result: SimulationResult = {
    success: record.success === true,
    wouldRevert: record.wouldRevert === true,
    raw: record,
  };
  for (const field of [
    'status',
    'from',
    'to',
    'value',
    'gasEstimate',
    'code',
    'failureKind',
    'revertReason',
  ] as const) {
    const v = record[field];
    if (typeof v === 'string') {
      result[field] = v;
    }
  }
  return result;
}

function describePreflight(result: SimulationResult): string {
  const parts = ['KeeperHub dry run refused to broadcast'];
  if (result.code) {
    parts.push(`code=${result.code}`);
  }
  if (result.failureKind) {
    parts.push(`failureKind=${result.failureKind}`);
  }
  if (result.revertReason) {
    parts.push(`reason=${result.revertReason}`);
  }
  return parts.join(' ');
}

function parseAccepted(json: unknown): ExecutionAccepted {
  const record = asRecord(json);
  if (typeof record.executionId !== 'string') {
    throw new KeeperHubError(
      'KeeperHub accepted the request without an executionId',
      { status: 202, body: json }
    );
  }
  const accepted: ExecutionAccepted = {
    executionId: record.executionId,
    status: typeof record.status === 'string' ? record.status : 'unknown',
    idempotentReplay: record.idempotentReplay === true,
    raw: record,
  };
  if (typeof record.transactionHash === 'string') {
    accepted.transactionHash = record.transactionHash;
  }
  if (typeof record.transactionLink === 'string') {
    accepted.transactionLink = record.transactionLink;
  }
  return accepted;
}

export function parseState(
  json: unknown,
  res?: Pick<Response, 'headers'>
): ExecutionState {
  const record = asRecord(json);
  const hintHeader = res?.headers.get('x-poll-interval-hint') ?? null;
  const hint =
    hintHeader === null || hintHeader === '' ? null : Number(hintHeader);
  const pollIntervalHint =
    hint === null || !Number.isFinite(hint) ? null : hint;
  const status = typeof record.status === 'string' ? record.status : 'unknown';
  const receipts = Array.isArray(record.receipts)
    ? record.receipts.map(parseReceipt)
    : [];
  const state: ExecutionState = {
    executionId:
      typeof record.executionId === 'string' ? record.executionId : '',
    status,
    sponsored: record.sponsored === true,
    receipts,
    pollIntervalHint,
    terminal:
      pollIntervalHint === null
        ? TERMINAL_STATUSES.has(status)
        : pollIntervalHint === 0,
    raw: record,
  };
  for (const field of [
    'type',
    'network',
    'transactionHash',
    'transactionLink',
    'gasUsedWei',
    'gasPriceWei',
    'createdAt',
  ] as const) {
    const v = record[field];
    if (typeof v === 'string') {
      state[field] = v;
    }
  }
  if (typeof record.error === 'string' || record.error === null) {
    state.error = record.error;
  }
  if (typeof record.completedAt === 'string' || record.completedAt === null) {
    state.completedAt = record.completedAt;
  }
  return state;
}

function parseWorkflowSummary(json: unknown): WorkflowSummary {
  const record = asRecord(json);
  const summary: WorkflowSummary = {
    id: typeof record.id === 'string' ? record.id : '',
    name: typeof record.name === 'string' ? record.name : '',
    raw: record,
  };
  if (typeof record.description === 'string')
    summary.description = record.description;
  if (typeof record.enabled === 'boolean') summary.enabled = record.enabled;
  if (typeof record.visibility === 'string')
    summary.visibility = record.visibility;
  if (typeof record.createdAt === 'string')
    summary.createdAt = record.createdAt;
  if (typeof record.updatedAt === 'string')
    summary.updatedAt = record.updatedAt;
  return summary;
}

function parseWorkflowExecution(
  json: unknown,
  executionId: string
): WorkflowExecutionResult {
  const record = asRecord(json);
  const hashes = Array.isArray(record.transactionHashes)
    ? record.transactionHashes
    : [];
  return {
    executionId:
      typeof record.executionId === 'string' ? record.executionId : executionId,
    status: typeof record.status === 'string' ? record.status : 'unknown',
    completed: record.completed === true,
    transactionHashes: hashes.map((h): WorkflowTransactionHash => {
      if (typeof h === 'string') {
        return { hash: h, raw: { hash: h } };
      }
      const r = asRecord(h);
      const parsed: WorkflowTransactionHash = {
        hash:
          typeof r.hash === 'string'
            ? r.hash
            : typeof r.transactionHash === 'string'
              ? r.transactionHash
              : '',
        raw: r,
      };
      if (typeof r.chainId === 'number') parsed.chainId = r.chainId;
      if (typeof r.receiptStatus === 'string')
        parsed.receiptStatus = r.receiptStatus;
      if (typeof r.verified === 'boolean') parsed.verified = r.verified;
      if (typeof r.link === 'string') parsed.link = r.link;
      else if (typeof r.transactionLink === 'string')
        parsed.link = r.transactionLink;
      return parsed;
    }),
    output: record.output ?? null,
    error: typeof record.error === 'string' ? record.error : null,
    gasUsedWei:
      typeof record.gasUsedWei === 'string' ? record.gasUsedWei : null,
    completedAt:
      typeof record.completedAt === 'string' ? record.completedAt : null,
    raw: record,
  };
}

function parseReceipt(value: unknown): Receipt {
  const r = asRecord(value);
  const receipt: Receipt = {
    hash: typeof r.hash === 'string' ? r.hash : '',
    verified: r.verified === true,
    receiptStatus:
      typeof r.receiptStatus === 'string' ? r.receiptStatus : 'unknown',
  };
  if (typeof r.chainId === 'number') {
    receipt.chainId = r.chainId;
  }
  if (typeof r.blockNumber === 'number') {
    receipt.blockNumber = r.blockNumber;
  }
  if (typeof r.gasUsed === 'string') {
    receipt.gasUsed = r.gasUsed;
  }
  if (typeof r.verifiedAt === 'string') {
    receipt.verifiedAt = r.verifiedAt;
  }
  return receipt;
}

/** The single place that decides what "landed" means. */
export function assertVerified(
  state: ExecutionState,
  replayed = false
): VerifiedExecution {
  if (state.status === 'failed') {
    throw new ExecutionFailed('failed', state);
  }
  if (state.status !== 'completed') {
    throw new ExecutionFailed('unexpected_status', state);
  }
  if (state.receipts.length === 0) {
    throw new ExecutionFailed('no_receipt', state);
  }
  for (const receipt of state.receipts) {
    if (!receipt.verified) {
      throw new ExecutionFailed('unverified_receipt', state);
    }
    if (receipt.receiptStatus !== 'success') {
      throw new ExecutionFailed('receipt_not_success', state);
    }
  }
  const receipt =
    state.receipts.find(r => r.hash === state.transactionHash) ??
    state.receipts[0]!;
  const verified: VerifiedExecution = {
    executionId: state.executionId,
    transactionHash: state.transactionHash ?? receipt.hash,
    receipt,
    sponsored: state.sponsored,
    replayed,
    state,
  };
  if (state.transactionLink) {
    verified.transactionLink = state.transactionLink;
  }
  return verified;
}
