import { waitForTask } from '@lucid-agents/a2a';
import type { AgentCard, Task } from '@lucid-agents/types/a2a';
import type { AgentRuntime } from '@lucid-agents/types/core';
import type {
  XMPTDeliveryResult,
  XMPTInboxHandler,
  XMPTListMessagesFilters,
  XMPTMessage,
  XMPTMessageRecord,
  XMPTOnMessageHandler,
  XMPTPeer,
  XMPTRuntime,
  XMPTSendAndWaitResult,
  XMPTSendInput,
  XMPTSendOptions,
  XMPTStore,
} from '@lucid-agents/types/xmpt';

import {
  normalizeXMPTMessage,
  parseXMPTMessage,
  resolveInboxSkillId,
  resolvePeerUrl,
} from './client';
import { XMPTError } from './errors';
import { createMemoryXMPTStore } from './store/memory';

export const DEFAULT_XMPT_INBOX_SKILL_ID = 'xmpt-inbox';

export type CreateXMPTRuntimeOptions = {
  runtime: AgentRuntime;
  inboxSkillId?: string;
  inboxHandler?: XMPTInboxHandler;
  store?: XMPTStore;
  preferredSkillId?: string;
  now?: () => string;
};

export function createXMPTRuntime(
  options: CreateXMPTRuntimeOptions
): XMPTRuntime {
  if (!options.runtime.a2a) {
    throw new XMPTError(
      'XMPT_PEER_UNREACHABLE',
      'A2A runtime is required for XMPT'
    );
  }

  const runtime = options.runtime;
  const store = options.store ?? createMemoryXMPTStore();
  const now = options.now ?? (() => new Date().toISOString());
  const inboxSkillId =
    options.inboxSkillId?.trim() || DEFAULT_XMPT_INBOX_SKILL_ID;
  const subscribers = new Set<XMPTOnMessageHandler>();

  const notifySubscribers = async (message: XMPTMessage): Promise<void> => {
    for (const handler of subscribers) {
      try {
        await handler(message);
      } catch {
        // XMPT observers are best-effort and should not break message delivery.
      }
    }
  };

  const appendRecord = async (message: XMPTMessageRecord): Promise<void> => {
    await Promise.resolve(store.append(message));
  };

  const appendRecordSafely = async (
    message: XMPTMessageRecord
  ): Promise<void> => {
    try {
      await appendRecord(message);
    } catch {
      // Local persistence failures should not alter delivery semantics.
    }
  };

  const resolvePeerCard = async (
    peer: XMPTPeer,
    fetchImpl: XMPTSendOptions['fetch']
  ): Promise<AgentCard> => {
    if ('card' in peer) {
      return peer.card;
    }

    try {
      return await runtime.a2a!.fetchCard(peer.url, fetchImpl);
    } catch (error) {
      throw new XMPTError(
        'XMPT_PEER_UNREACHABLE',
        `Unable to fetch peer card from ${peer.url}`,
        error
      );
    }
  };

  const sendInternal = async (
    peer: XMPTPeer,
    message: XMPTSendInput,
    optionsArg?: XMPTSendOptions
  ): Promise<{
    card: AgentCard;
    normalized: XMPTMessage;
    delivery: XMPTDeliveryResult;
    peerUrl?: string;
  }> => {
    const normalized = normalizeXMPTMessage(message, {
      from: runtime.agent.config.meta.name,
      to: undefined,
      now: now(),
    });

    const card = await resolvePeerCard(peer, optionsArg?.fetch);

    const resolvedSkillId =
      optionsArg?.skillId ??
      resolveInboxSkillId(card, inboxSkillId, options.preferredSkillId);

    if (!resolvedSkillId) {
      throw new XMPTError(
        'XMPT_INBOX_SKILL_MISSING',
        `Peer does not expose an inbox skill (expected ${inboxSkillId})`
      );
    }

    let task: Awaited<ReturnType<typeof runtime.a2a.client.sendMessage>>;
    try {
      task = await runtime.a2a!.client.sendMessage(
        card,
        resolvedSkillId,
        normalized,
        optionsArg?.fetch,
        {
          contextId: normalized.threadId,
          metadata: {
            ...(optionsArg?.metadata ?? {}),
            xmpt: {
              messageId: normalized.id,
              threadId: normalized.threadId,
            },
          },
        }
      );

    } catch (error) {
      throw new XMPTError(
        'XMPT_PEER_UNREACHABLE',
        'Failed to send message to peer inbox',
        error
      );
    }

    const delivery: XMPTDeliveryResult = {
      taskId: task.taskId,
      status: task.status,
      messageId: normalized.id,
    };

    const peerUrl = resolvePeerUrl(peer);
    await appendRecordSafely({
      ...normalized,
      direction: 'outbound',
      peer: peerUrl,
      taskId: task.taskId,
    });

    return {
      card,
      normalized,
      delivery,
      peerUrl,
    };
  };

  const receive = async (
    message: XMPTMessage
  ): Promise<XMPTMessage | undefined> => {
    const parsedMessage = parseXMPTMessage(message);

    await appendRecordSafely({
      ...parsedMessage,
      direction: 'inbound',
      peer: parsedMessage.from,
    });

    await notifySubscribers(parsedMessage);

    const inboxHandler = options.inboxHandler;
    if (!inboxHandler) {
      return undefined;
    }

    const reply = await inboxHandler({
      message: parsedMessage,
      runtime,
    });

    if (!reply) {
      return undefined;
    }

    const replyMessage = normalizeXMPTMessage(
      {
        content: reply.content,
        metadata: reply.metadata,
        threadId: reply.threadId ?? parsedMessage.threadId,
        to: reply.to ?? parsedMessage.from,
      },
      {
        from: runtime.agent.config.meta.name,
        to: parsedMessage.from,
        now: now(),
      }
    );

    await appendRecordSafely({
      ...replyMessage,
      direction: 'outbound',
      peer: parsedMessage.from,
    });

    return replyMessage;
  };

  return {
    async send(
      peer: XMPTPeer,
      message: XMPTSendInput,
      optionsArg?: XMPTSendOptions
    ): Promise<XMPTDeliveryResult> {
      const sent = await sendInternal(peer, message, optionsArg);
      return sent.delivery;
    },

    async sendAndWait(
      peer: XMPTPeer,
      message: XMPTSendInput,
      optionsArg?: XMPTSendOptions
    ): Promise<XMPTSendAndWaitResult> {
      const sent = await sendInternal(peer, message, optionsArg);

      let task: Task<XMPTMessage | null>;
      try {
        const resolvedTask = await waitForTask(
          runtime.a2a!.client,
          sent.card,
          sent.delivery.taskId,
          optionsArg?.timeoutMs ?? 30000
        );

        if (
          resolvedTask.status === 'completed' &&
          resolvedTask.result?.output !== undefined &&
          resolvedTask.result?.output !== null
        ) {
          const parsedReply = parseXMPTMessage(resolvedTask.result.output);

          await appendRecordSafely({
            ...parsedReply,
            direction: 'inbound',
            peer: sent.peerUrl,
            taskId: sent.delivery.taskId,
          });

          await notifySubscribers(parsedReply);

          task = {
            ...resolvedTask,
            result: {
              ...resolvedTask.result,
              output: parsedReply,
            },
          };
        } else {
          task = resolvedTask as Task<XMPTMessage | null>;
        }
      } catch (error) {
        if (error instanceof XMPTError) {
          throw error;
        }

        const messageText =
          error instanceof Error ? error.message : 'Task wait failed';

        if (messageText.includes('did not complete within')) {
          throw new XMPTError('XMPT_TIMEOUT', messageText, error);
        }

        throw new XMPTError('XMPT_PEER_UNREACHABLE', messageText, error);
      }

      return {
        delivery: sent.delivery,
        task,
      };
    },

    receive,

    onMessage(handler: XMPTOnMessageHandler): () => void {
      subscribers.add(handler);
      return () => {
        subscribers.delete(handler);
      };
    },

    async listMessages(
      filters?: XMPTListMessagesFilters
    ): Promise<XMPTMessageRecord[]> {
      return await Promise.resolve(store.list(filters));
    },
  };
}
