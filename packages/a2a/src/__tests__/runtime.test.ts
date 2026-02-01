import type { AgentRuntime } from '@lucid-agents/types/core';
import { describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';

import { createA2ARuntime } from '../runtime';

describe('createA2ARuntime', () => {
  const mockRuntime: Partial<AgentRuntime> = {
    agent: {
      config: {
        meta: {
          name: 'test-agent',
          version: '1.0.0',
          description: 'Test agent',
        },
      },
      addEntrypoint: () => {},
      getEntrypoint: () => undefined,
      listEntrypoints: () => [
        {
          key: 'echo',
          description: 'Echo endpoint',
          input: z.object({ text: z.string() }),
          output: z.object({ text: z.string() }),
          handler: async () => ({ output: { text: 'echo' } }),
        },
      ],
    },
    entrypoints: {
      add: () => {},
      list: () => [],
      snapshot: () => [
        {
          key: 'echo',
          description: 'Echo endpoint',
          input: z.object({ text: z.string() }),
          output: z.object({ text: z.string() }),
          handler: async () => ({ output: { text: 'echo' } }),
        },
      ],
    },
  };

  it('creates A2A runtime', () => {
    const a2a = createA2ARuntime(mockRuntime as AgentRuntime);

    expect(a2a).toBeDefined();
    expect(a2a?.buildCard).toBeDefined();
    expect(a2a?.fetchCard).toBeDefined();
    expect(a2a?.client).toBeDefined();
  });

  it('buildCard builds base Agent Card', () => {
    const a2a = createA2ARuntime(mockRuntime as AgentRuntime);

    const card = a2a?.buildCard('https://agent.example.com');

    expect(card).toBeDefined();
    expect(card?.name).toBe('test-agent');
    expect(card?.skills).toBeDefined();
    expect(card?.entrypoints).toBeDefined();
    expect(card?.payments).toBeUndefined();
  });

  it('fetchCard fetches another agent card', async () => {
    const mockCard = {
      name: 'remote-agent',
      version: '1.0.0',
      url: 'https://remote.example.com/',
      skills: [],
      entrypoints: {},
    };

    const mockFetch = mock(async (url: string | URL | Request) => {
      const urlStr =
        typeof url === 'string'
          ? url
          : url instanceof URL
            ? url.toString()
            : (url as Request).url;
      if (urlStr.includes('/.well-known/agent-card.json')) {
        return new Response(JSON.stringify(mockCard), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected URL: ${urlStr}`);
    });

    const a2a = createA2ARuntime(mockRuntime as AgentRuntime);

    const card = await a2a?.fetchCard(
      'https://remote.example.com',
      mockFetch as unknown as typeof fetch
    );

    expect(card).toBeDefined();
    expect(card?.name).toBe('remote-agent');
  });

  it('client provides invoke and stream utilities', () => {
    const a2a = createA2ARuntime(mockRuntime as AgentRuntime);

    expect(a2a?.client).toBeDefined();
    expect(a2a?.client.invoke).toBeDefined();
    expect(a2a?.client.stream).toBeDefined();
    expect(a2a?.client.fetchAndInvoke).toBeDefined();
  });
});
