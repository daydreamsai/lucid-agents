import type {
  XMPTListMessagesFilters,
  XMPTMessageRecord,
  XMPTStore,
} from '@lucid-agents/types/xmpt';

export function createMemoryXMPTStore(
  initialMessages: XMPTMessageRecord[] = []
): XMPTStore {
  const messages: XMPTMessageRecord[] = [...initialMessages];

  return {
    append(message: XMPTMessageRecord): void {
      messages.push(message);
    },

    list(filters?: XMPTListMessagesFilters): XMPTMessageRecord[] {
      let result = [...messages];

      if (filters?.threadId) {
        result = result.filter(
          message => message.threadId === filters.threadId
        );
      }

      if (filters?.direction) {
        result = result.filter(
          message => message.direction === filters.direction
        );
      }

      const offset = Math.max(filters?.offset ?? 0, 0);
      const limit = filters?.limit;

      if (limit !== undefined) {
        return result.slice(offset, offset + Math.max(limit, 0));
      }

      return result.slice(offset);
    },
  };
}
