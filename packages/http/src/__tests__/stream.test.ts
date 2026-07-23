import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import type {
  MppRuntime,
  MppSessionMeter,
  MppSessionReceiptEvent,
} from '@lucid-agents/types/mpp';
import type { PaymentsRuntime } from '@lucid-agents/types/payments';
import type { AgentAuthContext } from '@lucid-agents/types/siwx';
import { describe, expect, it } from 'bun:test';

import type { AuthorizationRuntime } from '../authorization';
import { stream } from '../stream';

const meta = { name: 'stream-test', version: '1.0.0' };

function makeRuntime(
  entrypoint?: EntrypointDef,
  payments?: PaymentsRuntime,
  mpp?: MppRuntime
): AuthorizationRuntime {
  return {
    agent: {
      config: { meta },
      getEntrypoint: key => (entrypoint?.key === key ? entrypoint : undefined),
      listEntrypoints: () => (entrypoint ? [entrypoint] : []),
    },
    entrypoints: {
      add: () => {},
      list: () => [],
      snapshot: () => (entrypoint ? [entrypoint] : []),
    },
    manifest: {
      build: () => ({ ...meta, entrypoints: {} }),
      invalidate: () => {},
    },
    close: async () => {},
    payments,
    mpp,
  } as AgentRuntime<{ payments?: PaymentsRuntime; mpp?: MppRuntime }>;
}

function streamRequest(
  body: string = JSON.stringify({ input: { text: 'hi' } })
) {
  return new Request('https://agent.test/entrypoints/messages/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Test': 'present',
    },
    body,
  });
}

function envelopes(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice('data: '.length)));
}

const sessionReceipt = (
  units: number,
  spent: string
): MppSessionReceiptEvent => ({
  event: 'payment-receipt',
  serialized: `receipt-${units}`,
  data: {
    method: 'tempo',
    intent: 'session',
    status: 'success',
    timestamp: '2026-07-24T00:00:00.000Z',
    reference:
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    challengeId: 'challenge-session',
    channelId:
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    acceptedCumulative: spent,
    spent,
    units,
  },
});

function sessionRuntime(meter: MppSessionMeter): MppRuntime {
  return {
    isActive: true,
    requirements: () => ({
      required: true,
      amount: '10',
      currency: 'pathUSD',
      intent: 'session',
      methods: ['tempo'],
    }),
    authorize: async () => ({
      authorized: true,
      payer: '0xpayer',
      network: 'eip155:42431',
      payment: {
        amount: '30',
        currency: 'pathUSD',
        intent: 'session',
        method: 'tempo',
      },
      sessionMeter: meter,
    }),
  } as unknown as MppRuntime;
}

