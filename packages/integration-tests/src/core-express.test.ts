/**
 * Integration test: @lucid-agents/core + @lucid-agents/express
 *
 * Tests that the core agent runtime works correctly with the Express adapter.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { http } from '@lucid-agents/http';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/express';

describe('Core + Express Integration', () => {
  test('should create an agent with Express adapter and access entrypoints', async () => {
    // Create a minimal agent with HTTP extension
    const runtime = await createAgent({
      name: 'test-express-agent',
      version: '1.0.0',
      description: 'Test agent for Express integration',
    })
      .use(http())
      .build();

    // Create Express app from runtime
    const { addEntrypoint, runtime: agentRuntime } = await createAgentApp(runtime);

    // Add an entrypoint
    const inputSchema = z.object({
      text: z.string(),
    });

    addEntrypoint({
      key: 'reverse',
      description: 'Reverse the input text',
      input: inputSchema,
      handler: async ({ input }) => {
        const typedInput = input as z.infer<typeof inputSchema>;
        return {
          output: {
            reversed: typedInput.text.split('').reverse().join(''),
          },
        };
      },
    });

    // Verify entrypoint was registered
    const entrypoints = agentRuntime.entrypoints.snapshot();
    expect(entrypoints.some((e: { key: string }) => e.key === 'reverse')).toBe(true);

    // Verify the handler works
    const entrypoint = entrypoints.find((e: { key: string }) => e.key === 'reverse');
    expect(entrypoint).toBeDefined();

    if (entrypoint?.handler) {
      const result = await entrypoint.handler({
        key: 'reverse',
        input: { text: 'hello' },
        signal: new AbortController().signal,
        metadata: { headers: new Headers() },
      });
      expect(result.output).toHaveProperty('reversed', 'olleh');
    }
  });

  test('should create agent runtime with express adapter config', async () => {
    const runtime = await createAgent({
      name: 'express-meta-test',
      version: '3.0.0',
      description: 'Testing Express adapter metadata',
    })
      .use(http())
      .build();

    const { runtime: agentRuntime } = await createAgentApp(runtime);

    // Verify agent metadata is accessible via config
    expect(agentRuntime.agent.config.meta.name).toBe('express-meta-test');
    expect(agentRuntime.agent.config.meta.version).toBe('3.0.0');
    expect(agentRuntime.agent.config.meta.description).toBe('Testing Express adapter metadata');
  });
});
