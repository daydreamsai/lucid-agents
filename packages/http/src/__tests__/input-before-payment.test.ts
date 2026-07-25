import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import type { MppRuntime } from '@lucid-agents/types/mpp';
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import type { AuthorizationRuntime } from '../authorization';
import { invoke } from '../invoke';
import { stream } from '../stream';

describe('HTTP input validation ordering', () => {
  it('rejects malformed invoke JSON before MPP verification can settle', async () => {
    let authorizationCalls = 0;
    const entrypoint: EntrypointDef = {
      key: 'paid',
      price: '1',
      paymentProtocol: 'mpp',
      handler: async () => ({ output: { ok: true } }),
    };
    const mpp = {
      credentialPurpose: () => 'content',
      requirements: () => ({
        required: true,
        amount: '1',
        currency: 'usd',
        intent: 'charge',
        methods: ['test'],
      }),
      authorize: async () => {
        authorizationCalls += 1;
        return {
          authorized: true as const,
          receipt: 'unexpected-settlement',
        };
      },
    } as unknown as MppRuntime;
    const runtime = {
      agent: {
        config: { meta: { name: 'test', version: '1.0.0' } },
        getEntrypoint: (key: string) =>
          key === entrypoint.key ? entrypoint : undefined,
        listEntrypoints: () => [entrypoint],
      },
      entrypoints: {
        add: () => {},
        list: () => [],
        snapshot: () => [entrypoint],
      },
      manifest: { build: () => ({}), invalidate: () => {} },
      close: async () => {},
      mpp,
    } as unknown as AgentRuntime<{ mpp: MppRuntime }>;

    const response = await invoke(
      new Request('https://agent.test/entrypoints/paid/invoke', {
        method: 'POST',
        headers: {
          Authorization: 'Payment structural-content-credential',
          'Content-Type': 'application/json',
        },
        body: '{',
      }),
      entrypoint.key,
      runtime as AuthorizationRuntime
    );

    expect(response.status).toBe(400);
    expect(authorizationCalls).toBe(0);
  });

  it('authorizes a bodyless MPP management credential before parsing entrypoint input', async () => {
    let authorizationCalls = 0;
    let handlerCalls = 0;
    const entrypoint: EntrypointDef = {
      key: 'managed-session',
      price: '1',
      paymentProtocol: 'mpp',
      input: z.object({ prompt: z.string() }),
      handler: async () => {
        handlerCalls += 1;
        return { output: { ok: true } };
      },
    };
    const mpp = {
      credentialPurpose: () => 'management',
      requirements: () => ({
        required: true,
        amount: '1',
        currency: 'usd',
        intent: 'session',
        methods: ['tempo'],
      }),
      authorize: async () => {
        authorizationCalls += 1;
        return {
          authorized: true as const,
          handled: new Response(null, {
            status: 204,
            headers: { 'Payment-Receipt': 'session-topped-up' },
          }),
        };
      },
    } as unknown as MppRuntime;
    const runtime = {
      agent: {
        config: { meta: { name: 'test', version: '1.0.0' } },
        getEntrypoint: (key: string) =>
          key === entrypoint.key ? entrypoint : undefined,
        listEntrypoints: () => [entrypoint],
      },
      entrypoints: {
        add: () => {},
        list: () => [],
        snapshot: () => [entrypoint],
      },
      manifest: { build: () => ({}), invalidate: () => {} },
      close: async () => {},
      mpp,
    } as unknown as AgentRuntime<{ mpp: MppRuntime }>;

    const response = await invoke(
      new Request('https://agent.test/entrypoints/managed-session/invoke', {
        method: 'POST',
        headers: {
          Authorization: 'Payment structural-management-credential',
        },
      }),
      entrypoint.key,
      runtime as AuthorizationRuntime
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Payment-Receipt')).toBe('session-topped-up');
    expect(authorizationCalls).toBe(1);
    expect(handlerCalls).toBe(0);
  });

  it('authorizes a bodyless MPP voucher refresh before parsing stream input', async () => {
    let authorizationCalls = 0;
    let streamCalls = 0;
    const entrypoint: EntrypointDef = {
      key: 'managed-stream',
      price: { stream: '1' },
      paymentProtocol: 'mpp',
      input: z.object({ prompt: z.string() }),
      stream: async () => {
        streamCalls += 1;
        return { status: 'succeeded' };
      },
    };
    const mpp = {
      credentialPurpose: () => 'management',
      requirements: () => ({
        required: true,
        amount: '1',
        currency: 'usd',
        intent: 'session',
        methods: ['tempo'],
      }),
      authorize: async () => {
        authorizationCalls += 1;
        return {
          authorized: true as const,
          handled: new Response(null, {
            status: 204,
            headers: { 'Payment-Receipt': 'voucher-refreshed' },
          }),
        };
      },
    } as unknown as MppRuntime;
    const runtime = {
      agent: {
        config: { meta: { name: 'test', version: '1.0.0' } },
        getEntrypoint: (key: string) =>
          key === entrypoint.key ? entrypoint : undefined,
        listEntrypoints: () => [entrypoint],
      },
      entrypoints: {
        add: () => {},
        list: () => [],
        snapshot: () => [entrypoint],
      },
      manifest: { build: () => ({}), invalidate: () => {} },
      close: async () => {},
      mpp,
    } as unknown as AgentRuntime<{ mpp: MppRuntime }>;

    const response = await stream(
      new Request('https://agent.test/entrypoints/managed-stream/stream', {
        method: 'POST',
        headers: {
          Authorization: 'Payment structural-voucher-credential',
        },
      }),
      entrypoint.key,
      runtime as AuthorizationRuntime
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Payment-Receipt')).toBe('voucher-refreshed');
    expect(authorizationCalls).toBe(1);
    expect(streamCalls).toBe(0);
  });
});
