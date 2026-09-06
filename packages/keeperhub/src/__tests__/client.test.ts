import { describe, expect, it } from 'bun:test';

import { KeeperHubClient } from '../client/client';
import {
  AuthError,
  ExecutionFailed,
  ExecutionUnconfirmed,
  IdempotencyConflict,
  IdempotencyInProgress,
  KeeperHubError,
  PreflightFailed,
} from '../client/errors';
import {
  createMockKeeperHub,
  type MockOptions,
  virtualClock,
} from '../client/mock';
import type { ClientEvent } from '../client/types';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const RECIPIENT = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const transfer = {
  chainId: 'base-sepolia',
  recipientAddress: RECIPIENT,
  amount: '0.01',
  tokenAddress: USDC,
};

function setup(
  mockOptions: MockOptions = {},
  clientOptions: {
    apiKey?: string;
    maxAttempts?: number;
    inProgressMaxWaitMs?: number;
  } = {}
) {
  const mock = createMockKeeperHub(mockOptions);
  const clock = virtualClock();
  const events: ClientEvent[] = [];
  const client = new KeeperHubClient({
    apiKey: clientOptions.apiKey ?? 'kh_test',
    baseUrl: 'https://keeperhub.test/',
    fetch: mock.fetch,
    sleep: clock.sleep,
    now: clock.now,
    onEvent: e => events.push(e),
    maxAttempts: clientOptions.maxAttempts,
    inProgressMaxWaitMs: clientOptions.inProgressMaxWaitMs,
  });
  return { mock, clock, events, client };
}

const broadcasts = (mock: ReturnType<typeof createMockKeeperHub>) =>
  mock.calls.filter(
    c => c.method === 'POST' && !(c.body as Record<string, unknown>)?.simulate
  );

describe('construction', () => {
  it('refuses an empty key and a webhook-only key', () => {
    expect(() => new KeeperHubClient({ apiKey: ' ' })).toThrow(/apiKey/);
    expect(() => new KeeperHubClient({ apiKey: 'wfb_abc' })).toThrow(/wfb_/);
  });

  it('strips trailing slashes from the base URL', () => {
    expect(
      new KeeperHubClient({ apiKey: 'kh_x', baseUrl: 'https://a.b///' }).baseUrl
    ).toBe('https://a.b');
  });
});

describe('auth and probing', () => {
  it('probe() is true for a valid key', async () => {
    const { client } = setup();
    await expect(client.probe()).resolves.toBe(true);
  });

  it('maps 401 to AuthError', async () => {
    const { client } = setup({}, { apiKey: 'kh_wrong' });
    await expect(client.simulateTransfer(transfer)).rejects.toBeInstanceOf(
      AuthError
    );
  });

  it('lists chains', async () => {
    const { client } = setup();
    const chains = await client.listChains();
    expect(chains).toHaveLength(1);
  });
});

describe('simulate', () => {
  it('sends the JSON boolean true and a canonical body', async () => {
    const { client, mock } = setup();
    const result = await client.simulateTransfer(transfer);
    expect(result.success).toBe(true);
    expect(result.wouldRevert).toBe(false);
    const call = mock.calls[mock.calls.length - 1]!;
    expect(call.body).toEqual({
      chainId: '84532',
      recipientAddress: RECIPIENT.toLowerCase(),
      amount: '0.01',
      tokenAddress: USDC.toLowerCase(),
      simulate: true,
    });
    expect(call.headers.authorization).toBe('Bearer kh_test');
    expect(call.headers['idempotency-key']).toBeUndefined();
  });

  it('turns a 400 wouldRevert into PreflightFailed with the attributed code', async () => {
    const { client, mock } = setup({
      simulate: () => ({
        wouldRevert: true,
        code: 'insufficient_balance',
        failureKind: 'validation',
      }),
    });
    const error = await client
      .simulateTransfer(transfer)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PreflightFailed);
    const preflight = error as PreflightFailed;
    expect(preflight.code).toBe('insufficient_balance');
    expect(preflight.failureKind).toBe('validation');
    expect(preflight.wouldRevert).toBe(true);
    expect(preflight.message).toMatch(/insufficient_balance/);
    expect(broadcasts(mock)).toHaveLength(0);
  });

  it('treats an EVM revert as preflight failure too', async () => {
    const { client } = setup({
      simulate: () => ({
        wouldRevert: true,
        failureKind: 'revert',
        revertReason: 'ERC20: transfer amount exceeds balance',
      }),
    });
    const error = (await client
      .simulateTransfer(transfer)
      .catch((e: unknown) => e)) as PreflightFailed;
    expect(error).toBeInstanceOf(PreflightFailed);
    expect(error.revertReason).toMatch(/exceeds balance/);
  });
});

