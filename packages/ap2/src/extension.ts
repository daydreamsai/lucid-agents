import type {
  AgentCardWithEntrypoints,
  AgentRuntime,
  BuildContext,
  Extension,
} from '@lucid-agents/types/core';
import type { AP2Config, AP2Runtime } from '@lucid-agents/types/ap2';

import { createAgentCardWithAP2 } from './manifest';
import { createAP2Runtime } from './runtime';

export function ap2(options?: AP2Config): Extension<{ ap2?: AP2Runtime }> {
  let ap2Runtime: AP2Runtime | undefined;

  return {
    name: 'ap2',
    build(ctx: BuildContext): { ap2?: AP2Runtime } {
      // Only create runtime if explicit config provided
      if (options) {
        ap2Runtime = createAP2Runtime(options);
        return { ap2: ap2Runtime };
      }
      // No auto-detection - require explicit configuration
      return { ap2: undefined };
    },
    onManifestBuild(
      card: AgentCardWithEntrypoints,
      runtime: AgentRuntime
    ): AgentCardWithEntrypoints {
      // Only add AP2 extension if explicitly configured
      if (ap2Runtime?.config) {
        return createAgentCardWithAP2(card, ap2Runtime.config);
      }
      return card;
    },
  };
}
