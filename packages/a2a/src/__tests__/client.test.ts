import { describe, expect, it, mock } from 'bun:test';
import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';

import { fetchAndInvoke, invokeAgent, streamAgent } from '../client';
import { buildAgentCard } from '../card';
import { z } from 'zod';

describe('invokeAgent', () => {
  const card: AgentCardWithEntrypoints = {
    name: 'test-agent',
    version: '1.0.0',
    url: 'https://agent.example.com/',
    skills: [
      {
        id: 'echo',
        name: 'echo',
        description: 'Echo endpoint',
      },
    ],
    entrypoints: {
      echo: {
        description: 'Echo endpoint',
        streaming: false,
        input_schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
        },
        output_schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
        },
      },
    },
  };

  it('calls agent using Agent Card', async () => {
    const mockResponse = {
      run_id: 'test-run',
      status: 'completed',
      output: { text: 'echoed' },
    };

    const mockFetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
      if (urlStr.includes('/entrypoints/echo/invoke')) {
        expect(init?.method).toBe('POST');
        const body = init?.body ? JSON.parse(init.body as string) : {};
        expect(body.input).toEqual({ text: 'hello' });
        return new Response(JSON.stringify(mockResponse), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected URL: ${urlStr}`);
    });

    const result = await invokeAgent(card, 'echo', { text: 'hello' }, mockFetch as unknown as typeof fetch);

    expect(result).toBeDefined();
    expect(result.output).toEqual({ text: 'echoed' });
    expect(mockFetch).toHaveBeenCalled();
  });

  it('handles errors when skill not found', async () => {
    await expect(invokeAgent(card, 'nonexistent', {})).rejects.toThrow();
  });

  it('handles network errors', async () => {
    const mockFetch = mock(async () => {
      throw new Error('Network error');
    });

    await expect(invokeAgent(card, 'echo', { text: 'hello' }, mockFetch as unknown as typeof fetch)).rejects.toThrow(
      'Network error'
    );
  });

  it('works with payment-enabled fetch', async () => {
    const mockResponse = {
      run_id: 'test-run',
      status: 'completed',
      output: { text: 'echoed' },
    };

    const mockFetch = mock(async () => {
      return new Response(JSON.stringify(mockResponse), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await invokeAgent(card, 'echo', { text: 'hello' }, mockFetch as unknown as typeof fetch);

    expect(result).toBeDefined();
    expect(result.output).toEqual({ text: 'echoed' });
  });
});

describe('streamAgent', () => {
  const card: AgentCardWithEntrypoints = {
    name: 'test-agent',
    version: '1.0.0',
    url: 'https://agent.example.com/',
    skills: [
      {
        id: 'stream',
        name: 'stream',
        description: 'Stream endpoint',
        streaming: true,
      },
    ],
    entrypoints: {
      stream: {
        description: 'Stream endpoint',
        streaming: true,
        input_schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
        },
      },
    },
  };

  it('streams from agent using Agent Card', async () => {
    const mockEvents = [
      'event: run-start\n',
      'data: {"run_id":"test-run"}\n\n',
      'event: delta\n',
      'data: {"text":"hello"}\n\n',
      'event: run-end\n',
      'data: {"status":"completed"}\n\n',
    ].join('');

    const mockFetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
      if (urlStr.includes('/entrypoints/stream/stream')) {
        return new Response(mockEvents, {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }
      throw new Error(`Unexpected URL: ${urlStr}`);
    });

    const events: Array<{ type: string; data: unknown }> = [];
    const emit = mock((chunk: { type: string; data: unknown }) => {
      events.push(chunk);
    });

    await streamAgent(card, 'stream', { text: 'hello' }, emit, mockFetch as unknown as typeof fetch);

    expect(events.length).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('handles errors when skill not found', async () => {
    const emit = mock(() => {});
    await expect(streamAgent(card, 'nonexistent', {}, emit)).rejects.toThrow();
  });
});

describe('fetchAndInvoke', () => {
  it('fetches card and invokes agent', async () => {
    const mockCard: AgentCardWithEntrypoints = {
      name: 'remote-agent',
      version: '1.0.0',
      url: 'https://remote.example.com/',
      skills: [
        {
          id: 'echo',
          name: 'echo',
        },
      ],
      entrypoints: {
        echo: {
          description: 'Echo endpoint',
          streaming: false,
          input_schema: {},
          output_schema: {},
        },
      },
    };

    const mockResponse = {
      run_id: 'test-run',
      status: 'completed',
      output: { text: 'echoed' },
    };

    let callCount = 0;
    const mockFetch = mock(async (url: string | URL | Request) => {
      callCount++;
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
      if (urlStr.includes('/.well-known/agent-card.json')) {
        return new Response(JSON.stringify(mockCard), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/entrypoints/echo/invoke')) {
        return new Response(JSON.stringify(mockResponse), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Return 404 for other URL attempts (fallback paths)
      return new Response('Not Found', { status: 404 });
    });

    const result = await fetchAndInvoke('https://remote.example.com', 'echo', { text: 'hello' }, mockFetch as unknown as typeof fetch);

    expect(result).toBeDefined();
    expect(result.output).toEqual({ text: 'echoed' });
    // fetchAgentCard may try multiple URLs, so we check it was called at least once for card and once for invoke
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('handles card fetch errors', async () => {
    const mockFetch = mock(async () => {
      throw new Error('Card fetch failed');
    });

    await expect(fetchAndInvoke('https://remote.example.com', 'echo', {}, mockFetch as unknown as typeof fetch)).rejects.toThrow(
      'Card fetch failed'
    );
  });
});

