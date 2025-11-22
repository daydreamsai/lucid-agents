/**
 * Type inference test for addEntrypoint
 * This file tests that TypeScript properly infers input/output types from Zod schemas
 */

import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { createAgentCore } from '../core/agent';

describe('EntrypointDef type inference', () => {
  test('input should be strongly typed when Zod schema provided', async () => {
    const core = createAgentCore({
      meta: { name: 'test', version: '1.0.0' },
    });

    const inputSchema = z.object({
      message: z.string(),
      count: z.number().optional(),
    });

    core.addEntrypoint({
      key: 'chat',
      description: 'Chat endpoint',
      input: inputSchema,
      handler: async ({ input }) => {
        const messageLength = input.message.length;
        const countValue = input.count ?? 0;

        return {
          output: {
            response: `Received: ${input.message}`,
            length: messageLength,
            count: countValue,
          },
        };
      },
    });

    // Test that handler receives properly typed input
    const entrypoint = core.getEntrypoint('chat');
    expect(entrypoint).toBeDefined();
    if (!entrypoint?.handler) {
      throw new Error('Handler not found');
    }

    const result = await entrypoint.handler({
      key: 'chat',
      input: {
        message: 'hello',
        count: 5,
      },
      signal: new AbortController().signal,
      metadata: { headers: new Headers() },
    });

    expect(result.output).toEqual({
      response: 'Received: hello',
      length: 5,
      count: 5,
    });
  });

  test('output should be strongly typed when Zod schema provided', async () => {
    const core = createAgentCore({
      meta: { name: 'test', version: '1.0.0' },
    });

    core.addEntrypoint({
      key: 'generate',
      input: z.object({ prompt: z.string() }),
      output: z.object({
        text: z.string(),
        tokens: z.number(),
      }),
      handler: async ({ input }) => {
        // Output type should be enforced
        return {
          output: {
            text: `Generated from: ${input.prompt}`,
            tokens: 100,
            // Uncommenting this should cause a type error:
            // invalid: 'field',
          },
        };
      },
    });

    // Test that handler receives properly typed input and returns properly typed output
    const entrypoint = core.getEntrypoint('generate');
    expect(entrypoint).toBeDefined();
    if (!entrypoint?.handler) {
      throw new Error('Handler not found');
    }

    const result = await entrypoint.handler({
      key: 'generate',
      input: { prompt: 'test' },
      signal: new AbortController().signal,
      metadata: { headers: new Headers() },
    });

    expect(result.output).toHaveProperty('text');
    expect(result.output).toHaveProperty('tokens');
  });

  test('complex nested schemas should be properly inferred', async () => {
    const core = createAgentCore({
      meta: { name: 'test', version: '1.0.0' },
    });

    core.addEntrypoint({
      key: 'analyze',
      input: z.object({
        user: z.object({
          name: z.string(),
          age: z.number(),
        }),
        preferences: z.array(z.string()),
      }),
      handler: async ({ input }) => {
        // These should all be properly typed:
        const userName = input.user.name; // Should not error
        const userAge = input.user.age; // Should not error
        const firstPref = input.preferences[0]; // Should not error

        return {
          output: {
            summary: `${userName} (${userAge}) likes ${firstPref}`,
          },
        };
      },
    });

    // Test that handler receives properly typed complex nested input
    const entrypoint = core.getEntrypoint('analyze');
    expect(entrypoint).toBeDefined();
    if (!entrypoint?.handler) {
      throw new Error('Handler not found');
    }

    const result = await entrypoint.handler({
      key: 'analyze',
      input: {
        user: { name: 'Alice', age: 30 },
        preferences: ['coding', 'music'],
      },
      signal: new AbortController().signal,
      metadata: { headers: new Headers() },
    });

    expect(result.output).toEqual({
      summary: 'Alice (30) likes coding',
    });
  });
});