describe('execute', () => {
  it('requires an idempotency key', async () => {
    const { client } = setup();
    await expect(
      client.executeTransfer(transfer, { idempotencyKey: '' })
    ).rejects.toThrow(/idempotencyKey/);
  });

  it('broadcasts with the Idempotency-Key header and returns the execution id', async () => {
    const { client, mock } = setup();
    const accepted = await client.executeTransfer(transfer, {
      idempotencyKey: 'abc',
    });
    expect(accepted.executionId).toBe('direct_1');
    expect(accepted.idempotentReplay).toBe(false);
    expect(accepted.transactionHash).toMatch(/^0x/);
    expect(mock.calls[mock.calls.length - 1]!.headers['idempotency-key']).toBe(
      'abc'
    );
  });

  it('replays instead of paying twice when the same key and body are re-sent', async () => {
    const { client, mock } = setup();
    const first = await client.executeTransfer(transfer, {
      idempotencyKey: 'abc',
    });
    const second = await client.executeTransfer(
      { ...transfer, amount: '0.010', chainId: 84532 },
      { idempotencyKey: 'abc' }
    );
    expect(second.executionId).toBe(first.executionId);
    expect(second.idempotentReplay).toBe(true);
    expect(mock.executions.size).toBe(1);
  });

  it('surfaces a conflict with the original execution id and never rotates the key', async () => {
    const { client, mock } = setup();
    await client.executeTransfer(transfer, { idempotencyKey: 'abc' });
    const error = (await client
      .executeTransfer(
        { ...transfer, amount: '0.02' },
        { idempotencyKey: 'abc' }
      )
      .catch((e: unknown) => e)) as IdempotencyConflict;
    expect(error).toBeInstanceOf(IdempotencyConflict);
    expect(error.originalExecutionId).toBe('direct_1');
    expect(error.retryable).toBe(false);
    expect(mock.executions.size).toBe(1);
  });

  it('waits through 409 in_progress under the same key', async () => {
    const { client, mock, clock } = setup({ inProgressAttempts: 3 });
    const accepted = await client.executeTransfer(transfer, {
      idempotencyKey: 'abc',
    });
    expect(accepted.executionId).toBe('direct_1');
    const keys = new Set(
      broadcasts(mock).map(c => c.headers['idempotency-key'])
    );
    expect(keys).toEqual(new Set(['abc']));
    expect(broadcasts(mock)).toHaveLength(4);
    expect(clock.sleeps.length).toBe(3);
  });

  it('gives up on in_progress after the budget without rotating', async () => {
    const { client, mock } = setup(
      { inProgressAttempts: 50 },
      { inProgressMaxWaitMs: 3000 }
    );
    await expect(
      client.executeTransfer(transfer, { idempotencyKey: 'abc' })
    ).rejects.toBeInstanceOf(IdempotencyInProgress);
    expect(mock.executions.size).toBe(0);
  });

  it('honours Retry-After on 429 and retries under the same key', async () => {
    const { client, mock, clock } = setup({ rateLimitAttempts: 1 });
    await client.executeTransfer(transfer, { idempotencyKey: 'abc' });
    expect(clock.sleeps).toEqual([1000]);
    expect(broadcasts(mock)).toHaveLength(2);
  });

  it('retries a 5xx under the same key and stops at maxAttempts', async () => {
    const ok = setup({ serverErrorAttempts: 2 });
    await ok.client.executeTransfer(transfer, { idempotencyKey: 'abc' });
    expect(broadcasts(ok.mock)).toHaveLength(3);

    const exhausted = setup({ serverErrorAttempts: 10 }, { maxAttempts: 3 });
    const error = (await exhausted.client
      .executeTransfer(transfer, { idempotencyKey: 'abc' })
      .catch((e: unknown) => e)) as KeeperHubError;
    expect(error).toBeInstanceOf(KeeperHubError);
    expect(error.status).toBe(500);
    expect(error.retryable).toBe(true);
    expect(broadcasts(exhausted.mock)).toHaveLength(3);
  });

  it('retries a thrown network error under the same key', async () => {
    const mock = createMockKeeperHub();
    let failures = 2;
    const flaky: typeof mock.fetch = async (input, init) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('ECONNRESET');
      }
      return mock.fetch(input, init);
    };
    const clock = virtualClock();
    const client = new KeeperHubClient({
      apiKey: 'kh_test',
      fetch: flaky,
      sleep: clock.sleep,
      now: clock.now,
    });
    const accepted = await client.executeTransfer(transfer, {
      idempotencyKey: 'abc',
    });
    expect(accepted.executionId).toBe('direct_1');
    expect(mock.executions.size).toBe(1);
  });
});

