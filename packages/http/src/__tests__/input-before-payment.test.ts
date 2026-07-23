import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import type { MppRuntime } from '@lucid-agents/types/mpp';
import { describe, expect, it } from 'bun:test';

import type { AuthorizationRuntime } from '../authorization';
import { invoke } from '../invoke';

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
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
      entrypoint.key,
      runtime as AuthorizationRuntime
    );

    expect(response.status).toBe(400);
    expect(authorizationCalls).toBe(0);
  });
});
