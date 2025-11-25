import type {
  AgentCard,
  AgentCardWithEntrypoints,
  AgentCapabilities,
  AgentMeta,
  Manifest,
} from '@lucid-agents/types/a2a';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { FetchFunction } from '@lucid-agents/types/http';
import type { BuildAgentCardOptions } from '@lucid-agents/types/a2a';
import { z } from 'zod';

/**
 * Builds base Agent Card following A2A protocol.
 * Does NOT include payments, identity, or AP2 extensions.
 * Does NOT add pricing to entrypoints.
 */
export function buildAgentCard({
  meta,
  registry,
  origin,
}: BuildAgentCardOptions): AgentCardWithEntrypoints {
  const entrypoints: Manifest['entrypoints'] = {};
  const entrypointList: EntrypointDef[] = Array.from(registry);
  const anyStreaming = entrypointList.some(e => Boolean(e.stream));

  for (const e of entrypointList) {
    const manifestEntry: Manifest['entrypoints'][string] = {
      description: e.description,
      streaming: Boolean(e.stream),
      input_schema: e.input ? z.toJSONSchema(e.input) : undefined,
      output_schema: e.output ? z.toJSONSchema(e.output) : undefined,
    };
    // Note: pricing is NOT added here - that's payments package responsibility
    entrypoints[e.key] = manifestEntry;
  }

  const defaultInputModes = ['application/json'];
  const defaultOutputModes = ['application/json', 'text/plain'];
  const skills = entrypointList.map(e => ({
    id: e.key,
    name: e.key,
    description: e.description,
    inputModes: defaultInputModes,
    outputModes: defaultOutputModes,
    streaming: Boolean(e.stream),
    x_input_schema: e.input ? z.toJSONSchema(e.input) : undefined,
    x_output_schema: e.output ? z.toJSONSchema(e.output) : undefined,
  }));

  const capabilities: AgentCapabilities = {
    streaming: anyStreaming,
    pushNotifications: false,
    stateTransitionHistory: true,
  };

  const card: AgentCardWithEntrypoints = {
    protocolVersion: '1.0',
    name: meta.name,
    description: meta.description,
    url: origin.endsWith('/') ? origin : `${origin}/`,
    supportedInterfaces: [
      {
        url: origin.endsWith('/') ? origin : `${origin}/`,
        protocolBinding: 'HTTP+JSON',
      },
    ],
    version: meta.version,
    provider: undefined,
    capabilities,
    defaultInputModes,
    defaultOutputModes,
    skills,
    supportsAuthenticatedExtendedCard: false,
    entrypoints,
  };

  return card;
}

/**
 * Fetches Agent Card from another agent's well-known endpoint.
 * Tries multiple well-known paths for compatibility with different agent implementations.
 *
 * Per ERC-8004, the endpoint may already be a full URL to the agent card.
 * Per A2A spec section 5.3, the recommended discovery path is /.well-known/agent-card.json.
 */