describe('status and waiting', () => {
  it('parses receipts, sponsorship and the poll hint', async () => {
    const { client } = setup({ sponsored: true });
    const accepted = await client.executeTransfer(transfer, {
      idempotencyKey: 'abc',
    });
    const state = await client.getStatus(accepted.executionId);
    expect(state.status).toBe('completed');
    expect(state.terminal).toBe(true);
    expect(state.pollIntervalHint).toBe(0);
    expect(state.sponsored).toBe(true);
    expect(state.receipts[0]).toMatchObject({
      verified: true,
      receiptStatus: 'success',
      blockNumber: 31_000_000,
    });
  });

  it('keeps polling through unconfirmed using the hint as the interval', async () => {
    const { client, clock } = setup({
      executeStatus: 'unconfirmed',
      statusScript: ['unconfirmed', 'unconfirmed', 'completed'],
      nonTerminalHint: 3,
    });
    const accepted = await client.executeTransfer(transfer, {
      idempotencyKey: 'abc',
    });
    const state = await client.waitForTerminal(accepted.executionId, {
      maxWaitMs: 60_000,
    });
    expect(state.status).toBe('completed');
    expect(clock.sleeps).toEqual([3000, 3000]);
  });

  it('decides terminality from the hint, not the status string', async () => {
    const { client } = setup({
      executeStatus: 'settling',
      statusScript: ['settling', 'completed'],
      nonTerminalHint: 1,
    });
    const accepted = await client.executeTransfer(transfer, {
      idempotencyKey: 'abc',
    });
    const first = await client.getStatus(accepted.executionId);
    expect(first.status).toBe('settling');
    expect(first.terminal).toBe(false);
    const done = await client.waitForTerminal(accepted.executionId);
    expect(done.status).toBe('completed');
  });

  it('falls back to documented terminal statuses when the hint header is missing', async () => {
    const { client } = setup({ omitTerminalHint: true, nonTerminalHint: null });
    const accepted = await client.executeTransfer(transfer, {
      idempotencyKey: 'abc',
    });
    const state = await client.getStatus(accepted.executionId);
    expect(state.pollIntervalHint).toBeNull();
    expect(state.terminal).toBe(true);
  });

  it('clamps the interval between min and max', async () => {
    const { client, clock } = setup({
      executeStatus: 'unconfirmed',
      statusScript: ['unconfirmed', 'completed'],
      nonTerminalHint: 600,
    });
    const accepted = await client.executeTransfer(transfer, {
      idempotencyKey: 'abc',
    });
    await client.waitForTerminal(accepted.executionId, { maxIntervalMs: 5000 });
    expect(clock.sleeps).toEqual([5000]);
  });

  it('throws ExecutionUnconfirmed after the budget and never re-sends', async () => {
    const { client, mock } = setup({
      executeStatus: 'unconfirmed',
      statusScript: ['unconfirmed'],
      nonTerminalHint: 2,
    });
    const accepted = await client.executeTransfer(transfer, {
      idempotencyKey: 'abc',
    });
    const error = (await client
      .waitForTerminal(accepted.executionId, { maxWaitMs: 7000 })
      .catch((e: unknown) => e)) as ExecutionUnconfirmed;
    expect(error).toBeInstanceOf(ExecutionUnconfirmed);
    expect(error.state.status).toBe('unconfirmed');
    expect(error.message).toMatch(/do not re-send/);
    expect(broadcasts(mock)).toHaveLength(1);
  });

  it('retries status reads that hit a 5xx', async () => {
    const { client } = setup({ statusServerErrors: 2 });
    const accepted = await client.executeTransfer(transfer, {
      idempotencyKey: 'abc',
    });
    const state = await client.getStatus(accepted.executionId);
    expect(state.status).toBe('completed');
  });

  it('skips the first poll when a terminal initial state is supplied', async () => {
    const { client, mock } = setup();
    const accepted = await client.executeTransfer(transfer, {
      idempotencyKey: 'abc',
    });
    const initial = await client.getStatus(accepted.executionId);
    const before = mock.calls.length;
    await client.waitForTerminal(accepted.executionId, { initial });
    expect(mock.calls.length).toBe(before);
  });
});

