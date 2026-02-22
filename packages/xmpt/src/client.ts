import { randomUUID } from 'node:crypto';

import type { AgentCard } from '@lucid-agents/types/a2a';
import type {
  XMPTMessage,
  XMPTPeer,
  XMPTSendInput,
} from '@lucid-agents/types/xmpt';

import { XMPTError } from './errors';

export const XMPT_INBOX_DISCOVERY_TAG = 'xmpt-inbox';
export const XMPT_DISCOVERY_TAG = 'xmpt';

export function resolvePeerUrl(peer: XMPTPeer): string | undefined {
  if ('url' in peer) {
    return peer.url;
  }
  return peer.card.url;
}

export function resolveInboxSkillId(
  card: AgentCard,
  defaultInboxSkillId: string,
  preferredSkillId?: string
): string | undefined {
  const skills = card.skills ?? [];

  if (preferredSkillId) {
    const preferred = skills.find(skill => skill.id === preferredSkillId);
    if (preferred) {
      return preferred.id;
    }
  }

  const defaultSkill = skills.find(skill => skill.id === defaultInboxSkillId);
  if (defaultSkill) {
    return defaultSkill.id;
  }

  const taggedSkill = skills.find(skill =>
    skill.tags?.some(tag => {
      const normalized = tag.toLowerCase();
      return (
        normalized === XMPT_DISCOVERY_TAG ||
        normalized === XMPT_INBOX_DISCOVERY_TAG
      );
    })
  );

  return taggedSkill?.id;
}

export function normalizeXMPTMessage(
  input: XMPTSendInput,
  defaults: {
    from?: string;
    to?: string;
    now: string;
  }
): XMPTMessage {
  assertXMPTContent(input.content);

  const id = normalizeOptionalString(input.id) ?? randomUUID();
  const threadId = normalizeOptionalString(input.threadId) ?? randomUUID();

  return {
    id,
    threadId,
    from: normalizeOptionalString(input.from) ?? defaults.from,
    to: normalizeOptionalString(input.to) ?? defaults.to,
    content: input.content,
    metadata: input.metadata,
    createdAt: normalizeOptionalString(input.createdAt) ?? defaults.now,
  };
}

export function parseXMPTMessage(payload: unknown): XMPTMessage {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new XMPTError(
      'XMPT_INVALID_MESSAGE_PAYLOAD',
      'Message payload must be an object'
    );
  }

  const value = payload as Record<string, unknown>;

  const id = asRequiredString(value.id, 'id');
  const threadId = asRequiredString(value.threadId, 'threadId');
  const createdAt = asRequiredString(value.createdAt, 'createdAt');

  const content = value.content;
  assertXMPTContent(content);

  const metadata =
    value.metadata && typeof value.metadata === 'object'
      ? (value.metadata as Record<string, unknown>)
      : undefined;

  return {
    id,
    threadId,
    from: asOptionalString(value.from),
    to: asOptionalString(value.to),
    content,
    metadata,
    createdAt,
  };
}

function assertXMPTContent(
  content: unknown
): asserts content is XMPTMessage['content'] {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new XMPTError(
      'XMPT_INVALID_MESSAGE_PAYLOAD',
      'Message content must be an object'
    );
  }

  const value = content as Record<string, unknown>;

  if (
    value.text === undefined &&
    value.data === undefined &&
    value.mime === undefined
  ) {
    throw new XMPTError(
      'XMPT_INVALID_MESSAGE_PAYLOAD',
      'Message content requires at least one of text, data, or mime'
    );
  }

  if (value.text !== undefined && typeof value.text !== 'string') {
    throw new XMPTError(
      'XMPT_INVALID_MESSAGE_PAYLOAD',
      'Message content.text must be a string'
    );
  }

  if (value.mime !== undefined && typeof value.mime !== 'string') {
    throw new XMPTError(
      'XMPT_INVALID_MESSAGE_PAYLOAD',
      'Message content.mime must be a string'
    );
  }
}

function asRequiredString(value: unknown, key: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new XMPTError(
      'XMPT_INVALID_MESSAGE_PAYLOAD',
      `Message ${key} must be a non-empty string`
    );
  }

  return value;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeOptionalString(
  value: string | undefined
): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
