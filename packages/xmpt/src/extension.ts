import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { AgentRuntime, BuildContext, Extension } from '@lucid-agents/types/core';
import type { XMPTInboxHandler, XMPTRuntime, XMPTStore } from '@lucid-agents/types/xmpt';
import { createXMPTRuntime } from './runtime';

export type XMPTConfig = {
  inbox?: {
    key?: string;
    handler?: XMPTInboxHandler;
  };
  store?: XMPTStore;
};

export function xmpt(options?: XMPTConfig): Extension<{ xmpt: XMPTRuntime }> {
  let xmptRuntime: XMPTRuntime;
  const inboxKey = options?.inbox?.key ?? 'xmpt-inbox';

  return {
    name: 'xmpt',
    build(_ctx: BuildContext): { xmpt: XMPTRuntime } {
      xmptRuntime = createXMPTRuntime({
        inboxKey,
        handler: options?.inbox?.handler,
        store: options?.store,
      });
      return { xmpt: xmptRuntime };
    },
    onManifestBuild(
      card: AgentCardWithEntrypoints,
      _runtime: AgentRuntime
    ): AgentCardWithEntrypoints {
      // Add xmpt-inbox skill to manifest for discoverability
      const skills = (card.skills ?? []).filter((s) => s.id !== inboxKey);
      return {
        ...card,
        skills: [
          ...skills,
          {
            id: inboxKey,
            name: 'XMPT Inbox',
            description: 'Agent-to-agent message inbox (XMPT)',
            tags: ['xmpt', 'messaging', 'inbox'],
          },
        ],
      };
    },
  };
}