describe('agent-authored workflows', () => {
  it("builds a Schedule → transfer-token workflow with KeeperHub's node and config keys", async () => {
    const { scheduledTransferWorkflow, isValidCron } =
      await import('../client/workflows');
    expect(isValidCron('0 9 * * 1')).toBe(true);
    expect(isValidCron('*/30 * * * *')).toBe(true);
    expect(isValidCron('every monday')).toBe(false);
    expect(isValidCron('0 9 * *')).toBe(false);
    const def = scheduledTransferWorkflow({
      name: 'landed:x',
      cron: '0 9 * * 1',
      timezone: 'UTC',
      chainId: 'base-sepolia',
      recipientAddress: RECIPIENT,
      amount: '0.010',
      tokenAddress: USDC,
      enabled: true,
    });
    expect(def.nodes[0]).toEqual({
      id: 'trigger',
      type: 'trigger',
      data: {
        label: 'Schedule',
        config: {
          triggerType: 'Schedule',
          scheduleCron: '0 9 * * 1',
          scheduleTimezone: 'UTC',
        },
      },
    });
    expect(def.nodes[1]?.data.config).toEqual({
      actionType: 'web3/transfer-token',
      network: '84532',
      tokenConfig: USDC.toLowerCase(),
      amount: '0.01',
      recipientAddress: RECIPIENT.toLowerCase(),
      web3Connection: 'default',
    });
    expect(def.edges).toEqual([
      { id: 'trigger->payout', source: 'trigger', target: 'payout' },
    ]);
    const native = scheduledTransferWorkflow({
      name: 'n',
      cron: '0 * * * *',
      chainId: 84532,
      recipientAddress: RECIPIENT,
      amount: '0.001',
    });
    expect(native.nodes[1]?.data.config.actionType).toBe('web3/transfer-funds');
    expect(() =>
      scheduledTransferWorkflow({
        name: 'n',
        cron: 'nope',
        chainId: 84532,
        recipientAddress: RECIPIENT,
        amount: '1',
      })
    ).toThrow(/cron/);
  });

  it('creates, lists, executes and waits for a workflow run', async () => {
    const { scheduledTransferWorkflow } = await import('../client/workflows');
    const { client, mock } = setup({ workflowWaitIncomplete: 2 });
    const created = await client.createWorkflow(
      scheduledTransferWorkflow({
        name: 'landed:a',
        cron: '0 9 * * 1',
        chainId: 84532,
        recipientAddress: RECIPIENT,
        amount: '0.01',
        tokenAddress: USDC,
      })
    );
    expect(created.id).toBe('wf_1');
    expect((await client.listWorkflows()).map(w => w.name)).toEqual([
      'landed:a',
    ]);
    const run = await client.executeWorkflow(created.id);
    expect(run).toEqual({ executionId: 'exec_1', status: 'running' });
    const result = await client.waitForWorkflowExecution(run.executionId, {
      timeoutMs: 5000,
    });
    expect(result.completed).toBe(true);
    expect(result.status).toBe('success');
    expect(result.transactionHashes[0]).toMatchObject({
      chainId: 84532,
      receiptStatus: 'success',
      verified: true,
    });
    expect(mock.calls.filter(c => c.path.endsWith('/wait'))).toHaveLength(3);
    expect(mock.calls.filter(c => c.path.endsWith('/wait'))[0]!.path).toBe(
      '/api/workflows/executions/exec_1/wait'
    );
  });

  it('returns, not throws, a run that ended in error so the caller decides', async () => {
    const { client } = setup({ workflowRunStatus: 'error' });
    const created = await client.createWorkflow({
      name: 'w',
      nodes: [],
      edges: [],
    });
    const run = await client.executeWorkflow(created.id);
    const result = await client.waitForWorkflowExecution(run.executionId);
    expect(result.completed).toBe(true);
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/error/);
    expect(result.transactionHashes).toEqual([]);
  });

  it('stops waiting at the deadline with completed=false', async () => {
    const { client, clock } = setup({ workflowWaitIncomplete: 50 });
    const created = await client.createWorkflow({
      name: 'w',
      nodes: [],
      edges: [],
    });
    const run = await client.executeWorkflow(created.id);
    const pending = client.waitForWorkflowExecution(run.executionId, {
      deadlineMs: 0,
    });
    clock.advance(1);
    const result = await pending;
    expect(result.completed).toBe(false);
    expect(result.status).toBe('running');
  });
});