export async function fetchAgentCard(
  baseUrl: string,
  fetchImpl?: FetchFunction
): Promise<AgentCard> {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  // Try multiple well-known paths for agent card discovery
  // Order: spec-recommended first, then alternatives, then legacy
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const agentcardUrls: string[] = [];

  // If baseUrl is already a full URL (starts with http:// or https://), try it directly first
  // Per ERC-8004, endpoint may already be full URL to agent card
  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    agentcardUrls.push(baseUrl);
  }

  // Spec-recommended discovery path (A2A Protocol section 5.3)
  agentcardUrls.push(`${normalizedBase}/.well-known/agent-card.json`);
  // Alternative well-known path
  agentcardUrls.push(`${normalizedBase}/.well-known/agent.json`);
  // Legacy path
  agentcardUrls.push(`${normalizedBase}/agentcard.json`);

  let lastError: Error | null = null;

  for (const agentcardUrl of agentcardUrls) {
    try {
      // Try to construct URL - if it fails, the URL might be malformed
      let url: URL;
      try {
        url = new URL(agentcardUrl);
      } catch {
        // If baseUrl wasn't absolute, try relative to it
        url = new URL(agentcardUrl, baseUrl);
      }

      const response = await fetchFn(url.toString());

      if (response.ok) {
        const json = await response.json();
        const card = parseAgentCard(json);
        const { entrypoints, ...agentCard } = card;
        return agentCard;
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

/**
 * Parses and validates Agent Card JSON structure.
 */
export function parseAgentCard(json: unknown): AgentCardWithEntrypoints {
  if (!json || typeof json !== 'object') {
    throw new Error('Agent Card must be an object');
  }

  const obj = json as Record<string, unknown>;

  if (typeof obj.name !== 'string') {
    throw new Error('Agent Card must have a name field');
  }

  return {
    name: obj.name,
    description:
      typeof obj.description === 'string' ? obj.description : undefined,
    url: typeof obj.url === 'string' ? obj.url : undefined,
    version: typeof obj.version === 'string' ? obj.version : undefined,
    provider: obj.provider as AgentCardWithEntrypoints['provider'],
    capabilities: obj.capabilities as AgentCardWithEntrypoints['capabilities'],
    defaultInputModes: Array.isArray(obj.defaultInputModes)
      ? (obj.defaultInputModes as string[])
      : undefined,
    defaultOutputModes: Array.isArray(obj.defaultOutputModes)
      ? (obj.defaultOutputModes as string[])
      : undefined,
    skills: Array.isArray(obj.skills)
      ? (obj.skills as AgentCardWithEntrypoints['skills'])
      : undefined,
    supportsAuthenticatedExtendedCard:
      typeof obj.supportsAuthenticatedExtendedCard === 'boolean'
        ? obj.supportsAuthenticatedExtendedCard
        : undefined,
    entrypoints: (obj.entrypoints as Manifest['entrypoints']) ?? {},
    payments: Array.isArray(obj.payments)
      ? (obj.payments as AgentCardWithEntrypoints['payments'])
      : undefined,
    registrations: Array.isArray(obj.registrations)
      ? (obj.registrations as AgentCardWithEntrypoints['registrations'])
      : undefined,
    trustModels: Array.isArray(obj.trustModels)
      ? (obj.trustModels as AgentCardWithEntrypoints['trustModels'])
      : undefined,
    ValidationRequestsURI:
      typeof obj.ValidationRequestsURI === 'string'
        ? obj.ValidationRequestsURI
        : undefined,
    ValidationResponsesURI:
      typeof obj.ValidationResponsesURI === 'string'
        ? obj.ValidationResponsesURI
        : undefined,
    FeedbackDataURI:
      typeof obj.FeedbackDataURI === 'string' ? obj.FeedbackDataURI : undefined,
  };
}

/**
 * Finds a skill by ID in an Agent Card.
 */
export function findSkill(
  card: AgentCard,
  skillId: string
): AgentCard['skills'][number] | undefined {
  return card.skills?.find(skill => skill.id === skillId);
}

/**
 * Checks if an agent supports a specific capability.
 *
 * @param card - Agent card
 * @param capability - Capability to check ('streaming' | 'pushNotifications' | 'stateTransitionHistory')
 * @returns true if the capability is supported
 */
export function hasCapability(
  card: AgentCard | null,
  capability: keyof AgentCapabilities
): boolean {
  if (!card?.capabilities) {
    return false;
  }
  return Boolean(card.capabilities[capability]);
}

/**
 * Checks if an agent has a specific skill tag.
 *
 * @param card - Agent card
 * @param tag - Skill tag to check
 * @returns true if the agent has the tag
 */
export function hasSkillTag(card: AgentCard | null, tag: string): boolean {
  if (!card?.skills) {
    return false;
  }
  return card.skills.some(skill =>
    skill.tags?.some(t => t.toLowerCase() === tag.toLowerCase())
  );
}

/**
 * Checks if an agent supports payments.
 *
 * @param card - Agent card
 * @returns true if the agent has payment methods configured
 */
export function supportsPayments(card: AgentCard | null): boolean {
  return Boolean(card?.payments && card.payments.length > 0);
}

/**
 * Checks if an agent has trust/identity information.
 *
 * @param card - Agent card
 * @returns true if the agent has trust models or registrations
 */
export function hasTrustInfo(card: AgentCard | null): boolean {
  return Boolean(card?.trustModels?.length || card?.registrations?.length);
}
