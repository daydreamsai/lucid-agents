import type {
  AgentCardWithEntrypoints,
  AgentRuntime,
  BuildContext,
  Extension,
} from '@lucid-agents/types/core';
import type { TrustConfig } from '@lucid-agents/types/identity';

import { createAgentCardWithIdentity } from './manifest';

export function identity(options?: {
  trust?: TrustConfig;
}): Extension<{ trust?: TrustConfig }> {
  return {
    name: 'identity',
    build(_ctx: BuildContext): { trust?: TrustConfig } {
      return { trust: options?.trust };
    },
    onManifestBuild(
      card: AgentCardWithEntrypoints,
      _runtime: AgentRuntime
    ): AgentCardWithEntrypoints {
      if (options?.trust) {
        return createAgentCardWithIdentity(card, options.trust);
      }
      return card;
    },
  };
}