describe('transferAndVerify (the whole safe sequence)', () => {
  it('simulates, broadcasts under a derived key, waits, and returns proof', async () => {
    const { client, mock, events } = setup({ sponsored: true });
    const proof = await client.transferAndVerify(transfer, {
      taskId: 'invoice-1',
    });
    expect(proof.transactionHash).toMatch(/^0x/);
    expect(proof.transactionLink).toMatch(/basescan/);
    expect(proof.receipt.verified).toBe(true);
    expect(proof.sponsored).toBe(true);
    expect(proof.replayed).toBe(false);
    const posts = mock.calls.filter(c => c.method === 'POST');
    expect(posts).toHaveLength(2);
    expect((posts[0]!.body as Record<string, unknown>).simulate).toBe(true);
    const { simulate: _s, ...simulatedBody } = posts[0]!.body as Record<
      string,
      unknown
    >;
    expect(posts[1]!.body).toEqual(simulatedBody);
    expect(posts[1]!.headers['idempotency-key']).toMatch(/^[0-9a-f]{64}$/);
    expect(events.map(e => e.type)).toEqual(
      expect.arrayContaining([
        'request',
        'response',
        'simulated',
        'accepted',
        'status',
        'verified',
      ])
    );
  });

  it('requires a taskId or an explicit key', async () => {
    const { client } = setup();
    await expect(client.transferAndVerify(transfer)).rejects.toThrow(/taskId/);
  });

  it('does not broadcast when the dry run fails', async () => {
    const { client, mock } = setup({
      simulate: () => ({ wouldRevert: true, code: 'insufficient_balance' }),
    });
    await expect(
      client.transferAndVerify(transfer, { taskId: 't' })
    ).rejects.toBeInstanceOf(PreflightFailed);
    expect(broadcasts(mock)).toHaveLength(0);
    expect(mock.executions.size).toBe(0);
  });

  it('refuses to call a reverted receipt landed', async () => {
    const { client } = setup({
      executeStatus: 'failed',
      receiptStatus: 'reverted',
    });
    const error = (await client
      .transferAndVerify(transfer, { taskId: 't' })
      .catch((e: unknown) => e)) as ExecutionFailed;
    expect(error).toBeInstanceOf(ExecutionFailed);
    expect(error.reason).toBe('failed');
    expect(error.state.receipts[0]?.receiptStatus).toBe('reverted');
  });

  it('refuses a completed status whose receipt is not verified', async () => {
    const { client } = setup({ receiptVerified: false });
    const error = (await client
      .transferAndVerify(transfer, { taskId: 't' })
      .catch((e: unknown) => e)) as ExecutionFailed;
    expect(error).toBeInstanceOf(ExecutionFailed);
    expect(error.reason).toBe('unverified_receipt');
  });

  it('refuses a completed status with no receipt at all', async () => {
    const { client } = setup({ withoutHash: true });
    const error = (await client
      .transferAndVerify(transfer, { taskId: 't' })
      .catch((e: unknown) => e)) as ExecutionFailed;
    expect(error).toBeInstanceOf(ExecutionFailed);
    expect(error.reason).toBe('no_receipt');
  });

  it('reports a replay when the same work is verified twice', async () => {
    const { client, mock } = setup();
    const first = await client.transferAndVerify(transfer, {
      taskId: 'invoice-9',
    });
    const second = await client.transferAndVerify(transfer, {
      taskId: 'invoice-9',
    });
    expect(second.executionId).toBe(first.executionId);
    expect(second.replayed).toBe(true);
    expect(mock.executions.size).toBe(1);
  });

  it('verifies contract calls with the same rules', async () => {
    const { client, mock } = setup();
    const proof = await client.contractCallAndVerify(
      {
        chainId: 84532,
        contractAddress: USDC,
        functionName: 'transfer',
        functionArgs: `["${RECIPIENT}", "10000"]`,
      },
      { taskId: 'call-1' }
    );
    expect(proof.transactionHash).toMatch(/^0x/);
    expect(
      mock.calls.filter(c => c.path === '/api/execute/contract-call')
    ).toHaveLength(2);
  });
});
