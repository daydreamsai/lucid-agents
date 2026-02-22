import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type {
  AgentRuntime,
  BuildContext,
  Extension,
} from '@lucid-agents/types/core';
import type {
  XMPTInboxHandler,
  XMPTMessage,
  XMPTRuntime,
  XMPTStore,
} from '@lucid-agents/types/xmpt';
import { z } from 'zod';

import { XMPT_DISCOVERY_TAG, XMPT_INBOX_DISCOVERY_TAG } from './client';
import { createXMPTRuntime, DEFAULT_XMPT_INBOX_SKILL_ID } from './runtime';

export type XMPTExtensionOptions = {
  inbox?: {
    key?: string;
    handler?: XMPTInboxHandler;
  };
  store?: XMPTStore;
  discovery?: {
    preferredSkillId?: string;
  };
};

export function xmpt(
  options: XMPTExtensionOptions = {}
): Extension<{ xmpt: XMPTRuntime }> {
  const inboxKey = options.inbox?.key?.trim() || DEFAULT_XMPT_INBOX_SKILL_ID;

  if (options.inbox?.key !== undefined && !options.inbox.key.trim()) {
    throw new Error(
      '[XMPT_INVALID_CONFIG] inbox.key must be a non-empty string'
    );
  }

  if (
    options.inbox?.handler !== undefined &&
    typeof options.inbox.handler !== 'function'
  ) {
    throw new Error('[XMPT_INVALID_CONFIG] inbox.handler must be a function');
  }

  if (
    options.discovery?.preferredSkillId !== undefined &&
    !options.discovery.preferredSkillId.trim()
  ) {
    throw new Error(
      '[XMPT_INVALID_CONFIG] discovery.preferredSkillId must be a non-empty string'
    );
  }

  const messageSchema = z.object({
    id: z.string().min(1),
    threadId: z.string().min(1),
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    content: z
      .object({
        text: z.string().optional(),
        data: z.unknown().optional(),
        mime: z.string().optional(),
      })
      .refine(
        value =>
          value.text !== undefined ||
          value.data !== undefined ||
          value.mime !== undefined,
        {
          message: 'content must include text, data, or mime',
        }
      ),
    metadata: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string().min(1),
  });

  return {
    name: 'xmpt',

    build(_ctx: BuildContext): { xmpt: XMPTRuntime } {
      return {
        xmpt: {} as XMPTRuntime,
      };
    },

    onBuild(runtime: AgentRuntime): void {
      const xmptRuntime = createXMPTRuntime({
        runtime,
        inboxSkillId: inboxKey,
        inboxHandler: options.inbox?.handler,
        store: options.store,
        preferredSkillId: options.discovery?.preferredSkillId,
      });

      runtime.xmpt = xmptRuntime;

      runtime.entrypoints.add({
        key: inboxKey,
        description: 'XMPT inbox for receiving messages from peer agents',
        input: messageSchema,
        output: messageSchema.nullable(),
        handler: async ctx => {
          const reply = await runtime.xmpt!.receive(ctx.input as XMPTMessage);
          return {
            output: reply ?? null,
            usage: { total_tokens: 0 },
          };
        },
      });
    },

    onManifestBuild(
      card: AgentCardWithEntrypoints,
      _runtime: AgentRuntime
    ): AgentCardWithEntrypoints {
      const skills = card.skills ?? [];
      const inboxSkill = skills.find(skill => skill.id === inboxKey);
      if (!inboxSkill) {
        return card;
      }

      const tags = new Set<string>(inboxSkill.tags ?? []);
      tags.add(XMPT_DISCOVERY_TAG);
      tags.add(XMPT_INBOX_DISCOVERY_TAG);
      inboxSkill.tags = Array.from(tags);
      inboxSkill.x_xmpt = { inbox: true };

      return card;
    },
  };
}
