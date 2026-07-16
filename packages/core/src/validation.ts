import type { AgentMeta } from '@lucid-agents/types/core';

/**
 * Validates required agent metadata and throws descriptive errors if invalid.
 * @param meta - Agent metadata to validate
 * @throws Error if required fields are missing
 */
export function validateAgentMetadata(meta: AgentMeta): void {
  const missingFields: string[] = [];
  if (!meta.name) missingFields.push('name');
  if (!meta.version) missingFields.push('version');
  if (!meta.description) missingFields.push('description');

  if (missingFields.length > 0) {
    console.error(
      '[agent-kit] Required agent metadata is missing:',
      missingFields.join(', ')
    );
    throw new Error(
      `Missing required agent metadata: ${missingFields.join(', ')}. ` +
        `Please ensure AGENT_NAME, AGENT_VERSION, and AGENT_DESCRIPTION are set in your .env file.`
    );
  }
}
