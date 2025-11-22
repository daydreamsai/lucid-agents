import type {
  AgentCardWithEntrypoints,
  AgentCapabilities,
  AgentMeta,
  Manifest,
  FetchFunction,
  EntrypointDef,
} from '@lucid-agents/types/core';
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
    name: meta.name,
    description: meta.description,
    url: origin.endsWith('/') ? origin : `${origin}/`,
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
 */
export async function fetchAgentCard(
  baseUrl: string,
  fetchImpl?: FetchFunction
): Promise<AgentCardWithEntrypoints> {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = new URL('/.well-known/agent-card.json', baseUrl);
  const response = await fetchFn(url.toString());

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Agent Card: ${response.status} ${response.statusText}`
    );
  }

  const json = await response.json();
  return parseAgentCard(json);
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
  card: AgentCardWithEntrypoints,
  skillId: string
): AgentCardWithEntrypoints['skills'][number] | undefined {
  return card.skills?.find(skill => skill.id === skillId);
}
