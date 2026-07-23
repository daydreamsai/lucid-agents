import { describe, expect, it } from 'bun:test';

import type { EntrypointDef } from '@lucid-agents/types/core';
import type {
  MppPaymentRequirement,
  MppRuntime,
} from '@lucid-agents/types/mpp';
import type { PaymentsRuntime } from '@lucid-agents/types/payments';
import { z } from 'zod';

import {
  authorizeEntrypointRequest,
  type AuthorizationRuntime,
} from '../authorization';
import { invoke } from '../invoke';
import { createAgentRoutePlan } from '../route-plan';
import { stream } from '../stream';

const meta = { name: 'authorization-test', version: '1.0.0' };

function runtimeWith(
  entrypoint: EntrypointDef,
  capabilities: {
    payments?: PaymentsRuntime;
    mpp?: MppRuntime;
  } = {}
): AuthorizationRuntime {
  return {
    agent: {
      config: { meta },
      getEntrypoint: (key: string) =>
        key === entrypoint.key ? entrypoint : undefined,
      listEntrypoints: () => [entrypoint],
    },
    entrypoints: {
      add: () => {},
      list: () => [
        {
          key: entrypoint.key,
          description: entrypoint.description,
          streaming: Boolean(entrypoint.stream),
        },
      ],
      snapshot: () => [entrypoint],
    },
    manifest: {
      build: () => ({ ...meta, entrypoints: {} }),
      invalidate: () => {},
    },
    close: async () => {},
    ...capabilities,
  } as unknown as AuthorizationRuntime;
}

