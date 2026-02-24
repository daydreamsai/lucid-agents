import { describe, expect, it } from 'bun:test';
import type { XMPTMessageRecord } from '@lucid-agents/types/xmpt';

import { createMemoryXMPTStore } from '../store/memory';

const makeMessage = (
  id: string,
  threadId: string,
  direction: XMPTMessageRecord['direction']
): XMPTMessageRecord => ({
  id,
  threadId,
  direction,
  content: { text: id },
  createdAt: new Date().toISOString(),
});

describe('createMemoryXMPTStore', () => {
  it('stores and lists messages', async () => {
    const store = createMemoryXMPTStore();

    const first = makeMessage('m-1', 't-1', 'inbound');
    const second = makeMessage('m-2', 't-1', 'outbound');

    await store.append(first);
    await store.append(second);

    const listed = await store.list();
    expect(listed).toHaveLength(2);
    expect(listed[0]?.id).toBe('m-1');
    expect(listed[1]?.id).toBe('m-2');
  });

  it('filters by threadId and direction', async () => {
    const store = createMemoryXMPTStore([
      makeMessage('m-1', 't-1', 'inbound'),
      makeMessage('m-2', 't-1', 'outbound'),
      makeMessage('m-3', 't-2', 'inbound'),
    ]);

    const threadMessages = await store.list({ threadId: 't-1' });
    expect(threadMessages).toHaveLength(2);

    const outboundMessages = await store.list({ direction: 'outbound' });
    expect(outboundMessages).toHaveLength(1);
    expect(outboundMessages[0]?.id).toBe('m-2');
  });

  it('supports offset and limit', async () => {
    const store = createMemoryXMPTStore([
      makeMessage('m-1', 't-1', 'inbound'),
      makeMessage('m-2', 't-1', 'outbound'),
      makeMessage('m-3', 't-1', 'inbound'),
    ]);

    const paged = await store.list({ offset: 1, limit: 1 });
    expect(paged).toHaveLength(1);
    expect(paged[0]?.id).toBe('m-2');
  });
});
