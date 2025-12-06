import { describe, it, expect, mock } from 'bun:test';
import { fetchAgentCardWithEntrypoints } from './agent-card';

const mockAgentCard = {
  name: 'Test Agent',
  url: 'https://example.com/agent',
  version: '1.0.0',
  capabilities: {},
  skills: [],
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
  entrypoints: {
    default: {
      url: 'https://example.com/agent/default',
      description: 'Default entrypoint',
    },
  },
};

function createMockFetch(responses: Map<string, { ok: boolean; status: number; json?: unknown }>) {
  return async (url: string | URL | Request) => {
    const urlStr = url.toString();
    const response = responses.get(urlStr);

    if (!response) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => {
          throw new Error('Not found');
        },
      };
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.ok ? 'OK' : 'Error',
      json: async () => response.json,
    };
  };
}

describe('fetchAgentCardWithEntrypoints', () => {
  it('fetches agent card from well-known path', async () => {
    const responses = new Map([
      [
        'https://example.com/.well-known/agent-card.json',
        { ok: true, status: 200, json: mockAgentCard },
      ],
    ]);

    const result = await fetchAgentCardWithEntrypoints(
      'https://example.com',
      createMockFetch(responses) as typeof fetch
    );

    expect(result.name).toBe('Test Agent');
    expect(result.entrypoints).toBeDefined();
  });

  it('tries multiple well-known paths', async () => {
    const responses = new Map([
      [
        'https://example.com/.well-known/agent.json',
        { ok: true, status: 200, json: mockAgentCard },
      ],
    ]);

    const result = await fetchAgentCardWithEntrypoints(
      'https://example.com',
      createMockFetch(responses) as typeof fetch
    );

    expect(result.name).toBe('Test Agent');
  });

  it('fetches from agentcard.json fallback path', async () => {
    const responses = new Map([
      [
        'https://example.com/agentcard.json',
        { ok: true, status: 200, json: mockAgentCard },
      ],
    ]);

    const result = await fetchAgentCardWithEntrypoints(
      'https://example.com',
      createMockFetch(responses) as typeof fetch
    );

    expect(result.name).toBe('Test Agent');
  });

  it('fetches directly from URL if it looks like a direct URL', async () => {
    const responses = new Map([
      [
        'https://example.com/my-agent-card.json',
        { ok: true, status: 200, json: mockAgentCard },
      ],
    ]);

    const result = await fetchAgentCardWithEntrypoints(
      'https://example.com/my-agent-card.json',
      createMockFetch(responses) as typeof fetch
    );

    expect(result.name).toBe('Test Agent');
  });

  it('normalizes trailing slash in base URL', async () => {
    const responses = new Map([
      [
        'https://example.com/.well-known/agent-card.json',
        { ok: true, status: 200, json: mockAgentCard },
      ],
    ]);

    const result = await fetchAgentCardWithEntrypoints(
      'https://example.com/',
      createMockFetch(responses) as typeof fetch
    );

    expect(result.name).toBe('Test Agent');
  });

  it('throws when all paths fail with 404', async () => {
    const responses = new Map<string, { ok: boolean; status: number; json?: unknown }>();

    await expect(
      fetchAgentCardWithEntrypoints(
        'https://example.com',
        createMockFetch(responses) as typeof fetch
      )
    ).rejects.toThrow('Failed to fetch Agent Card');
  });

  it('throws with error details on non-404 failures', async () => {
    const responses = new Map([
      [
        'https://example.com/.well-known/agent-card.json',
        { ok: false, status: 500, json: undefined },
      ],
    ]);

    await expect(
      fetchAgentCardWithEntrypoints(
        'https://example.com',
        createMockFetch(responses) as typeof fetch
      )
    ).rejects.toThrow('500');
  });

  it('throws when fetch is not available', async () => {
    const originalFetch = globalThis.fetch;
    // @ts-expect-error - intentionally setting to undefined
    globalThis.fetch = undefined;

    try {
      await expect(fetchAgentCardWithEntrypoints('https://example.com')).rejects.toThrow(
        'fetch is not available'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles network errors gracefully', async () => {
    const mockFetchWithError = async () => {
      throw new Error('Network error');
    };

    await expect(
      fetchAgentCardWithEntrypoints(
        'https://example.com',
        mockFetchWithError as typeof fetch
      )
    ).rejects.toThrow();
  });

  it('parses agent card with entrypoints', async () => {
    const cardWithMultipleEntrypoints = {
      ...mockAgentCard,
      entrypoints: {
        default: {
          url: 'https://example.com/agent/default',
          description: 'Default entrypoint',
        },
        secondary: {
          url: 'https://example.com/agent/secondary',
          description: 'Secondary entrypoint',
        },
      },
    };

    const responses = new Map([
      [
        'https://example.com/.well-known/agent-card.json',
        { ok: true, status: 200, json: cardWithMultipleEntrypoints },
      ],
    ]);

    const result = await fetchAgentCardWithEntrypoints(
      'https://example.com',
      createMockFetch(responses) as typeof fetch
    );

    expect(result.entrypoints?.default).toBeDefined();
    expect(result.entrypoints?.secondary).toBeDefined();
  });
});
