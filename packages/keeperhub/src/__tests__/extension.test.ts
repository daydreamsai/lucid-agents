import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { describe, expect, it } from 'bun:test';

import {
  createMockKeeperHub,
  KeeperHubClient,
  type MockOptions,
  virtualClock,
} from '../client';
import {
  type ExecutionPolicy,
  keeperhub,
  KEEPERHUB_EXTENSION_URI,
  keeperhubDryRunEntrypoint,
  keeperhubScheduleEntrypoint,
  keeperhubStatusEntrypoint,
  keeperhubTransferEntrypoint,
  keeperhubWatchEntrypoint,
  LandedError,
} from '../index';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const RECIPIENT = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const ORIGIN = 'http://agent.test';

async function buildAgent(
  mockOptions: MockOptions = {},
  policy?: ExecutionPolicy,
  wait?: { maxWaitMs?: number }
) {
  const mock = createMockKeeperHub(mockOptions);
  const clock = virtualClock();
  const client = new KeeperHubClient({
    apiKey: 'kh_test',
    baseUrl: 'https://keeperhub.test',
    fetch: mock.fetch,
    sleep: clock.sleep,
    now: clock.now,
  });
  const agent = await createAgent({
    name: 'test-payout-agent',
    version: '1.0.0',
    description: 'test',
  })
    .use(
      keeperhub({
        client,
        policy: policy ?? {
          chains: ['base-sepolia'],
          tokens: [USDC],
          maxAmount: '5',
        },
        wait,
      })
    )
    .use(http())
    .build();
  agent.entrypoints.add(
    keeperhubTransferEntrypoint({
      key: 'payout',
      chainId: 'base-sepolia',
      tokenAddress: USDC,
    })
  );
  agent.entrypoints.add(
    keeperhubDryRunEntrypoint({
      key: 'dry-run',
      chainId: 'base-sepolia',
      tokenAddress: USDC,
    })
  );
  agent.entrypoints.add(keeperhubStatusEntrypoint());
  return { agent, mock, clock };
}

type Built = Awaited<ReturnType<typeof buildAgent>>['agent'];

