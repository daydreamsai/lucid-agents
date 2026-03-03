import type {
  XmptEnvelope,
  XmptMessageHandler,
  XmptRuntime,
  XmptSendInput,
  XmptTransport,
} from '@lucid-agents/types/xmpt';

import { createAgentmailTransport } from './agentmail-transport';
import { createLocalXmptTransport } from './local-transport';
import {
  xmptEnvelopeSchema,
  xmptReplySchema,
  xmptSendInputSchema,
} from './schema';
import type { XmptConfig } from './types';

function createMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveTransport(config: XmptConfig): XmptTransport {
  if (config.transport === 'agentmail') {
    return createAgentmailTransport({
      inbox: config.inbox,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      pollIntervalMs: config.pollIntervalMs,
      fetch: config.fetch,
    });
  }

  return createLocalXmptTransport(config.network);
}

function resolveTransportName(config: XmptConfig): string {
  return config.transport;
}

export function createXmptRuntime(config: XmptConfig): XmptRuntime {
  const transport = resolveTransport(config);
  const transportName = resolveTransportName(config);
  const inbox = config.inbox;
  const handlers = new Set<XmptMessageHandler>();
  const threadPeerById = new Map<string, string>();
  const latestInboundMessageByThread = new Map<string, string>();

  const dispatchEnvelope = async (incoming: XmptEnvelope) => {
    const envelope = xmptEnvelopeSchema.parse(incoming);
    threadPeerById.set(envelope.threadId, envelope.from);
    latestInboundMessageByThread.set(envelope.threadId, envelope.id);

    for (const handler of handlers) {
      await handler(envelope);
    }
  };

  void Promise.resolve(transport.subscribe(inbox, dispatchEnvelope));

  const send = async <TPayload = unknown>(
    input: XmptSendInput<TPayload>
  ): Promise<XmptEnvelope<TPayload>> => {
    const parsed = xmptSendInputSchema.parse(input);
    const envelope = xmptEnvelopeSchema.parse({
      id: createMessageId(),
      threadId: parsed.threadId ?? createMessageId(),
      from: inbox,
      to: parsed.to,
      transport: transportName,
      createdAt: new Date().toISOString(),
      replyTo: parsed.replyTo,
      payload: parsed.payload,
    }) as XmptEnvelope<TPayload>;

    threadPeerById.set(envelope.threadId, envelope.to);
    await transport.send(envelope);
    return envelope;
  };

  return {
    inbox,
    transport: transportName,
    send,
    onMessage: <TPayload = unknown>(
      handler: XmptMessageHandler<TPayload>
    ): (() => void) => {
      const wrapped = handler as XmptMessageHandler;
      handlers.add(wrapped);
      return () => {
        handlers.delete(wrapped);
      };
    },
    reply: async <TPayload = unknown>(
      threadId: string,
      payload: TPayload
    ): Promise<XmptEnvelope<TPayload>> => {
      const parsed = xmptReplySchema.parse({ threadId, payload });
      const to = threadPeerById.get(parsed.threadId);
      if (!to) {
        throw new Error(
          `Cannot reply: thread "${parsed.threadId}" has no known recipient`
        );
      }

      return send({
        to,
        threadId: parsed.threadId,
        replyTo: latestInboundMessageByThread.get(parsed.threadId),
        payload: parsed.payload as TPayload,
      });
    },
  };
}
