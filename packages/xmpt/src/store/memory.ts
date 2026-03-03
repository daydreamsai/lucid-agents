import type { XMPTMessage, XMPTStore } from '@lucid-agents/types/xmpt';

export function createMemoryStore(): XMPTStore {
  const messages: XMPTMessage[] = [];
  return {
    async save(message: XMPTMessage): Promise<void> {
      messages.push(message);
    },
    async list(filter?: { threadId?: string }): Promise<XMPTMessage[]> {
      if (filter?.threadId) {
        return messages.filter((m) => m.threadId === filter.threadId);
      }
      return [...messages];
    },
  };
}
