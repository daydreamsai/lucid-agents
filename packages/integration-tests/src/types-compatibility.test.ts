/**
 * Integration test: Cross-package type compatibility
 *
 * Tests that types from @lucid-agents/types work correctly across packages.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { http } from '@lucid-agents/http';
import { createAgent } from '@lucid-agents/core';
import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';

describe('Types Compatibility', () => {
  test('EntrypointDef should be compatible across packages', async () => {
    const runtime = await createAgent({
      name: 'types-test-agent',
      version: '1.0.0',
      description: 'Testing type compatibility',
    })
      .use(http())
      .build();

    // Create an EntrypointDef that satisfies the types package interface
    const entrypoint: EntrypointDef = {
      key: 'type-test',
      description: 'Test type compatibility',
      input: z.object({ value: z.string() }),
      handler: async ({ input }) => ({
        output: { result: String(input) },
      }),
    };

    // Add to runtime
    runtime.entrypoints.add(entrypoint);

    // Verify it was added correctly
    const snapshot = runtime.entrypoints.snapshot();
    expect(snapshot.some((e: { key: string }) => e.key === 'type-test')).toBe(true);
  });

  test('AgentRuntime interface should be implemented correctly', async () => {
    const runtime: AgentRuntime = await createAgent({
      name: 'runtime-interface-test',
      version: '1.0.0',
      description: 'Testing AgentRuntime interface',
    })
      .use(http())
      .build();

    // Verify required properties exist
    expect(runtime).toHaveProperty('agent');
    expect(runtime).toHaveProperty('entrypoints');
    expect(runtime.agent).toHaveProperty('config');
    expect(runtime.agent.config).toHaveProperty('meta');
    expect(runtime.agent.config.meta).toHaveProperty('name', 'runtime-interface-test');
  });

  test('handler context types should be correctly structured', async () => {
    const runtime = await createAgent({
      name: 'context-types-test',
      version: '1.0.0',
      description: 'Testing handler context types',
    })
      .use(http())
      .build();

    let receivedContext: unknown = null;

    const inputSchema = z.object({ data: z.string() });

    runtime.entrypoints.add({
      key: 'context-test',
      description: 'Test context structure',
      input: inputSchema,
      handler: async (ctx) => {
        receivedContext = ctx;
        return {
          output: { ok: true },
        };
      },
    });

    const entrypoint = runtime.entrypoints
      .snapshot()
      .find((e: { key: string }) => e.key === 'context-test');

    if (entrypoint?.handler) {
      await entrypoint.handler({
        key: 'context-test',
        input: { data: 'test' },
        signal: new AbortController().signal,
        metadata: { headers: new Headers() },
      });

      // Verify context structure
      expect(receivedContext).toHaveProperty('key', 'context-test');
      expect(receivedContext).toHaveProperty('input');
      expect(receivedContext).toHaveProperty('signal');
      expect(receivedContext).toHaveProperty('metadata');
    }
  });
});