async function invoke(
  agent: Built,
  key: string,
  input: unknown,
  headers: Record<string, string> = {}
) {
  const route = agent.http.routes.find(
    r => r.method.toUpperCase() === 'POST' && r.path.includes('invoke')
  );
  if (!route) {
    throw new Error('invoke route not found');
  }
  const res = await route.handle(
    new Request(`${ORIGIN}/entrypoints/${key}/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ input }),
    }),
    { key }
  );
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep text
  }
  return { status: res.status, body: body as Record<string, unknown>, text };
}

const broadcasts = (mock: ReturnType<typeof createMockKeeperHub>) =>
  mock.calls.filter(
    c => c.method === 'POST' && !(c.body as Record<string, unknown>)?.simulate
  );

describe('keeperhub() extension on a real Lucid runtime', () => {
  it('installs runtime.keeperhub and advertises the capability in the agent card', async () => {
    const { agent } = await buildAgent();
    expect(
      agent.keeperhub.check({
        reference: 'r',
        chainId: 84532,
        recipientAddress: RECIPIENT,
        amount: '1',
        tokenAddress: USDC,
      })
    ).toEqual({ allowed: true });
    const card = agent.manifest.build(ORIGIN);
    const extensions = (card.capabilities?.extensions ?? []) as Array<
      Record<string, unknown>
    >;
    const descriptor = extensions.find(e => e.uri === KEEPERHUB_EXTENSION_URI);
    expect(descriptor).toBeDefined();
    expect(descriptor?.params).toMatchObject({
      executionLayer: 'keeperhub',
      keeperhub: 'https://keeperhub.test',
    });
    expect(card.entrypoints.payout).toBeDefined();
    expect(card.entrypoints['dry-run']).toBeDefined();
  });

  it('refuses to build with an empty chain policy', () => {
    expect(() => keeperhub({ apiKey: 'kh_x', policy: { chains: [] } })).toThrow(
      /policy.chains/
    );
  });

  it('lands a payout: policy → simulate → broadcast → verified receipt → proof', async () => {
    const { agent, mock } = await buildAgent({ sponsored: true });
    const res = await invoke(agent, 'payout', {
      reference: 'inv-1',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    expect(res.status).toBe(200);
    const output = res.body.output as Record<string, unknown>;
    expect(output.transactionHash).toMatch(/^0x/);
    expect(output.transactionLink).toMatch(/basescan/);
    expect(output.sponsored).toBe(true);
    expect(output.replayed).toBe(false);
    expect(output.receipt).toMatchObject({
      verified: true,
      receiptStatus: 'success',
    });
    const stages = (output.timeline as Array<{ stage: string }>).map(
      s => s.stage
    );
    expect(stages).toEqual([
      'received',
      'policy_ok',
      'simulated',
      'broadcast',
      'accepted',
      'landed',
    ]);
    expect(broadcasts(mock)).toHaveLength(1);
    expect(broadcasts(mock)[0]!.headers['idempotency-key']).toBe(
      String(output.idempotencyKey)
    );
    expect(agent.keeperhub.log.get('inv-1')?.outcome).toBe('landed');
  });

  it('denies by policy before touching KeeperHub', async () => {
    const { agent, mock } = await buildAgent();
    const res = await invoke(agent, 'payout', {
      reference: 'inv-big',
      recipientAddress: RECIPIENT,
      amount: '6',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toMatch(/exceeds the agent's maximum/);
    expect(mock.calls).toHaveLength(0);
    expect(agent.keeperhub.log.get('inv-big')?.outcome).toBe('policy_denied');
  });

  it('denies a chain outside the policy', async () => {
    const { agent } = await buildAgent();
    const error = await agent.keeperhub
      .transfer({
        reference: 'x',
        chainId: 'base',
        recipientAddress: RECIPIENT,
        amount: '0.01',
        tokenAddress: USDC,
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LandedError);
    expect((error as LandedError).code).toBe('policy_denied');
    expect((error as LandedError).details.rule).toBe('chain');
  });

  it('denies a token outside the policy', async () => {
    const { agent } = await buildAgent();
    const error = await agent.keeperhub
      .transfer({
        reference: 'x',
        chainId: 84532,
        recipientAddress: RECIPIENT,
        amount: '0.01',
      })
      .catch((e: unknown) => e);
    expect((error as LandedError).details.rule).toBe('token');
  });

  it('does not broadcast when the dry run fails, and says why', async () => {
    const { agent, mock } = await buildAgent({
      simulate: () => ({ wouldRevert: true, code: 'insufficient_balance' }),
    });
    const res = await invoke(agent, 'payout', {
      reference: 'inv-2',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toMatch(/insufficient_balance/);
    expect(broadcasts(mock)).toHaveLength(0);
    const record = agent.keeperhub.log.get('inv-2');
    expect(record?.outcome).toBe('preflight_failed');
    expect(record?.stages.map(s => s.stage)).toEqual([
      'received',
      'policy_ok',
      'preflight_failed',
    ]);
  });

  it('throws (does not return) when the receipt reverted, so payment cannot settle', async () => {
    const { agent } = await buildAgent({
      executeStatus: 'failed',
      receiptStatus: 'reverted',
    });
    const res = await invoke(agent, 'payout', {
      reference: 'inv-3',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const record = agent.keeperhub.log.get('inv-3');
    expect(record?.outcome).toBe('failed');
    expect(record?.transactionHash).toMatch(/^0x/);
    expect(record?.executionId).toBe('direct_1');
  });

  it('reports unconfirmed after the wait budget without re-sending', async () => {
    const { agent, mock } = await buildAgent(
      {
        executeStatus: 'unconfirmed',
        statusScript: ['unconfirmed'],
        nonTerminalHint: 2,
      },
      undefined,
      { maxWaitMs: 5000 }
    );
    const res = await invoke(agent, 'payout', {
      reference: 'inv-4',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toMatch(/same reference/);
    expect(broadcasts(mock)).toHaveLength(1);
    expect(agent.keeperhub.log.get('inv-4')?.outcome).toBe('unconfirmed');
  });

  it('replays the same reference instead of paying twice', async () => {
    const { agent, mock } = await buildAgent();
    const first = await invoke(agent, 'payout', {
      reference: 'inv-5',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    const second = await invoke(agent, 'payout', {
      reference: 'inv-5',
      recipientAddress: RECIPIENT,
      amount: '0.010',
    });
    expect(second.status).toBe(200);
    expect((second.body.output as Record<string, unknown>).executionId).toBe(
      (first.body.output as Record<string, unknown>).executionId
    );
    expect((second.body.output as Record<string, unknown>).replayed).toBe(true);
    expect(mock.executions.size).toBe(1);
    expect(agent.keeperhub.log.get('inv-5')?.attempt).toBe(2);
  });

  it("honours Lucid's own Idempotency-Key so a retried HTTP call never re-runs the handler", async () => {
    const { agent, mock } = await buildAgent();
    // Lucid requires 20-256 characters for its Idempotency-Key header.
    const headers = { 'idempotency-key': 'http-retry-1-0123456789abcdef' };
    const first = await invoke(
      agent,
      'payout',
      { reference: 'inv-6', recipientAddress: RECIPIENT, amount: '0.01' },
      headers
    );
    expect(first.status).toBe(200);
    const calls = mock.calls.length;
    const second = await invoke(
      agent,
      'payout',
      { reference: 'inv-6', recipientAddress: RECIPIENT, amount: '0.01' },
      headers
    );
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    expect(mock.calls.length).toBe(calls);
  });

  it('rejects malformed input before any execution', async () => {
    const { agent, mock } = await buildAgent();
    const res = await invoke(agent, 'payout', {
      reference: 'inv-7',
      recipientAddress: 'not-an-address',
      amount: '0.01',
    });
    expect(res.status).toBe(400);
    expect(mock.calls).toHaveLength(0);
  });

  it('requires a reference', async () => {
    const { agent, mock } = await buildAgent();
    const res = await invoke(agent, 'payout', {
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    expect(res.status).toBe(400);
    expect(mock.calls).toHaveLength(0);
  });

  it('offers a free dry run that reports the attributed reason', async () => {
    const ok = await buildAgent();
    const good = await invoke(ok.agent, 'dry-run', {
      reference: 'q-1',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    expect(good.status).toBe(200);
    expect(good.body.output).toMatchObject({
      allowed: true,
      wouldRevert: false,
      gasEstimate: '68115',
    });
    expect(broadcasts(ok.mock)).toHaveLength(0);

    const bad = await buildAgent({
      simulate: () => ({
        wouldRevert: true,
        code: 'insufficient_balance',
        failureKind: 'validation',
      }),
    });
    const refused = await invoke(bad.agent, 'dry-run', {
      reference: 'q-2',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    expect(refused.status).toBe(200);
    expect(refused.body.output).toMatchObject({
      allowed: false,
      wouldRevert: true,
      code: 'insufficient_balance',
    });

    const denied = await invoke(ok.agent, 'dry-run', {
      reference: 'q-3',
      recipientAddress: RECIPIENT,
      amount: '100',
    });
    expect(denied.body.output).toMatchObject({
      allowed: false,
      rule: 'max_amount',
    });
  });

  it('exposes the execution log by reference', async () => {
    const { agent } = await buildAgent();
    await invoke(agent, 'payout', {
      reference: 'inv-8',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    const res = await invoke(agent, 'execution', { reference: 'inv-8' });
    expect(res.status).toBe(200);
    expect(res.body.output).toMatchObject({ found: true });
    const record = (res.body.output as { record: Record<string, unknown> })
      .record;
    expect(record.outcome).toBe('landed');
    expect(record.transactionHash).toMatch(/^0x/);
    const missing = await invoke(agent, 'execution', { reference: 'nope' });
    expect(missing.body.output).toEqual({ found: false });
  });

  it('fails loudly when the entrypoint is added without the extension', async () => {
    const agent = await createAgent({ name: 'bare', version: '1.0.0' })
      .use(http())
      .build();
    agent.entrypoints.add(
      keeperhubTransferEntrypoint({
        key: 'payout',
        chainId: 84532,
        tokenAddress: USDC,
      })
    );
    const res = await invoke(agent as unknown as Built, 'payout', {
      reference: 'r',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toMatch(/keeperhub\(\)/);
  });

  it('recovers after a seller restart: the same reference replays the broadcast and finds the receipt', async () => {
    // One KeeperHub, two agent processes. The first gives up while the transaction is unconfirmed.
    const mock = createMockKeeperHub({
      executeStatus: 'unconfirmed',
      statusScript: ['unconfirmed', 'unconfirmed', 'completed'],
      nonTerminalHint: 2,
    });
    const build = async () => {
      const clock = virtualClock();
      const client = new KeeperHubClient({
        apiKey: 'kh_test',
        baseUrl: 'https://keeperhub.test',
        fetch: mock.fetch,
        sleep: clock.sleep,
        now: clock.now,
      });
      const agent = await createAgent({
        name: 'restarting-agent',
        version: '1.0.0',
      })
        .use(
          keeperhub({
            client,
            policy: { chains: [84532], tokens: [USDC] },
            wait: { maxWaitMs: 3000 },
          })
        )
        .use(http())
        .build();
      agent.entrypoints.add(
        keeperhubTransferEntrypoint({
          key: 'payout',
          chainId: 84532,
          tokenAddress: USDC,
        })
      );
      return agent;
    };
    const before = await build();
    const first = await invoke(before, 'payout', {
      reference: 'inv-restart',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    expect(first.status).toBeGreaterThanOrEqual(400);
    expect(first.text).toMatch(/execution_unconfirmed/);
    expect(before.keeperhub.log.get('inv-restart')?.outcome).toBe(
      'unconfirmed'
    );

    const after = await build(); // fresh process: empty log, same KeeperHub
    const second = await invoke(after, 'payout', {
      reference: 'inv-restart',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    expect(second.status).toBe(200);
    const output = second.body.output as Record<string, unknown>;
    expect(output.executionId).toBe('direct_1');
    expect(output.replayed).toBe(true);
    expect(mock.executions.size).toBe(1);
    expect(broadcasts(mock)).toHaveLength(2);
    expect(
      new Set(broadcasts(mock).map(c => c.headers['idempotency-key'])).size
    ).toBe(1);
  });

  it('lets a subscriber follow a reference stage by stage', async () => {
    const { agent } = await buildAgent();
    const seen: string[] = [];
    const unsubscribe = agent.keeperhub.log.subscribe('inv-follow', event => {
      seen.push(
        event.type === 'stage'
          ? event.entry.stage
          : `finished:${event.record.outcome}`
      );
    });
    await invoke(agent, 'payout', {
      reference: 'inv-follow',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    unsubscribe();
    expect(seen).toEqual([
      'received',
      'policy_ok',
      'simulated',
      'broadcast',
      'accepted',
      'landed',
      'finished:landed',
    ]);
  });

  it("streams a finished reference's stages over SSE and ends with the record", async () => {
    const { agent } = await buildAgent();
    agent.entrypoints.add(keeperhubWatchEntrypoint({ key: 'watch' }));
    await invoke(agent, 'payout', {
      reference: 'inv-stream',
      recipientAddress: RECIPIENT,
      amount: '0.01',
    });
    const route = agent.http.routes.find(r => r.id === 'stream')!;
    const res = await route.handle(
      new Request(`${ORIGIN}/entrypoints/watch/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: { reference: 'inv-stream' } }),
      }),
      { key: 'watch' }
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const stage of [
      'received',
      'policy_ok',
      'simulated',
      'broadcast',
      'accepted',
      'landed',
    ]) {
      expect(text).toContain(`"stage":"${stage}"`);
    }
    expect(text).toContain('"control":"finished"');
    expect(text).toContain('"outcome":"landed"');
  });

  it('streams live stages while an execution is in progress', async () => {
    const { agent } = await buildAgent();
    agent.entrypoints.add(
      keeperhubWatchEntrypoint({ key: 'watch', timeoutMs: 5000 })
    );
    const log = agent.keeperhub.log;
    const record = log.start({
      reference: 'inv-live',
      chainId: '84532',
      recipientAddress: RECIPIENT.toLowerCase(),
      amount: '0.01',
      tokenAddress: USDC.toLowerCase(),
    });
    const route = agent.http.routes.find(r => r.id === 'stream')!;
    const pending = route
      .handle(
        new Request(`${ORIGIN}/entrypoints/watch/stream`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: { reference: 'inv-live' } }),
        }),
        { key: 'watch' }
      )
      .then(res => res.text());
    await new Promise(resolve => setTimeout(resolve, 20));
    log.push(record, 'policy_ok');
    log.push(record, 'simulated', { gasEstimate: '1' });
    record.transactionHash = '0xabc';
    log.push(record, 'landed', { transactionHash: '0xabc' });
    log.finish(record, 'landed');
    const text = await pending;
    expect(text).toContain('"stage":"received"');
    expect(text).toContain('"stage":"simulated"');
    expect(text).toContain('"control":"finished"');
    expect(text).toContain('"transactionHash":"0xabc"');
  });

  it('reports an unknown reference on the stream as an error envelope', async () => {
    const { agent } = await buildAgent();
    agent.entrypoints.add(keeperhubWatchEntrypoint());
    const route = agent.http.routes.find(r => r.id === 'stream')!;
    const res = await route.handle(
      new Request(`${ORIGIN}/entrypoints/watch/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: { reference: 'nope' } }),
      }),
      { key: 'watch' }
    );
    const text = await res.text();
    expect(text).toContain('"code":"not_found"');
  });

  it('subscribe authors a Schedule → transfer workflow through KeeperHub, once per reference', async () => {
    const { agent, mock } = await buildAgent();
    agent.entrypoints.add(
      keeperhubScheduleEntrypoint({
        key: 'subscribe',
        chainId: 'base-sepolia',
        tokenAddress: USDC,
      })
    );
    const first = await invoke(agent, 'subscribe', {
      reference: 'payroll-sep',
      recipientAddress: RECIPIENT,
      amount: '0.01',
      cron: '0 9 * * 1',
      timezone: 'UTC',
    });
    expect(first.status).toBe(200);
    expect(first.body.output).toMatchObject({
      workflowId: 'wf_1',
      name: 'landed:payroll-sep',
      created: true,
      cron: '0 9 * * 1',
      timezone: 'UTC',
    });
    const stored = mock.workflows.get('wf_1') as unknown as {
      nodes: Array<{ type: string; data: { config: Record<string, unknown> } }>;
      edges: unknown[];
      enabled: boolean;
    };
    expect(stored.enabled).toBe(true);
    expect(stored.nodes[0]?.data.config).toEqual({
      triggerType: 'Schedule',
      scheduleCron: '0 9 * * 1',
      scheduleTimezone: 'UTC',
    });
    expect(stored.nodes[1]?.data.config).toEqual({
      actionType: 'web3/transfer-token',
      network: '84532',
      tokenConfig: USDC.toLowerCase(),
      amount: '0.01',
      recipientAddress: RECIPIENT.toLowerCase(),
      web3Connection: 'default',
    });
    expect(stored.edges).toHaveLength(1);
    expect(agent.keeperhub.log.get('payroll-sep')?.outcome).toBe('scheduled');

    const again = await invoke(agent, 'subscribe', {
      reference: 'payroll-sep',
      recipientAddress: RECIPIENT,
      amount: '0.01',
      cron: '0 9 * * 1',
    });
    expect(again.status).toBe(200);
    expect(again.body.output).toMatchObject({
      workflowId: 'wf_1',
      created: false,
    });
    expect(mock.workflows.size).toBe(1);
  });

  it('subscribe with runNow executes the workflow once and returns verified hashes', async () => {
    const { agent, mock } = await buildAgent({ workflowWaitIncomplete: 1 });
    agent.entrypoints.add(
      keeperhubScheduleEntrypoint({
        key: 'subscribe',
        chainId: 84532,
        tokenAddress: USDC,
      })
    );
    const res = await invoke(agent, 'subscribe', {
      reference: 'payroll-now',
      recipientAddress: RECIPIENT,
      amount: '0.01',
      cron: '*/30 * * * *',
      runNow: true,
    });
    expect(res.status).toBe(200);
    const output = res.body.output as {
      firstRun: {
        executionId: string;
        status: string;
        transactionHashes: Array<{ hash: string; verified: boolean }>;
      };
    };
    expect(output.firstRun.executionId).toBe('exec_1');
    expect(output.firstRun.status).toBe('success');
    expect(output.firstRun.transactionHashes[0]).toMatchObject({
      verified: true,
      receiptStatus: 'success',
    });
    expect(mock.calls.filter(c => c.path.endsWith('/wait'))).toHaveLength(2);
    expect(agent.keeperhub.log.get('payroll-now')?.outcome).toBe('landed');
  });

  it('subscribe refuses a bad cron and a policy violation before touching KeeperHub', async () => {
    const { agent, mock } = await buildAgent();
    agent.entrypoints.add(
      keeperhubScheduleEntrypoint({
        key: 'subscribe',
        chainId: 84532,
        tokenAddress: USDC,
      })
    );
    const badCron = await invoke(agent, 'subscribe', {
      reference: 'bad-cron',
      recipientAddress: RECIPIENT,
      amount: '0.01',
      cron: 'every monday',
    });
    expect(badCron.status).toBeGreaterThanOrEqual(400);
    expect(badCron.text).toMatch(/invalid cron/);
    const tooMuch = await invoke(agent, 'subscribe', {
      reference: 'too-much',
      recipientAddress: RECIPIENT,
      amount: '9',
      cron: '0 9 * * 1',
    });
    expect(tooMuch.status).toBeGreaterThanOrEqual(400);
    expect(tooMuch.text).toMatch(/policy_denied/);
    expect(mock.workflows.size).toBe(0);
  });

  it('subscribe with runNow surfaces a failed workflow run instead of settling', async () => {
    const { agent } = await buildAgent({ workflowRunStatus: 'error' });
    agent.entrypoints.add(
      keeperhubScheduleEntrypoint({
        key: 'subscribe',
        chainId: 84532,
        tokenAddress: USDC,
      })
    );
    const res = await invoke(agent, 'subscribe', {
      reference: 'payroll-fail',
      recipientAddress: RECIPIENT,
      amount: '0.01',
      cron: '0 9 * * 1',
      runNow: true,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toMatch(/execution_failed/);
    expect(agent.keeperhub.log.get('payroll-fail')?.outcome).toBe('failed');
  });

  it('supports fixed recipient and amount so the caller cannot redirect funds', async () => {
    const { agent, mock } = await buildAgent();
    agent.entrypoints.add(
      keeperhubTransferEntrypoint({
        key: 'tip',
        chainId: 84532,
        tokenAddress: USDC,
        recipientAddress: RECIPIENT,
        amount: '0.5',
      })
    );
    const res = await invoke(agent, 'tip', {
      reference: 'tip-1',
      recipientAddress: '0x1111111111111111111111111111111111111111',
      amount: '4',
    });
    expect(res.status).toBe(200);
    const sent = broadcasts(mock)[0]!.body as Record<string, unknown>;
    expect(sent.recipientAddress).toBe(RECIPIENT.toLowerCase());
    expect(sent.amount).toBe('0.5');
  });
});
