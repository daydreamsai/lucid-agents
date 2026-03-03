import { describe, it, expect, beforeEach } from 'bun:test';
import type {
  XMPTMessage,
  XMPTPeer,
  XMPTContent,
} from '@lucid-agents/types/xmpt';
import { createMemoryStore } from '../store/memory';
import { createXMPTRuntime } from '../runtime';
import { xmpt } from '../extension';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<XMPTMessage> = {}): XMPTMessage {
  return {
    id: 'msg-1',
    content: { text: 'hello' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeFetch(
  status: number,
  body: unknown
): typeof fetch {
  return async (_url: RequestInfo | URL, _init?: RequestInit) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  };
}

function makeFailFetch(): typeof fetch {
  return async () => {
    throw new Error('network error');
  };
}

// ---------------------------------------------------------------------------
// 1. Types — shape validation at runtime (structural checks)
// ---------------------------------------------------------------------------

describe('Types', () => {
  it('XMPTMessage has required fields', () => {
    const msg: XMPTMessage = {
      id: 'test-id',
      content: { text: 'hi' },
      createdAt: new Date().toISOString(),
    };
    expect(msg.id).toBe('test-id');
    expect(msg.content.text).toBe('hi');
    expect(typeof msg.createdAt).toBe('string');
  });

  it('XMPTPeer accepts url variant', () => {
    const peer: XMPTPeer = { url: 'http://localhost:3000' };
    expect('url' in peer).toBe(true);
    if ('url' in peer) {
      expect(peer.url).toBe('http://localhost:3000');
    }
  });

  it('XMPTContent fields are all optional', () => {
    const empty: XMPTContent = {};
    const full: XMPTContent = { text: 'hi', data: { foo: 1 }, mime: 'application/json' };
    expect(empty.text).toBeUndefined();
    expect(full.text).toBe('hi');
    expect(full.mime).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// 2. MemoryStore
// ---------------------------------------------------------------------------

describe('MemoryStore', () => {
  it('saves and lists messages', async () => {
    const store = createMemoryStore();
    const msg = makeMessage();
    await store.save(msg);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('msg-1');
  });

  it('filters by threadId', async () => {
    const store = createMemoryStore();
    await store.save(makeMessage({ id: 'a', threadId: 'thread-1' }));
    await store.save(makeMessage({ id: 'b', threadId: 'thread-2' }));
    await store.save(makeMessage({ id: 'c', threadId: 'thread-1' }));

    const t1 = await store.list({ threadId: 'thread-1' });
    expect(t1).toHaveLength(2);
    expect(t1.map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('returns empty list initially', async () => {
    const store = createMemoryStore();
    const list = await store.list();
    expect(list).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Runtime — receive
// ---------------------------------------------------------------------------

describe('Runtime - receive', () => {
  it('calls registered handler with message', async () => {
    let received: XMPTMessage | null = null;
    const rt = createXMPTRuntime({
      handler: async ({ message }) => {
        received = message;
      },
    });
    const msg = makeMessage({ id: 'rx-1' });
    await rt.receive(msg);
    expect(received).not.toBeNull();
    expect((received as XMPTMessage | null)?.id).toBe('rx-1');
  });

  it('stores received message', async () => {
    const store = createMemoryStore();
    const rt = createXMPTRuntime({ store });
    const msg = makeMessage({ id: 'stored-1' });
    await rt.receive(msg);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('stored-1');
  });

  it('does not crash with no handlers', async () => {
    const rt = createXMPTRuntime({});
    const msg = makeMessage({ id: 'no-handler' });
    // Should not throw
    const result = await rt.receive(msg);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Runtime — onMessage
// ---------------------------------------------------------------------------

describe('Runtime - onMessage', () => {
  it('registers a handler that receives messages', async () => {
    const rt = createXMPTRuntime({});
    const received: XMPTMessage[] = [];
    rt.onMessage(async ({ message }) => {
      received.push(message);
    });
    await rt.receive(makeMessage({ id: 'om-1' }));
    expect(received).toHaveLength(1);
    expect(received[0].id).toBe('om-1');
  });

  it('unsubscribes correctly', async () => {
    const rt = createXMPTRuntime({});
    const received: XMPTMessage[] = [];
    const unsub = rt.onMessage(async ({ message }) => {
      received.push(message);
    });
    await rt.receive(makeMessage({ id: 'before-unsub' }));
    unsub();
    await rt.receive(makeMessage({ id: 'after-unsub' }));
    expect(received).toHaveLength(1);
    expect(received[0].id).toBe('before-unsub');
  });

  it('multiple handlers called in order', async () => {
    const rt = createXMPTRuntime({});
    const order: string[] = [];
    rt.onMessage(async () => { order.push('first'); });
    rt.onMessage(async () => { order.push('second'); });
    await rt.receive(makeMessage());
    expect(order).toEqual(['first', 'second']);
  });
});

// ---------------------------------------------------------------------------
// 5. Runtime — send
// ---------------------------------------------------------------------------

describe('Runtime - send', () => {
  it('POSTs to the correct inbox URL', async () => {
    let capturedUrl = '';
    const fetchFn: typeof fetch = async (url, _init) => {
      capturedUrl = url.toString();
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    };
    const rt = createXMPTRuntime({ fetchFn });
    await rt.send({ url: 'http://peer.example.com' }, { content: { text: 'test' } });
    expect(capturedUrl).toBe('http://peer.example.com/xmpt-inbox');
  });

  it('stores the outbound message', async () => {
    const store = createMemoryStore();
    const rt = createXMPTRuntime({ store, fetchFn: makeFetch(200, {}) });
    await rt.send({ url: 'http://peer.example.com' }, { content: { text: 'outbound' } });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].content.text).toBe('outbound');
  });

  it('returns a delivery result with correct status', async () => {
    const rt = createXMPTRuntime({ fetchFn: makeFetch(200, { taskId: 'task-xyz' }) });
    const result = await rt.send({ url: 'http://peer.example.com' }, { content: { text: 'hi' } });
    expect(result.status).toBe('delivered');
    expect(result.taskId).toBe('task-xyz');
    expect(typeof result.messageId).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 6. Runtime — sendAndWait
// ---------------------------------------------------------------------------

describe('Runtime - sendAndWait', () => {
  it('returns reply message on success', async () => {
    const replyContent: XMPTContent = { text: 'pong' };
    const rt = createXMPTRuntime({ fetchFn: makeFetch(200, { content: replyContent }) });
    const reply = await rt.sendAndWait(
      { url: 'http://peer.example.com' },
      { content: { text: 'ping' } }
    );
    expect(reply).not.toBeNull();
    expect(reply?.content.text).toBe('pong');
  });

  it('returns null on fetch failure', async () => {
    const rt = createXMPTRuntime({ fetchFn: makeFailFetch() });
    const reply = await rt.sendAndWait(
      { url: 'http://peer.example.com' },
      { content: { text: 'ping' } }
    );
    expect(reply).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. Runtime — listMessages
// ---------------------------------------------------------------------------

describe('Runtime - listMessages', () => {
  it('returns all stored messages', async () => {
    const store = createMemoryStore();
    const rt = createXMPTRuntime({ store });
    await rt.receive(makeMessage({ id: 'lm-1' }));
    await rt.receive(makeMessage({ id: 'lm-2' }));
    const list = await rt.listMessages();
    expect(list).toHaveLength(2);
  });

  it('filters by threadId', async () => {
    const store = createMemoryStore();
    const rt = createXMPTRuntime({ store });
    await rt.receive(makeMessage({ id: 'lm-a', threadId: 'thread-A' }));
    await rt.receive(makeMessage({ id: 'lm-b', threadId: 'thread-B' }));
    const threadA = await rt.listMessages({ threadId: 'thread-A' });
    expect(threadA).toHaveLength(1);
    expect(threadA[0].id).toBe('lm-a');
  });
});

// ---------------------------------------------------------------------------
// 8. Extension
// ---------------------------------------------------------------------------

describe('Extension', () => {
  it('build() returns xmpt runtime slice', () => {
    const ext = xmpt();
    const ctx = { meta: { name: 'test', version: '0.1.0' }, runtime: {} };
    const slice = ext.build(ctx as any);
    expect(slice.xmpt).toBeDefined();
    expect(typeof slice.xmpt.send).toBe('function');
    expect(typeof slice.xmpt.receive).toBe('function');
  });

  it('adds xmpt-inbox skill to manifest card', () => {
    const ext = xmpt();
    const ctx = { meta: { name: 'test', version: '0.1.0' }, runtime: {} };
    ext.build(ctx as any);
    const card = {
      name: 'test-agent',
      entrypoints: [],
      skills: [],
    } as any;
    const updated = ext.onManifestBuild!(card, {} as any);
    const skill = updated.skills?.find((s: any) => s.id === 'xmpt-inbox');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('XMPT Inbox');
  });

  it('uses default inbox key of "xmpt-inbox"', () => {
    const ext = xmpt();
    const ctx = { meta: { name: 'test', version: '0.1.0' }, runtime: {} };
    ext.build(ctx as any);
    const card = { name: 'test', entrypoints: [], skills: [] } as any;
    const updated = ext.onManifestBuild!(card, {} as any);
    expect(updated.skills?.some((s: any) => s.id === 'xmpt-inbox')).toBe(true);
  });

  it('uses custom inbox key when provided', () => {
    const ext = xmpt({ inbox: { key: 'my-custom-inbox' } });
    const ctx = { meta: { name: 'test', version: '0.1.0' }, runtime: {} };
    ext.build(ctx as any);
    const card = { name: 'test', entrypoints: [], skills: [] } as any;
    const updated = ext.onManifestBuild!(card, {} as any);
    expect(updated.skills?.some((s: any) => s.id === 'my-custom-inbox')).toBe(true);
    expect(updated.skills?.some((s: any) => s.id === 'xmpt-inbox')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. Integration
// ---------------------------------------------------------------------------

describe('Integration', () => {
  it('two runtimes exchange messages via mocked fetch', async () => {
    // "beta" runtime receives messages
    const betaStore = createMemoryStore();
    const betaRuntime = createXMPTRuntime({
      store: betaStore,
      handler: async ({ message }) => ({
        content: { text: `ack:${message.content.text}` },
      }),
    });

    // Mock fetch routes alpha's POST to beta's receive
    const mockFetch: typeof fetch = async (_url, init) => {
      const body = JSON.parse((init?.body as string) ?? '{}') as XMPTMessage;
      const result = await betaRuntime.receive(body);
      return {
        ok: true,
        status: 200,
        json: async () => result ?? {},
      } as Response;
    };

    const alphaRuntime = createXMPTRuntime({ fetchFn: mockFetch });
    const deliveryResult = await alphaRuntime.send(
      { url: 'http://beta.example.com' },
      { content: { text: 'hello beta' } }
    );

    expect(deliveryResult.status).toBe('delivered');

    const betaMessages = await betaStore.list();
    expect(betaMessages).toHaveLength(1);
    expect(betaMessages[0].content.text).toBe('hello beta');
  });

  it('threadId is preserved across send and receive', async () => {
    const store = createMemoryStore();
    const rt = createXMPTRuntime({ store, fetchFn: makeFetch(200, {}) });

    await rt.send(
      { url: 'http://peer.example.com' },
      { content: { text: 'message in thread' }, threadId: 'thread-preserve' }
    );

    const list = await rt.listMessages({ threadId: 'thread-preserve' });
    expect(list).toHaveLength(1);
    expect(list[0].threadId).toBe('thread-preserve');
  });
});
