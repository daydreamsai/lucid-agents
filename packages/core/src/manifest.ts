import type {
  AgentManifest,
  BuildAgentManifestOptions,
  ManifestEntrypoint,
} from '@lucid-agents/types/core';
import { z } from 'zod';

/** Build the protocol-neutral discovery manifest owned by the core runtime. */
export function buildAgentManifest({
  meta,
  registry,
  origin,
  stateTransitionHistory = false,
}: BuildAgentManifestOptions): AgentManifest {
  const entrypoints: AgentManifest['entrypoints'] = {};
  const entrypointList = [...registry];
  const anyStreaming = entrypointList.some(entrypoint =>
    Boolean(entrypoint.stream)
  );

  for (const entrypoint of entrypointList) {
    const manifestEntrypoint: ManifestEntrypoint = {
      description: entrypoint.description,
      streaming: Boolean(entrypoint.stream),
      input_schema: entrypoint.input
        ? z.toJSONSchema(entrypoint.input)
        : undefined,
      output_schema: entrypoint.output
        ? z.toJSONSchema(entrypoint.output)
        : undefined,
    };
    entrypoints[entrypoint.key] = manifestEntrypoint;
  }

  const defaultInputModes = ['application/json'];
  const defaultOutputModes = ['application/json', 'text/plain'];
  const publicUrl = origin.endsWith('/') ? origin : `${origin}/`;

  return {
    protocolVersion: '1.0',
    name: meta.name,
    description: meta.description,
    url: publicUrl,
    supportedInterfaces: [{ url: publicUrl, protocolBinding: 'HTTP+JSON' }],
    version: meta.version,
    provider: undefined,
    capabilities: {
      streaming: anyStreaming,
      pushNotifications: false,
      stateTransitionHistory,
    },
    defaultInputModes,
    defaultOutputModes,
    skills: entrypointList.map(entrypoint => ({
      id: entrypoint.key,
      name: entrypoint.key,
      description: entrypoint.description,
      inputModes: defaultInputModes,
      outputModes: defaultOutputModes,
      streaming: Boolean(entrypoint.stream),
      x_input_schema: entrypoint.input
        ? z.toJSONSchema(entrypoint.input)
        : undefined,
      x_output_schema: entrypoint.output
        ? z.toJSONSchema(entrypoint.output)
        : undefined,
    })),
    supportsAuthenticatedExtendedCard: false,
    entrypoints,
  };
}
