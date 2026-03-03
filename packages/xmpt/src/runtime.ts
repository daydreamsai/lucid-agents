import type {
  XMPTContent,
  XMPTDeliveryResult,
  XMPTInboxHandler,
  XMPTMessage,
  XMPTPeer,
  XMPTRuntime,
  XMPTStore,
} from '@lucid-agents/types/xmpt';
import { createMemoryStore } from './store/memory';

function generateId(): string {
  return `xmpt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getPeerUrl(peer: XMPTPeer): string {
  if ('url' in peer) return peer.url;
  // card-based peer: extract url from card
  const card = peer.card as Record<string, unknown>;
  return (card.url as string) ?? (card.endpoint as string) ?? '';
}

export function createXMPTRuntime(options: {
  inboxKey?: string;
  handler?: XMPTInboxHandler;
  store?: XMPTStore;
  fetchFn?: typeof fetch;
}): XMPTRuntime {
  const store = options.store ?? createMemoryStore();
  const fetchFn = options.fetchFn ?? fetch;
  const handlers: XMPTInboxHandler[] = options.handler ? [options.handler] : [];
  const inboxKey = options.inboxKey ?? 'xmpt-inbox';

  return {
    async send(
      peer: XMPTPeer,
      msg: Omit<XMPTMessage, 'id' | 'createdAt'>,
      _options?: { timeoutMs?: number }
    ): Promise<XMPTDeliveryResult> {
      const message: XMPTMessage = {
        ...msg,
        id: generateId(),
        createdAt: new Date().toISOString(),
      };
      await store.save(message);

      const peerUrl = getPeerUrl(peer);
      const inboxUrl = `${peerUrl.replace(/\/$/, '')}/${inboxKey}`;

      const res = await fetchFn(inboxUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      const body: unknown = res.ok ? await res.json().catch(() => ({})) : {};
      return {
        taskId: (body as Record<string, unknown>)?.taskId as string ?? message.id,
        status: res.ok ? 'delivered' : 'failed',
        messageId: message.id,
      };
    },

    async sendAndWait(
      peer: XMPTPeer,
      msg: Omit<XMPTMessage, 'id' | 'createdAt'>,
      options?: { timeoutMs?: number }
    ): Promise<XMPTMessage | null> {
      const message: XMPTMessage = {
        ...msg,
        id: generateId(),
        createdAt: new Date().toISOString(),
      };
      await store.save(message);

      const peerUrl = getPeerUrl(peer);
      const inboxUrl = `${peerUrl.replace(/\/$/, '')}/${inboxKey}`;

      const controller = new AbortController();
      const timer = options?.timeoutMs
        ? setTimeout(() => controller.abort(), options.timeoutMs)
        : null;

      try {
        const res = await fetchFn(inboxUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const reply: unknown = await res.json().catch(() => null);
        if (!reply) return null;
        return {
          id: generateId(),
          threadId: message.threadId,
          content: (reply as Record<string, unknown>)?.content as XMPTContent ?? reply as XMPTContent,
          createdAt: new Date().toISOString(),
        };
      } catch {
        return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },

    async receive(message: XMPTMessage): Promise<{ content: XMPTContent } | void> {
      await store.save(message);
      for (const handler of handlers) {
        const result = await handler({ message });
        if (result) return result;
      }
    },

    onMessage(handler: XMPTInboxHandler): () => void {
      handlers.push(handler);
      return () => {
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
      };
    },

    async listMessages(filter?: { threadId?: string }): Promise<XMPTMessage[]> {
      return store.list(filter);
    },
  };
}
