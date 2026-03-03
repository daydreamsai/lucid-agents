/**
 * Integration test: @lucid-agents/core + @lucid-agents/hono
 *
 * Tests that the core agent runtime works correctly with the Hono adapter.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { http } from '@lucid-agents/http';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';

describe('Core + Hono Integration', () => {
  test('should create an agent with Hono adapter and invoke entrypoint', async () => {
    // Create a minimal agent with HTTP extension
    const runtime = await createAgent({
      name: 'test-hono-agent',
      version: '1.0.0',
      description: 'Test agent for Hono integration',
    })
      .use(http())
      .build();

    // Create Hono app from runtime
    const { app, addEntrypoint } = await createAgentApp(runtime);

    // Add an entrypoint
    const inputSchema = z.object({
      message: z.string(),
    });

    addEntrypoint({
      key: 'echo',
      description: 'Echo the input message',
      input: inputSchema,
      handler: async ({ input }) => {
        const typedInput = input as z.infer<typeof inputSchema>;
        return {
          output: {
            response: `Echo: ${typedInput.message}`,
          },
        };
      },
    });

    // Test health endpoint
    const healthRes = await app.request('/health');
    expect(healthRes.status).toBe(200);

    // Test manifest endpoint
    const manifestRes = await app.request('/.well-known/agent.json');
    expect(manifestRes.status).toBe(200);
    const manifest = await manifestRes.json();
    expect(manifest).toHaveProperty('name', 'test-hono-agent');
    expect(manifest).toHaveProperty('version', '1.0.0');

    // Test entrypoints list
    const entrypointsRes = await app.request('/entrypoints');
    expect(entrypointsRes.status).toBe(200);
    const entrypoints = await entrypointsRes.json();
    expect(Array.isArray(entrypoints.items)).toBe(true);
    expect(entrypoints.items.some((e: { key: string }) => e.key === 'echo')).toBe(true);

    // Test invoke endpoint
    const invokeRes = await app.request('/entrypoints/echo/invoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'Hello, World!' }),
    });
    expect(invokeRes.status).toBe(200);
    const invokeData = await invokeRes.json();
    expect(invokeData).toHaveProperty('output');
    expect(invokeData.output).toHaveProperty('response', 'Echo: Hello, World!');
  });

  test('should handle missing entrypoint gracefully', async () => {
    const runtime = await createAgent({
      name: 'test-missing-entrypoint',
      version: '1.0.0',
      description: 'Test missing entrypoint handling',
    })
      .use(http())
      .build();

    const { app } = await createAgentApp(runtime);

    const res = await app.request('/entrypoints/nonexistent/invoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    // Should return a client error status (4xx, not server error)
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('should expose agent-card.json at well-known path', async () => {
    const runtime = await createAgent({
      name: 'card-test-agent',
      version: '2.0.0',
      description: 'Agent with card support',
    })
      .use(http())
      .build();

    const { app } = await createAgentApp(runtime);

    const res = await app.request('/.well-known/agent-card.json');
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(card).toHaveProperty('name', 'card-test-agent');
    expect(card).toHaveProperty('version', '2.0.0');
  });
});
