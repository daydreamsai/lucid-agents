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
    expect(receivedPayment).toEqual({
      protocol: 'mpp',
      payer: '0xverified',
      amount: '2.5',
      currency: 'usd',
      network: 'eip155:84532',
    });
  });

  it('short-circuits protocol-managed MPP requests before entrypoint admission', async () => {
    const handled = new Response(null, {
      status: 204,
      headers: { 'Payment-Receipt': 'channel-opened' },
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

    expect(result).toEqual({ authorized: false, response: handled });
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

  it('rejects malformed invoke JSON without executing and finalizes the failure', async () => {
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
    expect(finalizedStatuses).toEqual([400]);
  });

  it('rejects invalid stream input before starting work and finalizes the failure', async () => {
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
    expect(finalizedStatuses).toEqual([400]);
  });
});

describe('canonical route plan', () => {
  const response = async () => new Response(null, { status: 204 });
  const handlers = {
    health: response,
    entrypoints: response,
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