describe('shared execution authorization', () => {
  it('fails closed when an explicitly selected payment rail is missing', async () => {
    const mppEntrypoint: EntrypointDef = {
      key: 'mpp-only',
      price: '1',
      paymentProtocol: 'mpp',
    };
    const x402Entrypoint: EntrypointDef = {
      key: 'x402-only',
      price: '1',
      paymentProtocol: 'x402',
    };

    const mppResult = await authorizeEntrypointRequest(
      new Request('https://agent.test/entrypoints/mpp-only/invoke'),
      mppEntrypoint,
      'invoke',
      runtimeWith(mppEntrypoint)
    );
    const x402Result = await authorizeEntrypointRequest(
      new Request('https://agent.test/entrypoints/x402-only/invoke'),
      x402Entrypoint,
      'invoke',
      runtimeWith(x402Entrypoint)
    );

    expect(mppResult.authorized).toBe(false);
    expect(x402Result.authorized).toBe(false);
    if (mppResult.authorized || x402Result.authorized) {
      throw new Error('Expected missing payment rails to fail closed');
    }
    expect(mppResult.response.status).toBe(503);
    expect(x402Result.response.status).toBe(503);
  });

  it('fails closed when an explicit x402 offer has no payments runtime', async () => {
    const entrypoint: EntrypointDef = {
      key: 'explicit-x402-offer',
      paymentProtocol: 'x402',
      x402: {
        offers: [
          {
            scheme: 'exact',
            network: 'eip155:8453',
            price: '0.01',
            payTo: '0x0000000000000000000000000000000000000001',
          },
        ],
      },
    };

    const result = await authorizeEntrypointRequest(
      new Request('https://agent.test/entrypoints/explicit-x402-offer/invoke'),
      entrypoint,
      'invoke',
      runtimeWith(entrypoint)
    );

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected a missing-rail response');
    expect(result.response.status).toBe(503);
  });

  it('resolves an MPP challenge once and passes it into verification', async () => {
    const requirement: MppPaymentRequirement = {
      required: true,
      amount: '1',
      currency: 'usd',
      intent: 'charge',
      methods: ['test'],
    };
    let requirementsCalls = 0;
    let receivedRequirement: MppPaymentRequirement | undefined;
    const mpp = {
      config: { methods: [] },
      isActive: true,
      requirements: () => {
        requirementsCalls += 1;
        return requirement;
      },
      authorize: async (
        _request: Request,
        _entrypoint: EntrypointDef,
        _kind: 'invoke' | 'stream',
        resolved?: MppPaymentRequirement
      ) => {
        receivedRequirement = resolved;
        return { authorized: true } as const;
      },
    } as unknown as MppRuntime;
    const entrypoint: EntrypointDef = { key: 'paid', price: '1' };

    const authorization = await authorizeEntrypointRequest(
      new Request('https://agent.test/entrypoints/paid/invoke'),
      entrypoint,
      'invoke',
      runtimeWith(entrypoint, { mpp })
    );

    expect(authorization.authorized).toBe(true);
    expect(requirementsCalls).toBe(1);
    expect(receivedRequirement).toBe(requirement);
  });

  it('passes the verified MPP payer into payment policy authorization', async () => {
    const requirement: MppPaymentRequirement = {
      required: true,
      amount: '2.5',
      currency: 'usd',
      intent: 'charge',
      methods: ['test'],
    };
    const mpp = {
      requirements: () => requirement,
      authorize: async () => ({
        authorized: true,
        payer: '0xverified',
        network: 'eip155:84532',
        responseHeaders: {
          'PAYMENT-RESPONSE': 'x402-compatible-receipt',
          'Set-Cookie': 'must-not-propagate=true',
        },
        payment: {
          amount: '2500000',
          currency: '0x20c0000000000000000000000000000000000000',
          intent: 'charge',
          method: 'tempo',
        },
      }),
    } as unknown as MppRuntime;
    let receivedPayment: Parameters<PaymentsRuntime['authorize']>[3];
    const payments = {
      requirements: () => ({ required: false }),
      authorize: async (
        _request: Request,
        _entrypoint: EntrypointDef,
        _kind: 'invoke' | 'stream',
        payment: Parameters<PaymentsRuntime['authorize']>[3]
      ) => {
        receivedPayment = payment;
        return {
          authorized: true,
          reconciliation: {
            paymentIdentifier: 'payment-id-000000000001',
            extensions: {
              'payment-identifier': { id: 'payment-id-000000000001' },
            },
          },
          admit: async () => ({
            admitted: true,
            abort: async () => {},
            finalize: async (response: Response) => response,
          }),
        } as const;
      },
    } as unknown as PaymentsRuntime;
    const paid: EntrypointDef = {
      key: 'mpp-policy',
      price: '2.5',
      paymentProtocol: 'mpp',
    };

    const result = await authorizeEntrypointRequest(
      new Request('https://agent.test/entrypoints/mpp-policy/invoke'),
      paid,
      'invoke',
      runtimeWith(paid, { mpp, payments })
    );

    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.reconciliation?.paymentIdentifier).toBe(
        'payment-id-000000000001'
      );
      expect(result.subject).toBe('payment:eip155:84532:0xverified');
      const decorated = result.decorate(Response.json({ ok: true }));
      expect(decorated.headers.get('PAYMENT-RESPONSE')).toBe(
        'x402-compatible-receipt'
      );
      expect(decorated.headers.get('Set-Cookie')).toBeNull();
    }
    expect(receivedPayment).toEqual({
      protocol: 'mpp',
      payer: '0xverified',
      amount: '2500000',
      currency: '0x20c0000000000000000000000000000000000000',
      network: 'eip155:84532',
    });
  });

  it('short-circuits protocol-managed MPP requests before entrypoint admission', async () => {
    const handled = new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'public, max-age=60',
        'Payment-Receipt': 'channel-opened',
      },
    });
    const mpp = {
      requirements: () => ({
        required: true,
        amount: '1',
        currency: 'usd',
        intent: 'session',
        methods: ['test'],
      }),
      authorize: async () => ({ authorized: true, handled }),
    } as unknown as MppRuntime;
    const entrypoint: EntrypointDef = {
      key: 'managed-session',
      price: '1',
      paymentProtocol: 'mpp',
    };

    const result = await authorizeEntrypointRequest(
      new Request('https://agent.test/entrypoints/managed-session/invoke'),
      entrypoint,
      'invoke',
      runtimeWith(entrypoint, { mpp })
    );

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected a managed response');
    expect(result.response.headers.get('Payment-Receipt')).toBe(
      'channel-opened'
    );
    expect(result.response.headers.get('Cache-Control')).toBe(
      'max-age=60, private'
    );
  });

  it('marks ordinary MPP receipt responses private without dropping cache directives', async () => {
    const mpp = {
      requirements: () => ({
        required: true,
        amount: '1',
        currency: 'usd',
        intent: 'charge',
        methods: ['test'],
      }),
      authorize: async () => ({
        authorized: true,
        receipt: 'paid-charge',
      }),
    } as unknown as MppRuntime;
    const entrypoint: EntrypointDef = {
      key: 'receipt-cache',
      price: '1',
      paymentProtocol: 'mpp',
    };
    const authorization = await authorizeEntrypointRequest(
      new Request('https://agent.test/entrypoints/receipt-cache/invoke'),
      entrypoint,
      'invoke',
      runtimeWith(entrypoint, { mpp })
    );

    expect(authorization.authorized).toBe(true);
    if (!authorization.authorized) throw new Error('Expected authorization');
    const admission = await authorization.admit();
    expect(admission.admitted).toBe(true);
    if (!admission.admitted) throw new Error('Expected admission');
    const response = await admission.finalize(
      new Response('ok', {
        headers: { 'Cache-Control': 'max-age=120, immutable' },
      })
    );

    expect(response.headers.get('Payment-Receipt')).toBe('paid-charge');
    expect(response.headers.get('Cache-Control')).toBe(
      'max-age=120, immutable, private'
    );
  });

  it('reuses a verified SIWX entitlement before challenging an MPP route', async () => {
    const requirement: MppPaymentRequirement = {
      required: true,
      amount: '1',
      currency: 'usd',
      intent: 'charge',
      methods: ['test'],
    };
    let mppAuthorizations = 0;
    let paymentAuthorizations = 0;
    const mpp = {
      requirements: () => requirement,
      authorize: async () => {
        mppAuthorizations += 1;
        return {
          authorized: false,
          response: new Response(null, { status: 402 }),
        } as const;
      },
    } as unknown as MppRuntime;
    const payments = {
      requirements: () => ({ required: false }),
      authorizeSIWx: async () => ({
        authorized: true,
        subject: 'siwx:eip155:84532:0xverified',
        auth: {
          scheme: 'siwx',
          address: '0xverified',
          chainId: 'eip155:84532',
          grantedBy: 'entitlement',
          payload: {},
        },
        admit: async () => ({
          admitted: true,
          abort: async () => {},
          finalize: async (response: Response) => response,
        }),
      }),
      authorize: async () => {
        paymentAuthorizations += 1;
        return {
          authorized: false,
          response: new Response(null, { status: 503 }),
        } as const;
      },
    } as unknown as PaymentsRuntime;
    const entrypoint: EntrypointDef = {
      key: 'mpp-entitlement',
      price: '1',
      paymentProtocol: 'mpp',
      siwx: { enabled: true },
    };

    const authorization = await authorizeEntrypointRequest(
      new Request('https://agent.test/entrypoints/mpp-entitlement/invoke'),
      entrypoint,
      'invoke',
      runtimeWith(entrypoint, { mpp, payments })
    );

    expect(authorization.authorized).toBe(true);
    expect(mppAuthorizations).toBe(0);
    expect(paymentAuthorizations).toBe(0);
    if (!authorization.authorized) throw new Error('Expected SIWX reuse');
    expect((await authorization.admit()).admitted).toBe(true);
  });

  it('finalizes failed invocations so policy reservations are released', async () => {
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
            return response;
          },
        }),
      }),
    } as unknown as PaymentsRuntime;
    const entrypoint: EntrypointDef = {
      key: 'fails',
      handler: async () => {
        throw new Error('handler failed');
      },
    };

    const response = await invoke(
      new Request('https://agent.test/entrypoints/fails/invoke', {
        method: 'POST',
        body: JSON.stringify({ input: {} }),
      }),
      entrypoint.key,
      runtimeWith(entrypoint, { payments })
    );

    expect(response.status).toBe(500);
    expect(finalizedStatuses).toEqual([500]);
  });

  it('rejects malformed invoke JSON before authorization or execution', async () => {
    const finalizedStatuses: number[] = [];
    let executed = false;
    const payments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: true,
        admit: async () => ({
          admitted: true,
          abort: async () => {},
          finalize: async (response: Response) => {
            finalizedStatuses.push(response.status);
            return response;
          },
        }),
      }),
    } as unknown as PaymentsRuntime;
    const entrypoint: EntrypointDef = {
      key: 'json-only',
      handler: async () => {
        executed = true;
        return { output: {} };
      },
    };

    const response = await invoke(
      new Request('https://agent.test/entrypoints/json-only/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
      entrypoint.key,
      runtimeWith(entrypoint, { payments })
    );

    expect(response.status).toBe(400);
    expect(executed).toBe(false);
    expect(finalizedStatuses).toEqual([]);
  });

  it('rejects invalid stream input before authorization or execution', async () => {
    const finalizedStatuses: number[] = [];
    let executed = false;
    const payments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: true,
        admit: async () => ({
          admitted: true,
          abort: async () => {},
          finalize: async (response: Response) => {
            finalizedStatuses.push(response.status);
            return response;
          },
        }),
      }),
    } as unknown as PaymentsRuntime;
    const entrypoint: EntrypointDef = {
      key: 'validated-stream',
      input: z.object({ text: z.string() }),
      stream: async () => {
        executed = true;
        return { status: 'succeeded' };
      },
    };

    const response = await stream(
      new Request('https://agent.test/entrypoints/validated-stream/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      }),
      entrypoint.key,
      runtimeWith(entrypoint, { payments })
    );

    expect(response.status).toBe(400);
    expect(executed).toBe(false);
    expect(finalizedStatuses).toEqual([]);
  });
});

describe('canonical route plan', () => {
  const response = async () => new Response(null, { status: 204 });
  const handlers = {
    health: response,
    entrypoints: response,
    openapi: response,
    manifest: response,
    oasf: response,
    favicon: response,
    invoke: response,
    stream: response,
    tasks: response,
    getTask: response,
    listTasks: response,
    cancelTask: response,
    subscribeTask: response,
  };

  it('emits unique route identities under the configured base path', () => {
    const routes = createAgentRoutePlan({
      basePath: '/api/agent',
      handlers,
      hasTasks: true,
    });

    expect(new Set(routes.map(route => route.id)).size).toBe(routes.length);
    expect(routes.every(route => route.path.startsWith('/api/agent/'))).toBe(
      true
    );
    expect(routes.map(route => route.path)).toContain('/api/agent/tasks');
    expect(routes.map(route => route.path)).toContain(
      '/api/agent/openapi.json'
    );
  });

  it('does not advertise task routes without the A2A capability', () => {
    const routes = createAgentRoutePlan({
      basePath: '',
      handlers,
      hasTasks: false,
    });

    expect(routes.some(route => route.path.startsWith('/tasks'))).toBe(false);
  });
});
