import { parseAgentCard } from '@lucid-agents/a2a';
import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { FetchFunction } from '@lucid-agents/types/http';

export async function fetchAgentCardWithEntrypoints(
  baseUrl: string,
  fetchImpl?: FetchFunction
): Promise<AgentCardWithEntrypoints> {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const normalizedBase = baseUrl.replace(/\/$/, '');
  const agentcardUrls: string[] = [];

  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    agentcardUrls.push(baseUrl);
  }

  agentcardUrls.push(`${normalizedBase}/.well-known/agent-card.json`);
  agentcardUrls.push(`${normalizedBase}/.well-known/agent.json`);
  agentcardUrls.push(`${normalizedBase}/agentcard.json`);

  let lastError: Error | null = null;

  for (const agentcardUrl of agentcardUrls) {
    try {
      let url: URL;
      try {
        url = new URL(agentcardUrl);
      } catch {
        url = new URL(agentcardUrl, baseUrl);
      }

      const response = await fetchFn(url.toString());
      if (response.ok) {
        const json = await response.json();
        return parseAgentCard(json);
      }

      if (response.status !== 404) {
        lastError = new Error(
          `Failed to fetch Agent Card: ${response.status} ${response.statusText}`
        );
      }
    } catch (error) {
      if (!lastError) {
        lastError =
          error instanceof Error
            ? error
            : new Error('Failed to fetch Agent Card');
      }
    }
  }

  throw (
    lastError ||
    new Error(
      `Failed to fetch Agent Card from any well-known path. Tried: ${agentcardUrls.join(', ')}`
    )
  );
}
