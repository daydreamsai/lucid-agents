/**
 * In-memory KeeperHub that behaves like the documented direct-execution API:
 * auth, simulate, idempotency replay / conflict / in-progress, 429, 5xx,
 * status progression with X-Poll-Interval-Hint, receipts.
 */
import { sha256Hex } from './idempotency';
import type { ExecutionStatus, FetchLike, ReceiptStatus } from './types';

export interface MockCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockOptions {
  apiKey?: string;
  /** Answer for dry runs. Default: success. Return `{ wouldRevert: true, code }` to fail the preflight. */
  simulate?: (
    body: Record<string, unknown>
  ) => Record<string, unknown> | undefined;
  /** Address reported by GET /api/user. */
  walletAddress?: string;
  /** Status the 202 body carries. Default "completed". */
  executeStatus?: ExecutionStatus;
  /** Statuses returned by successive status polls; the last one repeats. Default [executeStatus]. */
  statusScript?: ExecutionStatus[];
  /** Receipt status once the execution has a hash. Default "success". */
  receiptStatus?: ReceiptStatus;
  /** Receipt `verified` flag. Default true. */
  receiptVerified?: boolean;
  /** Number of broadcast attempts answered with 409 idempotency_in_progress before accepting. */
  inProgressAttempts?: number;
  /** Number of broadcast attempts answered with 429 before accepting. */
  rateLimitAttempts?: number;
  /** Number of broadcast attempts answered with 500 before accepting. */
  serverErrorAttempts?: number;
  /** Number of status polls answered with 500 before answering normally. */
  statusServerErrors?: number;
  /** Poll hint (seconds) for non-terminal states. Default 2. Set to null to omit the header. */
  nonTerminalHint?: number | null;
  /** Omit the hint header on terminal states too (older server). */
  omitTerminalHint?: boolean;
  /** Broadcast without a transaction hash (e.g. failed before submission). */
  withoutHash?: boolean;
  sponsored?: boolean;
  /** Terminal status of workflow runs. Default "success". */
  workflowRunStatus?: 'success' | 'error' | 'system_error' | 'cancelled';
  /** Number of /wait calls that answer `completed: false` before the terminal answer. */
  workflowWaitIncomplete?: number;
}

interface StoredWorkflow extends Record<string, unknown> {
  id: string;
  name: string;
}

interface StoredWorkflowRun {
  executionId: string;
  workflowId: string;
  waits: number;
}

interface StoredExecution {
  id: string;
  path: string;
  status: ExecutionStatus;
  hash: string | undefined;
  polls: number;
  statusErrorsLeft: number;
}

interface IdempotencyRecord {
  bodyHash: string;
  execution: StoredExecution | undefined;
  inProgressLeft: number;
}