describe('HTTP stream execution', () => {
  it('rejects missing and non-streaming entrypoints', async () => {
    const missing = await stream(streamRequest(), 'messages', makeRuntime());
    const unsupported = await stream(
      streamRequest(),
      'messages',
      makeRuntime({ key: 'messages', handler: async () => ({ output: {} }) })
    );

    expect(missing.status).toBe(404);
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toEqual({
      error: { code: 'stream_not_supported', key: 'messages' },
    });
  });

  it('emits ordered envelopes with trusted auth and finalizes the response', async () => {
    const auth: AgentAuthContext = {
      scheme: 'siwx',
      address: '0xverified',
      chainId: 'eip155:84532',
      grantedBy: 'auth-only',
      payload: {},
    };
    let receivedAuth: AgentAuthContext | undefined;
    const receivedHeaders: Array<string | null> = [];
    const finalizedStatuses: number[] = [];
    const payments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: true,
        admit: async () => ({
          admitted: true,
          abort: async () => {},
          finalize: async (response: Response) => {
            finalizedStatuses.push(response.status);
            const finalized = new Response(response.body, response);
            finalized.headers.set('X-Finalized', 'true');
            return finalized;
          },
        }),
      }),
    } as unknown as PaymentsRuntime;
    const entrypoint: EntrypointDef = {
      key: 'messages',
      stream: async (context, emit) => {
        receivedAuth = context.auth;
        receivedHeaders.push(
          (context.metadata?.headers as Headers | undefined)?.get(
            'X-Request-Test'
          ) ?? null
        );
        await emit({ kind: 'text', text: 'hello' });
        await emit({ kind: 'delta', delta: ' world', final: true });
        return {
          status: 'succeeded',
          output: { complete: true },
          usage: { total_tokens: 2 },
          model: 'test-model',
        };
      },
    };

    const response = await stream(
      streamRequest(),
      entrypoint.key,
      makeRuntime(entrypoint, payments),
      { auth }
    );
    const events = envelopes(await response.text());

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Finalized')).toBe('true');
    expect(finalizedStatuses).toEqual([200]);
    expect(receivedAuth).toEqual(auth);
    expect(receivedHeaders).toEqual(['present']);
    expect(events.map(event => event.kind)).toEqual([
      'run-start',
      'text',
      'delta',
      'run-end',
    ]);
    expect(events.map(event => event.sequence)).toEqual([0, 1, 2, 3]);
    expect(new Set(events.map(event => event.runId)).size).toBe(1);
    expect(events.every(event => typeof event.createdAt === 'string')).toBe(
      true
    );
    expect(events[events.length - 1]).toMatchObject({
      status: 'succeeded',
      output: { complete: true },
      usage: { total_tokens: 2 },
      model: 'test-model',
    });
  });

  it('charges each Tempo session unit before delivery and emits actual accounting', async () => {
    const trace: string[] = [];
    const finalizedAmounts: string[] = [];
    const verifiedPayments: unknown[] = [];
    let units = 0;
    const meter: MppSessionMeter = {
      channelId:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      unitType: 'chunk',
      unitAmount: '10',
      maximumAmount: '30',
      async charge() {
        units += 1;
        trace.push(`charge:${units}`);
        return {
          status: 'charged',
          receipt: sessionReceipt(units, String(units * 10)),
          rollback: async () => {},
        };
      },
      async receipt() {
        return sessionReceipt(units, String(units * 10));
      },
      async cancel() {
        trace.push('cancel');
      },
    };
    const payments = {
      requirements: () => ({ required: false }),
      authorize: async (
        _request: Request,
        _entrypoint: EntrypointDef,
        _kind: 'invoke' | 'stream',
        verifiedPayment: unknown
      ) => {
        verifiedPayments.push(verifiedPayment);
        return {
          authorized: true as const,
          admit: async () => ({
            admitted: true as const,
            abort: async () => {},
            recoverCommittedResponse: (response: Response) => response,
            finalize: async (
              response: Response,
              options?: {
                payment?: {
                  actualAmount: string;
                  asset?: string;
                  reference?: string;
                };
              }
            ) => {
              finalizedAmounts.push(options?.payment?.actualAmount ?? '');
              trace.push('finalize');
              return response;
            },
          }),
        };
      },
    } as unknown as PaymentsRuntime;
    const entrypoint: EntrypointDef = {
      key: 'messages',
      price: { stream: '10' },
      paymentProtocol: 'mpp',
      metadata: {
        mpp: { intent: 'session', methods: ['tempo'] },
      },
      stream: async (_context, emit) => {
        await emit({ kind: 'text', text: 'one' });
        trace.push('delivered:1');
        await emit({ kind: 'text', text: 'two' });
        trace.push('delivered:2');
        return { status: 'succeeded' };
      },
    };

    const response = await stream(
      streamRequest(),
      entrypoint.key,
      makeRuntime(entrypoint, payments, sessionRuntime(meter))
    );
    expect(finalizedAmounts).toEqual([]);
    const body = await response.text();
    const events = envelopes(body);

    expect(
      body
        .split('\n')
        .filter(line => line.startsWith('event: '))
        .map(line => line.slice('event: '.length))
    ).toEqual(['run-start', 'text', 'text', 'payment-receipt', 'run-end']);
    expect(trace).toEqual([
      'charge:1',
      'delivered:1',
      'charge:2',
      'delivered:2',
      'cancel',
      'finalize',
    ]);
    expect(finalizedAmounts).toEqual(['20']);
    expect(verifiedPayments).toEqual([
      {
        protocol: 'mpp',
        payer: '0xpayer',
        amount: '30',
        currency: 'pathUSD',
        network: 'eip155:42431',
        intent: 'session',
        reference: meter.channelId,
        maximumAmount: '30',
      },
    ]);
    expect(events[events.length - 1]).toMatchObject({
      status: 'succeeded',
      metadata: {
        mppSession: {
          deliveredUnits: 2,
          actualAmount: '20',
          spent: '20',
          units: 2,
          unitType: 'chunk',
        },
      },
    });
  });

  it('emits need-voucher and resumes delivery after a live top-up', async () => {
    let units = 0;
    let releaseTopUp: () => void = () => {};
    const topUp = new Promise<void>(resolve => {
      releaseTopUp = resolve;
    });
    const meter: MppSessionMeter = {
      channelId:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      unitType: 'chunk',
      unitAmount: '10',
      maximumAmount: '30',
      async charge(options) {
        if (units === 1) {
          await options?.onNeedVoucher?.({
            event: 'payment-need-voucher',
            data: {
              channelId: this.channelId,
              requiredCumulative: '20',
              acceptedCumulative: '10',
              deposit: '100',
            },
          });
          await topUp;
        }
        units += 1;
        return {
          status: 'charged',
          receipt: sessionReceipt(units, String(units * 10)),
          rollback: async () => {},
        };
      },
      async receipt() {
        return sessionReceipt(units, String(units * 10));
      },
      async cancel() {},
    };
    const entrypoint: EntrypointDef = {
      key: 'messages',
      price: { stream: '10' },
      paymentProtocol: 'mpp',
      metadata: { mpp: { intent: 'session', methods: ['tempo'] } },
      stream: async (_context, emit) => {
        await emit({ kind: 'text', text: 'one' });
        await emit({ kind: 'text', text: 'two' });
        return { status: 'succeeded' };
      },
    };
    const response = await stream(
      streamRequest(),
      entrypoint.key,
      makeRuntime(entrypoint, undefined, sessionRuntime(meter))
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    expect(decoder.decode((await reader.read()).value)).toContain(
      'event: run-start'
    );
    expect(decoder.decode((await reader.read()).value)).toContain(
      '"text":"one"'
    );
    expect(decoder.decode((await reader.read()).value)).toContain(
      'event: payment-need-voucher'
    );
    expect(units).toBe(1);

    releaseTopUp();
    const remainder: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      remainder.push(decoder.decode(value));
    }
    expect(remainder.join('')).toContain('"text":"two"');
    expect(units).toBe(2);
  });

  it('terminates deterministically when a session cannot fund the next unit', async () => {
    let charges = 0;
    let cancels = 0;
    const meter: MppSessionMeter = {
      channelId:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      unitType: 'chunk',
      unitAmount: '10',
      maximumAmount: '30',
      async charge(options) {
        if (charges === 1) {
          await options?.onNeedVoucher?.({
            event: 'payment-need-voucher',
            data: {
              channelId: this.channelId,
              requiredCumulative: '20',
              acceptedCumulative: '10',
              deposit: '10',
            },
          });
          return {
            status: 'unavailable',
            reason: 'timeout',
            problem: Response.json(
              {
                type: 'https://paymentauth.org/problems/session/insufficient-balance',
                title: 'Insufficient Balance',
                status: 402,
              },
              {
                status: 402,
                headers: { 'Content-Type': 'application/problem+json' },
              }
            ),
          };
        }
        charges += 1;
        return {
          status: 'charged',
          receipt: sessionReceipt(charges, String(charges * 10)),
          rollback: async () => {},
        };
      },
      async receipt() {
        return sessionReceipt(charges, String(charges * 10));
      },
      async cancel() {
        cancels += 1;
      },
    };
    const entrypoint: EntrypointDef = {
      key: 'messages',
      price: { stream: '10' },
      paymentProtocol: 'mpp',
      metadata: { mpp: { intent: 'session', methods: ['tempo'] } },
      stream: async (_context, emit) => {
        await emit({ kind: 'text', text: 'one' });
        await emit({ kind: 'text', text: 'unfunded' });
        return { status: 'succeeded' };
      },
    };

    const response = await stream(
      streamRequest(),
      entrypoint.key,
      makeRuntime(entrypoint, undefined, sessionRuntime(meter))
    );
    const body = await response.text();
    const parsed = envelopes(body);

    expect(body).toContain('event: payment-need-voucher');
    expect(body).toContain(
      'https://paymentauth.org/problems/session/insufficient-balance'
    );
    expect(body).not.toContain('"text":"unfunded"');
    expect(parsed[parsed.length - 1]).toMatchObject({
      status: 'failed',
      error: { code: 'session_payment_unavailable' },
    });
    expect(charges).toBe(1);
    expect(cancels).toBe(1);
  });

  it('supports simultaneous streams through one atomic session meter', async () => {
    let units = 0;
    let queue = Promise.resolve();
    const meter: MppSessionMeter = {
      channelId:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      unitType: 'chunk',
      unitAmount: '10',
      maximumAmount: '30',
      charge() {
        const operation = queue.then(() => {
          units += 1;
          return {
            status: 'charged' as const,
            receipt: sessionReceipt(units, String(units * 10)),
            rollback: async () => {},
          };
        });
        queue = operation.then(() => {});
        return operation;
      },
      async receipt() {
        await queue;
        return sessionReceipt(units, String(units * 10));
      },
      async cancel() {},
    };
    const entrypoint: EntrypointDef = {
      key: 'messages',
      price: { stream: '10' },
      paymentProtocol: 'mpp',
      metadata: { mpp: { intent: 'session', methods: ['tempo'] } },
      stream: async (_context, emit) => {
        await emit({ kind: 'text', text: 'one' });
        return { status: 'succeeded' };
      },
    };
    const runtime = makeRuntime(entrypoint, undefined, sessionRuntime(meter));

    const [left, right] = await Promise.all([
      stream(streamRequest(), entrypoint.key, runtime),
      stream(streamRequest(), entrypoint.key, runtime),
    ]);
    const [leftBody, rightBody] = await Promise.all([
      left.text(),
      right.text(),
    ]);

    expect(leftBody).toContain('"text":"one"');
    expect(rightBody).toContain('"text":"one"');
    expect(units).toBe(2);
  });

  it('turns handler exceptions into terminal SSE error envelopes', async () => {
    const response = await stream(
      streamRequest(),
      'messages',
      makeRuntime({
        key: 'messages',
        stream: async () => {
          throw new Error('stream failed');
        },
      })
    );
    const events = envelopes(await response.text());

    expect(response.status).toBe(200);
    expect(events.map(event => event.kind)).toEqual([
      'run-start',
      'error',
      'run-end',
    ]);
    expect(events[1]).toMatchObject({
      code: 'internal_error',
      message: 'stream failed',
    });
    expect(events[2]).toMatchObject({
      status: 'failed',
      error: { code: 'internal_error', message: 'stream failed' },
    });
  });

  it('cancels handler work when the SSE consumer disconnects', async () => {
    let observedAbort = false;
    const response = await stream(
      streamRequest(),
      'messages',
      makeRuntime({
        key: 'messages',
        stream: async (context, emit) => {
          await emit({ kind: 'text', text: 'first' });
          if (!context.signal.aborted) {
            await new Promise<void>(resolve => {
              context.signal.addEventListener(
                'abort',
                () => {
                  observedAbort = true;
                  resolve();
                },
                { once: true }
              );
            });
          }
          return { status: 'cancelled' };
        },
      })
    );
    const reader = response.body!.getReader();

    await reader.read();
    await reader.read();
    await new Promise(resolve => setTimeout(resolve, 0));
    await reader.cancel('client disconnected');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(observedAbort).toBe(true);
  });

  it('cancels a session meter on disconnect without charging another unit', async () => {
    let charges = 0;
    let cancels = 0;
    const finalizedAmounts: string[] = [];
    const meter: MppSessionMeter = {
      channelId:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      unitType: 'chunk',
      unitAmount: '10',
      maximumAmount: '30',
      async charge() {
        charges += 1;
        return {
          status: 'charged',
          receipt: sessionReceipt(charges, String(charges * 10)),
          rollback: async () => {},
        };
      },
      async receipt() {
        return sessionReceipt(charges, String(charges * 10));
      },
      async cancel() {
        cancels += 1;
      },
    };
    const payments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: true as const,
        admit: async () => ({
          admitted: true as const,
          abort: async () => {},
          recoverCommittedResponse: (response: Response) => response,
          finalize: async (
            response: Response,
            options?: { payment?: { actualAmount: string } }
          ) => {
            finalizedAmounts.push(options?.payment?.actualAmount ?? '');
            return response;
          },
        }),
      }),
    } as unknown as PaymentsRuntime;
    const entrypoint: EntrypointDef = {
      key: 'messages',
      price: { stream: '10' },
      paymentProtocol: 'mpp',
      metadata: { mpp: { intent: 'session', methods: ['tempo'] } },
      stream: async (context, emit) => {
        await emit({ kind: 'text', text: 'one' });
        if (!context.signal.aborted) {
          await new Promise<void>(resolve => {
            context.signal.addEventListener('abort', () => resolve(), {
              once: true,
            });
          });
        }
        return { status: 'cancelled' };
      },
    };
    const response = await stream(
      streamRequest(),
      entrypoint.key,
      makeRuntime(entrypoint, payments, sessionRuntime(meter))
    );
    const reader = response.body!.getReader();

    await reader.read();
    await reader.read();
    await new Promise(resolve => setTimeout(resolve, 0));
    await reader.cancel('client disconnected');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(charges).toBe(1);
    expect(cancels).toBe(1);
    expect(finalizedAmounts).toEqual(['10']);
  });

  it('rolls back a charge when the request aborts before its chunk is delivered', async () => {
    const controller = new AbortController();
    let charges = 0;
    let rollbacks = 0;
    let cancels = 0;
    const finalizedAmounts: string[] = [];
    const meter: MppSessionMeter = {
      channelId:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      unitType: 'chunk',
      unitAmount: '10',
      maximumAmount: '30',
      async charge() {
        charges += 1;
        controller.abort(new Error('client disconnected'));
        return {
          status: 'charged',
          receipt: sessionReceipt(charges, String(charges * 10)),
          rollback: async () => {
            rollbacks += 1;
            charges -= 1;
          },
        };
      },
      async receipt() {
        return sessionReceipt(charges, String(charges * 10));
      },
      async cancel() {
        cancels += 1;
      },
    };
    const payments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: true as const,
        admit: async () => ({
          admitted: true as const,
          abort: async () => {},
          recoverCommittedResponse: (response: Response) => response,
          finalize: async (
            response: Response,
            options?: { payment?: { actualAmount: string } }
          ) => {
            finalizedAmounts.push(options?.payment?.actualAmount ?? '');
            return response;
          },
        }),
      }),
    } as unknown as PaymentsRuntime;
    const entrypoint: EntrypointDef = {
      key: 'messages',
      price: { stream: '10' },
      paymentProtocol: 'mpp',
      metadata: { mpp: { intent: 'session', methods: ['tempo'] } },
      stream: async (_context, emit) => {
        await emit({ kind: 'text', text: 'not delivered' });
        return { status: 'cancelled' };
      },
    };
    const request = new Request(
      'https://agent.test/entrypoints/messages/stream',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { text: 'hi' } }),
        signal: controller.signal,
      }
    );
    const response = await stream(
      request,
      entrypoint.key,
      makeRuntime(entrypoint, payments, sessionRuntime(meter))
    );
    const reader = response.body!.getReader();

    await reader.read().catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(charges).toBe(0);
    expect(rollbacks).toBe(1);
    expect(cancels).toBe(1);
    expect(finalizedAmounts).toEqual(['0']);
  });

  it('cancels a session meter when the consumer disconnects before delivery starts', async () => {
    let charges = 0;
    let cancels = 0;
    const finalizedAmounts: string[] = [];
    const meter: MppSessionMeter = {
      channelId:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      unitType: 'chunk',
      unitAmount: '10',
      maximumAmount: '30',
      async charge() {
        charges += 1;
        return {
          status: 'charged',
          receipt: sessionReceipt(charges, String(charges * 10)),
          rollback: async () => {},
        };
      },
      async receipt() {
        return sessionReceipt(charges, String(charges * 10));
      },
      async cancel() {
        cancels += 1;
      },
    };
    const payments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: true as const,
        admit: async () => ({
          admitted: true as const,
          abort: async () => {},
          recoverCommittedResponse: (response: Response) => response,
          finalize: async (
            response: Response,
            options?: { payment?: { actualAmount: string } }
          ) => {
            finalizedAmounts.push(options?.payment?.actualAmount ?? '');
            return response;
          },
        }),
      }),
    } as unknown as PaymentsRuntime;
    const entrypoint: EntrypointDef = {
      key: 'messages',
      price: { stream: '10' },
      paymentProtocol: 'mpp',
      metadata: { mpp: { intent: 'session', methods: ['tempo'] } },
      stream: async (_context, emit) => {
        await emit({ kind: 'text', text: 'never delivered' });
        return { status: 'succeeded' };
      },
    };
    const response = await stream(
      streamRequest(),
      entrypoint.key,
      makeRuntime(entrypoint, payments, sessionRuntime(meter))
    );

    await response.body!.cancel('client disconnected');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(charges).toBe(0);
    expect(cancels).toBe(1);
    expect(finalizedAmounts).toEqual(['0']);
  });

  it('rejects malformed input before verifying or charging a session', async () => {
    let cancels = 0;
    const meter: MppSessionMeter = {
      channelId:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      unitType: 'chunk',
      unitAmount: '10',
      maximumAmount: '30',
      async charge() {
        throw new Error('charge must not run');
      },
      async receipt() {
        return sessionReceipt(0, '0');
      },
      async cancel() {
        cancels += 1;
      },
    };
    const entrypoint: EntrypointDef = {
      key: 'messages',
      price: { stream: '10' },
      paymentProtocol: 'mpp',
      metadata: { mpp: { intent: 'session', methods: ['tempo'] } },
      stream: async () => ({ status: 'succeeded' }),
    };

    const response = await stream(
      streamRequest('{'),
      entrypoint.key,
      makeRuntime(entrypoint, undefined, sessionRuntime(meter))
    );

    expect(response.status).toBe(400);
    expect(cancels).toBe(0);
  });

  it('returns deterministic authorization admission failures', async () => {
    const entrypoint: EntrypointDef = {
      key: 'messages',
      stream: async () => ({ status: 'succeeded' }),
    };
    const deniedPayments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: false,
        response: Response.json({ error: 'payment required' }, { status: 402 }),
      }),
    } as unknown as PaymentsRuntime;
    const rejected = await stream(
      streamRequest(),
      entrypoint.key,
      makeRuntime(entrypoint, deniedPayments)
    );
    expect(rejected.status).toBe(402);

    const failingPayments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: true,
        admit: async () => {
          throw new Error('policy store unavailable');
        },
      }),
    } as unknown as PaymentsRuntime;
    const failed = await stream(
      streamRequest(),
      entrypoint.key,
      makeRuntime(entrypoint, failingPayments)
    );

    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({
      error: {
        code: 'authorization_admission_failed',
        message: 'policy store unavailable',
      },
    });
  });
});
