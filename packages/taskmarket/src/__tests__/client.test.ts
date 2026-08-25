import { describe, expect, it } from 'bun:test';
import { privateKeyToAccount } from 'viem/accounts';

import { BASE_CAIP2, BASE_USDC_ADDRESS } from '../constants';
import { TaskmarketClient } from '../client';
import {
  PaymentInFlightError,
  PaymentSettlementUnknownError,
  TaskmarketError,
} from '../errors';
import { createInMemoryPaymentAttemptStore } from '../attempts';
import { taskmarket } from '../extension';

const account = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);

const safeAccept = {
  scheme: 'exact',
  network: BASE_CAIP2,
  amount: '1500000',
  asset: BASE_USDC_ADDRESS,
  payTo: '0x1111111111111111111111111111111111111111',
  extra: { name: 'USD Coin', version: '2' },
};

type Call = { url: string; init?: RequestInit; payment: boolean };

function mockFetch(handler: (call: Call, index: number) => Response) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const call: Call = {
      url,
      init,
      payment: headers.has('PAYMENT-SIGNATURE'),
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function clientWith(
  fetchImpl: typeof fetch,
  attempts = createInMemoryPaymentAttemptStore()
) {
  return new TaskmarketClient({
    account,
    fetchImpl,
    attempts,
    now: () => Date.parse('2026-08-25T12:00:00.000Z'),
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
  });
}

const draft = {
  description: 'Summarize the weekly onchain report',
  rewardUsdc: '1.5',
  durationHours: 24,
  tags: ['research'],
  deliverables: 'One markdown file, 400-800 words',
};

describe('TaskmarketClient requester flow', () => {
  it('refuses to create without explicit confirmation', async () => {
    const { fetchImpl, calls } = mockFetch(() => new Response('nope'));
    const client = clientWith(fetchImpl);
    const preview = client.previewCreate(draft);
    await expect(
      client.createTask(preview, {
        previewId: preview.previewId,
        confirmed: false as unknown as true,
        token: 'unused',
      })
    ).rejects.toThrow('Fresh explicit user authorization');
    expect(calls).toHaveLength(0);
  });

  it('creates a task after confirmation, paying the 402 exactly once', async () => {
    const { fetchImpl, calls } = mockFetch((call, index) => {
      if (index === 0) {
        expect(call.payment).toBe(false);
        return new Response(
          JSON.stringify({ x402Version: 2, accepts: [safeAccept] }),
          { status: 402 }
        );
      }
      expect(call.payment).toBe(true);
      return new Response(
        JSON.stringify({
          success: true,
          taskId: '0xabc123',
          intentId: 'intent-1',
        }),
        { status: 200 }
      );
    });
    const client = clientWith(fetchImpl);
    const preview = client.previewCreate(draft);
    const created = await client.createTask(preview, client.confirm(preview));
    expect(created.taskId).toBe('0xabc123');
    expect(created.apiUrl).toContain('/api/tasks/0xabc123');
    expect(created.appUrl).toContain('/tasks/0xabc123');
    expect(calls).toHaveLength(2);
    expect(calls.filter(c => c.payment)).toHaveLength(1);
    const paidHeaders = new Headers(calls[1].init?.headers);
    expect(paidHeaders.get('X-Taskmarket-Idempotency-Key')).toBe(
      preview.idempotencyKey
    );
  });

  it('sends confirmed deliverables even when they differ from the description', async () => {
    const { fetchImpl, calls } = mockFetch((_call, index) => {
      if (index === 0) {
        return new Response(
          JSON.stringify({ x402Version: 2, accepts: [safeAccept] }),
          { status: 402 }
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          taskId: '0xdeliv',
          intentId: 'intent-deliv',
        }),
        { status: 200 }
      );
    });
    const client = clientWith(fetchImpl);
    const preview = client.previewCreate({
      ...draft,
      description: 'Write a research brief',
      deliverables: 'PDF report with 3 citations, not the description text',
    });
    await client.createTask(preview, client.confirm(preview));
    const bodies = calls.map(call =>
      JSON.parse(String(call.init?.body ?? '{}'))
    );
    expect(bodies[0].description).toBe('Write a research brief');
    expect(bodies[0].deliverables).toBe(
      'PDF report with 3 citations, not the description text'
    );
    expect(bodies[1].deliverables).toBe(bodies[0].deliverables);
  });

  it('does not send payment when the 402 is for the wrong network', async () => {
    const { fetchImpl, calls } = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            accepts: [{ ...safeAccept, network: 'eip155:1' }],
          }),
          { status: 402 }
        )
    );
    const client = clientWith(fetchImpl);
    const preview = client.previewCreate(draft);
    await expect(
      client.createTask(preview, client.confirm(preview))
    ).rejects.toThrow('Base');
    expect(calls).toHaveLength(1);
    expect(calls[0].payment).toBe(false);
  });

  it('marks settlement unknown and refuses a second payment after a drop', async () => {
    const attempts = createInMemoryPaymentAttemptStore();
    const { fetchImpl, calls } = mockFetch((_call, index) => {
      if (index === 0) {
        return new Response(JSON.stringify({ accepts: [safeAccept] }), {
          status: 402,
        });
      }
      throw new Error('network down after payment');
    });
    const client = clientWith(fetchImpl, attempts);
    const preview = client.previewCreate(draft);
    const authorization = client.confirm(preview);
    await expect(
      client.createTask(preview, authorization)
    ).rejects.toBeInstanceOf(PaymentSettlementUnknownError);
    expect(calls.filter(c => c.payment)).toHaveLength(1);

    await expect(client.createTask(preview, authorization)).rejects.toThrow(
      'already been used'
    );
    await expect(
      client.createTask(preview, client.confirm(preview))
    ).rejects.toBeInstanceOf(PaymentInFlightError);
    expect(calls.filter(c => c.payment)).toHaveLength(1);
  });

  it('rejects expired confirmations without sending payment', async () => {
    let now = Date.parse('2026-08-25T12:00:00.000Z');
    const { fetchImpl, calls } = mockFetch(() => new Response('nope'));
    const client = new TaskmarketClient({
      account,
      fetchImpl,
      now: () => now,
      randomUUID: () => '11111111-1111-4111-8111-111111111111',
      authorizationTtlMs: 60_000,
    });
    const preview = client.previewCreate(draft);
    const authorization = client.confirm(preview);
    now += 60_000;
    await expect(client.createTask(preview, authorization)).rejects.toThrow(
      'expired'
    );
    expect(calls).toHaveLength(0);
  });

  it('rejects retained confirmations after a client restart', async () => {
    const { fetchImpl, calls } = mockFetch(() => new Response('nope'));
    const original = clientWith(fetchImpl);
    const preview = original.previewCreate(draft);
    const authorization = original.confirm(preview);
    const restarted = clientWith(fetchImpl);
    await expect(
      restarted.createTask(preview, authorization)
    ).rejects.toThrow('unrecognized');
    expect(calls).toHaveLength(0);
  });

  it('recovers an unknown payment from GET /intents instead of paying again', async () => {
    const attempts = createInMemoryPaymentAttemptStore();
    attempts.set({
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      operation: 'create',
      status: 'unknown',
      expectedAmount: '1500000',
      updatedAtIso: '2026-08-25T12:00:00.000Z',
    });
    const { fetchImpl, calls } = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            intentId: 'intent-9',
            idempotencyKey: '11111111-1111-4111-8111-111111111111',
            operation: 'create',
            status: 'completed',
            txHash: '0xdead',
            terminalReason: null,
            taskId: '0xrecovered',
            refund: { status: 'refunded', txHash: null },
          }),
          { status: 200 }
        )
    );
    const client = clientWith(fetchImpl, attempts);
    const intent = await client.recoverPayment(
      '11111111-1111-4111-8111-111111111111'
    );
    expect(intent.taskId).toBe('0xrecovered');
    expect(intent.status).toBe('completed');
    expect(calls.some(c => c.url.includes('/api/intents'))).toBe(true);
    expect(calls.some(c => c.payment)).toBe(false);
  });

  it('lists submissions for human review and never auto-accepts', async () => {
    const { fetchImpl, calls } = mockFetch(
      () =>
        new Response(
          JSON.stringify([
            {
              id: 'sub-1',
              workerAddress: '0x2222222222222222222222222222222222222222',
              submittedAt: '2026-08-25T13:00:00.000Z',
              artifacts: [{ fileName: 'answer.md', role: 'final' }],
            },
          ]),
          { status: 200 }
        )
    );
    const client = clientWith(fetchImpl);
    const submissions = await client.listSubmissions('0xabc123');
    expect(submissions).toHaveLength(1);
    expect(submissions[0].artifactNames).toEqual(['answer.md']);
    expect(
      calls.every(
        c =>
          c.init?.method === 'GET' ||
          String(c.init?.method ?? 'GET').toUpperCase() === 'GET'
      )
    ).toBe(true);
    expect(calls.some(c => c.url.includes('accept'))).toBe(false);
  });

  it('requires a second confirmation before accept', async () => {
    const { fetchImpl, calls } = mockFetch(() => new Response('nope'));
    const client = clientWith(fetchImpl);
    const preview = client.previewAccept({
      taskId: '0xabc123',
      workerAddress: '0x2222222222222222222222222222222222222222',
    });
    await expect(
      client.acceptSubmission(preview, {
        previewId: preview.previewId,
        confirmed: false as unknown as true,
        token: 'unused',
      })
    ).rejects.toThrow(TaskmarketError);
    expect(calls).toHaveLength(0);
  });

  it('returns live task status and links', async () => {
    const { fetchImpl } = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            id: '0xabc123',
            referenceCode: 'TSK-TEST',
            status: 'open',
            description: 'Summarize the weekly onchain report',
            reward: '1500000',
            expiryTime: '2026-08-26T12:00:00.000Z',
            submissionCount: 2,
            submissionWindowOpen: true,
          }),
          { status: 200 }
        )
    );
    const client = clientWith(fetchImpl);
    const status = await client.getTask('0xabc123');
    expect(status.status).toBe('open');
    expect(status.network).toBe('Base');
    expect(status.apiUrl).toContain('/api/tasks/0xabc123');
    expect(status.referenceCode).toBe('TSK-TEST');
  });

  it('binds through the Lucid extension', async () => {
    const extension = taskmarket({ account });
    expect(extension.name).toBe('taskmarket');
    const slice = await extension.build({
      runtime: {},
      meta: { name: 'demo', version: '1' },
    } as never);
    expect(slice.taskmarket.previewCreate).toBeFunction();
    expect(slice.taskmarket.confirm).toBeFunction();
  });
});