export function createMockKeeperHub(options: MockOptions = {}) {
  const apiKey = options.apiKey ?? 'kh_test';
  const calls: MockCall[] = [];
  const executions = new Map<string, StoredExecution>();
  const idempotency = new Map<string, IdempotencyRecord>();
  const workflows = new Map<string, StoredWorkflow>();
  const workflowRuns = new Map<string, StoredWorkflowRun>();
  let counter = 0;
  let rateLimitLeft = options.rateLimitAttempts ?? 0;
  let serverErrorsLeft = options.serverErrorAttempts ?? 0;

  const json = (
    status: number,
    body: unknown,
    headers: Record<string, string> = {}
  ): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
        'x-request-id': `req_${++counter}`,
        ...headers,
      },
    });

  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(
      (init?.headers as Record<string, string>) ?? {}
    )) {
      headers[k.toLowerCase()] = v;
    }
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as unknown)
        : undefined;
    calls.push({ method, path: url.pathname, headers, body });

    if (headers.authorization !== `Bearer ${apiKey}`) {
      return json(401, {
        error: 'unauthorized',
        detail: 'Missing or invalid authentication',
      });
    }
    if (method === 'GET' && url.pathname === '/api/keys') {
      return json(200, []);
    }
    if (method === 'GET' && url.pathname === '/api/workflows') {
      return json(200, [...workflows.values()]);
    }
    if (method === 'POST' && url.pathname === '/api/workflows/create') {
      const def = (body ?? {}) as Record<string, unknown>;
      if (
        typeof def.name !== 'string' ||
        !Array.isArray(def.nodes) ||
        !Array.isArray(def.edges)
      ) {
        return json(400, {
          error: 'invalid_input',
          detail: 'name, nodes and edges are required',
        });
      }
      const workflow: StoredWorkflow = {
        ...def,
        id: `wf_${workflows.size + 1}`,
        name: def.name,
        visibility: 'private',
        enabled: def.enabled ?? true,
        createdAt: '2026-09-06T10:00:00Z',
        updatedAt: '2026-09-06T10:00:00Z',
      };
      workflows.set(workflow.id, workflow);
      return json(201, workflow);
    }
    const executeMatch = /^\/api\/workflows\/([^/]+)\/execute$/.exec(
      url.pathname
    );
    if (method === 'POST' && executeMatch) {
      const workflowId = decodeURIComponent(executeMatch[1]!);
      if (!workflows.has(workflowId)) {
        return json(404, { error: 'not_found', detail: 'Workflow not found' });
      }
      const run: StoredWorkflowRun = {
        executionId: `exec_${workflowRuns.size + 1}`,
        workflowId,
        waits: 0,
      };
      workflowRuns.set(run.executionId, run);
      return json(200, { executionId: run.executionId, status: 'running' });
    }
    const waitMatch = /^\/api\/workflows\/executions\/([^/]+)\/wait$/.exec(
      url.pathname
    );
    if (method === 'GET' && waitMatch) {
      const run = workflowRuns.get(decodeURIComponent(waitMatch[1]!));
      if (!run) {
        return json(404, { error: 'not_found', detail: 'Execution not found' });
      }
      run.waits += 1;
      if (run.waits <= (options.workflowWaitIncomplete ?? 0)) {
        return json(200, {
          executionId: run.executionId,
          status: 'running',
          completed: false,
        });
      }
      const status = options.workflowRunStatus ?? 'success';
      const hash = `0x${run.executionId.replace(/\D/g, '').padStart(64, 'b')}`;
      return json(200, {
        executionId: run.executionId,
        status,
        completed: true,
        transactionHashes:
          status === 'success'
            ? [
                {
                  hash,
                  chainId: 84532,
                  receiptStatus: 'success',
                  verified: true,
                },
              ]
            : [],
        output: null,
        error: status === 'success' ? null : `workflow ${status}`,
        gasUsedWei: null,
        completedAt: '2026-09-06T10:00:20Z',
      });
    }
    if (method === 'GET' && url.pathname === '/api/user') {
      return json(200, {
        id: 'user_mock',
        email: 'mock@wallet.keeperhub.com',
        providerId: 'siwe',
        walletAddress:
          options.walletAddress ?? '0x1111111111111111111111111111111111111111',
      });
    }
    if (method === 'GET' && url.pathname === '/api/chains') {
      return json(200, [
        {
          chainId: 84532,
          name: 'Base Sepolia',
          isTestnet: true,
          isEnabled: true,
        },
      ]);
    }
    const statusMatch = /^\/api\/execute\/([^/]+)\/status$/.exec(url.pathname);
    if (method === 'GET' && statusMatch) {
      const execution = executions.get(decodeURIComponent(statusMatch[1]!));
      if (!execution) {
        return json(404, { error: 'not_found', detail: 'Execution not found' });
      }
      if (execution.statusErrorsLeft > 0) {
        execution.statusErrorsLeft -= 1;
        return json(500, { error: 'internal_error', detail: 'boom' });
      }
      const script = options.statusScript ?? [execution.status];
      const status =
        script[Math.min(execution.polls, script.length - 1)] ??
        execution.status;
      execution.polls += 1;
      const terminal = status === 'completed' || status === 'failed';
      const hintHeaders: Record<string, string> = {};
      if (terminal) {
        if (!options.omitTerminalHint) {
          hintHeaders['x-poll-interval-hint'] = '0';
        }
      } else if (options.nonTerminalHint !== null) {
        hintHeaders['x-poll-interval-hint'] = String(
          options.nonTerminalHint ?? 2
        );
      }
      const receipts =
        terminal && execution.hash
          ? [
              {
                hash: execution.hash,
                chainId: 84532,
                verified: options.receiptVerified ?? true,
                receiptStatus:
                  options.receiptStatus ??
                  (status === 'failed' ? 'reverted' : 'success'),
                blockNumber: 31_000_000,
                gasUsed: '68115',
                verifiedAt: '2026-09-06T10:00:15Z',
              },
            ]
          : [];
      return json(
        200,
        {
          executionId: execution.id,
          status,
          type: execution.path.endsWith('transfer')
            ? 'transfer'
            : 'contract-call',
          network: '84532',
          transactionHash: execution.hash,
          transactionLink: execution.hash
            ? `https://sepolia.basescan.org/tx/${execution.hash}`
            : undefined,
          sponsored: options.sponsored ?? true,
          retryCount: 0,
          receipts,
          gasUsedWei: '21000000000000',
          gasPriceWei: '1163827869',
          estimatedCostUsd: null,
          result: null,
          error:
            status === 'failed' ? 'Contract call failed: Error(revert)' : null,
          createdAt: '2026-09-06T10:00:00Z',
          completedAt: terminal ? '2026-09-06T10:00:15Z' : null,
        },
        hintHeaders
      );
    }
    if (
      method === 'POST' &&
      (url.pathname === '/api/execute/transfer' ||
        url.pathname === '/api/execute/contract-call')
    ) {
      const record = (body ?? {}) as Record<string, unknown>;
      if ('simulate' in record) {
        if (record.simulate !== true) {
          return json(400, {
            error: 'invalid_input',
            detail: 'simulate must be the JSON boolean true',
          });
        }
        const answer = options.simulate?.(record) ?? {
          success: true,
          status: 'simulated',
          from: '0x1111111111111111111111111111111111111111',
          to: record.recipientAddress ?? record.contractAddress,
          value: record.amount ?? '0',
          gasEstimate: '68115',
          wouldRevert: false,
        };
        if (answer.wouldRevert === true) {
          return json(400, { success: false, status: 'simulated', ...answer });
        }
        return json(200, answer);
      }
      const key = headers['idempotency-key'];
      const bodyHash = await sha256Hex(JSON.stringify(sortKeys(record)));
      const scope = `${url.pathname}:${key ?? ''}`;
      if (key) {
        const existing = idempotency.get(scope);
        if (existing) {
          if (existing.bodyHash !== bodyHash) {
            return json(409, {
              error: 'Idempotency-Key reused with a different request body',
              code: 'idempotency_conflict',
              retryable: false,
              originalExecutionId: existing.execution?.id ?? null,
            });
          }
          if (existing.inProgressLeft > 0) {
            existing.inProgressLeft -= 1;
            return json(409, {
              error:
                'A request with this Idempotency-Key is already being processed. Retry the same key shortly; do not rotate it.',
              code: 'idempotency_in_progress',
              retryable: true,
            });
          }
          if (existing.execution) {
            return json(202, {
              ...acceptedBody(existing.execution),
              idempotentReplay: true,
            });
          }
        }
      }
      if (serverErrorsLeft > 0) {
        serverErrorsLeft -= 1;
        return json(500, {
          error: 'internal_error',
          detail: 'upstream hiccup',
        });
      }
      if (rateLimitLeft > 0) {
        rateLimitLeft -= 1;
        return json(
          429,
          { error: 'rate_limited', detail: 'Too many requests' },
          { 'retry-after': '1' }
        );
      }
      if (
        key &&
        (options.inProgressAttempts ?? 0) > 0 &&
        !idempotency.has(scope)
      ) {
        idempotency.set(scope, {
          bodyHash,
          execution: undefined,
          inProgressLeft: (options.inProgressAttempts ?? 0) - 1,
        });
        // First attempt is also "in progress": the work started, the answer is not ready.
        return json(409, {
          error:
            'A request with this Idempotency-Key is already being processed. Retry the same key shortly; do not rotate it.',
          code: 'idempotency_in_progress',
          retryable: true,
        });
      }
      const execution: StoredExecution = {
        id: `direct_${executions.size + 1}`,
        path: url.pathname,
        status: options.executeStatus ?? 'completed',
        hash: options.withoutHash
          ? undefined
          : `0x${(executions.size + 1).toString(16).padStart(64, 'a')}`,
        polls: 0,
        statusErrorsLeft: options.statusServerErrors ?? 0,
      };
      executions.set(execution.id, execution);
      if (key) {
        const existing = idempotency.get(scope);
        idempotency.set(scope, {
          bodyHash,
          execution,
          inProgressLeft: existing?.inProgressLeft ?? 0,
        });
      }
      return json(202, acceptedBody(execution));
    }
    return json(404, {
      error: 'not_found',
      detail: `No route ${method} ${url.pathname}`,
    });
  };

  return {
    fetch: fetchImpl,
    calls,
    executions,
    idempotency,
    workflows,
    workflowRuns,
  };
}

function acceptedBody(execution: StoredExecution): Record<string, unknown> {
  const body: Record<string, unknown> = {
    executionId: execution.id,
    status: execution.status,
  };
  if (execution.hash && execution.status !== 'failed') {
    body.transactionHash = execution.hash;
    body.transactionLink = `https://sepolia.basescan.org/tx/${execution.hash}`;
  }
  return body;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)])
    );
  }
  return value;
}

/** Virtual clock: sleeps resolve immediately and advance `now`, so wait budgets are testable. */
export function virtualClock(start = 1_700_000_000_000) {
  let now = start;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    sleeps,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
