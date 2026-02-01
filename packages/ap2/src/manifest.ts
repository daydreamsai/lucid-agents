import type {
  AgentCapabilities,
  AgentCardWithEntrypoints,
} from '@lucid-agents/types/a2a';
import type {
  AP2Config,
  AP2ExtensionDescriptor,
  AP2Role,
} from '@lucid-agents/types/ap2';

import { AP2_EXTENSION_URI } from './types';

/**
 * Creates a new Agent Card with AP2 extension added.
 * Immutable - returns new card, doesn't mutate input.
 */
export function createAgentCardWithAP2(
  card: AgentCardWithEntrypoints,
  ap2Config: AP2Config
): AgentCardWithEntrypoints {
  if (!ap2Config.roles?.length) {
    return card;
  }

  const [firstRole, ...restRoles] = ap2Config.roles;
  if (!firstRole) {
    throw new Error('AP2 roles must contain at least one entry');
  }

  const roles: [AP2Role, ...AP2Role[]] = [firstRole, ...restRoles];
  const extension: AP2ExtensionDescriptor = {
    uri: AP2_EXTENSION_URI,
    description: ap2Config.description ?? 'Agent Payments Protocol (AP2)',
    required: ap2Config.required ?? roles.includes('merchant'),
    params: { roles },
  };

  const existing = card.capabilities?.extensions ?? [];
  const withoutAp2 = existing.filter(
    ext => !('uri' in ext && ext.uri === AP2_EXTENSION_URI)
  );

  const capabilities: AgentCapabilities = {
    ...card.capabilities,
    extensions: [...withoutAp2, extension],
  };

  return {
    ...card,
    capabilities,
  };
}
