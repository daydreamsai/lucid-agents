import { describe, expect, it, mock } from 'bun:test';
import type { AgentCard, A2AClient, A2ARuntime } from '@lucid-agents/types/a2a';
import type { AgentRuntime } from '@lucid-agents/types/core';
import type { XMPTMessage, XMPTStore } from '@lucid-agents/types/xmpt';

import { createXMPTRuntime } from '../runtime';

const peerCard: AgentCard = {
  name: 'peer-agent',
  version: '1.0.0',
  url: 'https://peer.example.com/',
  skills: [
    {
      id: 'xmpt-inbox',
      tags: ['xmpt-inbox'],
    },
  ],
};

function createMockRuntime(options?: {
  fetchCard?: ReturnType<typeof mock>;
  sendMessage?: ReturnType<typeof mock>;
  getTask?: ReturnType<typeof mock>;
}): AgentRuntime {
  const fetchCard =
    options?.fetchCard ??
    mock(async () => {
      return peerCard;
    });

  const sendMessage =
    options?.sendMessage ??
    mock(async () => ({
      taskId: 'task-1',
      status: 'running' as const,
    }));

  const getTask =
    options?.getTask ??
    mock(async () => ({
      taskId: 'task-1',
      status: 'completed' as const,
      result: {
        output: {
          id: 'reply-1',
          threadId: 'thread-1',
          content: { text: 'ack:hello' },
          createdAt: new Date().toISOString(),
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

  const client: A2AClient = {
    invoke: mock(async () => ({ status: 'succeeded' })),
    stream: mock(async () => {}),
    fetchAndInvoke: mock(async () => ({ status: 'succeeded' })),
    sendMessage,
    getTask,
    subscribeTask: mock(async () => {}),
    fetchAndSendMessage: mock(async () => ({
      taskId: 'task-1',
      status: 'running' as const,
    })),
    listTasks: mock(async () => ({ tasks: [] })),
    cancelTask: mock(async () => ({
      taskId: 'task-1',
      status: 'cancelled' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  };

  const a2aRuntime: A2ARuntime = {
    buildCard: mock(() => ({ ...peerCard, entrypoints: {} })),
    fetchCard,
    fetchCardWithEntrypoints: mock(async () => ({
      ...peerCard,
      entrypoints: {},
    })),
    client,
  };

  return {
    agent: {
      config: {
        meta: {
          name: 'alpha',
          version: '1.0.0',
        },
      },
      addEntrypoint: mock(),
      getEntrypoint: mock(),
      listEntrypoints: mock(() => []),
    },
    a2a: a2aRuntime,
    entrypoints: {
      add: mock(),
      list: mock(() => []),
      snapshot: mock(() => []),
    },
    manifest: {
      build: mock(() => ({ ...peerCard, entrypoints: {} })),
      invalidate: mock(),
    },
  };
}

describe('createXMPTRuntime', () => {
  it('send() resolves peer URL and creates task message', async () => {
    const fetchCard = mock(async () => peerCard);
    const sendMessage = mock(async () => ({
      taskId: 'task-123',
      status: 'running' as const,
    }));

    const runtime = createMockRuntime({ fetchCard, sendMessage });
    const xmpt = createXMPTRuntime({ runtime });

    const result = await xmpt.send(
      { url: 'https://peer.example.com' },
      {
        threadId: 'thread-123',
        content: { text: 'hello' },
      }
    );

    expect(result.taskId).toBe('task-123');
    expect(result.status).toBe('running');
    expect(result.messageId).toBeDefined();
    expect(fetchCard).toHaveBeenCalledWith(
      'https://peer.example.com',
      undefined
    );

    const firstCall = sendMessage.mock.calls[0];
    expect(firstCall).toBeDefined();

    const [, skillId, input, , taskOptions] = firstCall as unknown as [
      AgentCard,
      string,
      XMPTMessage,
      unknown,
      { contextId: string },
    ];

    expect(skillId).toBe('xmpt-inbox');
    expect(input.threadId).toBe('thread-123');
    expect(taskOptions.contextId).toBe('thread-123');
  });

  it('receive() invokes inbox handler and returns reply', async () => {
    const inboxHandler = mock(
      async ({ message }: { message: XMPTMessage }) => ({
        content: { text: `ack:${message.content.text}` },
      })
    );

    const runtime = createMockRuntime();
    const xmpt = createXMPTRuntime({ runtime, inboxHandler });

    const incoming: XMPTMessage = {
      id: 'incoming-1',
      threadId: 'thread-1',
      from: 'beta',
      content: { text: 'hello' },
      createdAt: new Date().toISOString(),
    };

    const reply = await xmpt.receive(incoming);

    expect(reply).toBeDefined();
    expect(reply?.threadId).toBe('thread-1');
    expect(reply?.content.text).toBe('ack:hello');
    expect(inboxHandler).toHaveBeenCalledTimes(1);

    const messages = await xmpt.listMessages({ threadId: 'thread-1' });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.direction).toBe('inbound');
    expect(messages[1]?.direction).toBe('outbound');
  });

  it('sendAndWait() returns completed task result', async () => {
    const runtime = createMockRuntime({
      getTask: mock(async () => ({
        taskId: 'task-1',
        status: 'completed' as const,
        result: {
          output: {
            id: 'reply-1',
            threadId: 'thread-send-and-wait',
            content: { text: 'ack:hello' },
            createdAt: new Date().toISOString(),
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    });

    const xmpt = createXMPTRuntime({ runtime });

    const result = await xmpt.sendAndWait(
      { card: peerCard },
      {
        threadId: 'thread-send-and-wait',
        content: { text: 'hello' },
      }
    );

    expect(result.delivery.taskId).toBe('task-1');
    expect(result.task.status).toBe('completed');
    expect(result.task.result?.output?.threadId).toBe('thread-send-and-wait');
    expect(result.task.result?.output?.content.text).toBe('ack:hello');
  });

  it('send() succeeds even when store append fails after peer delivery', async () => {
    const sendMessage = mock(async () => ({
      taskId: 'task-store-failure',
      status: 'running' as const,
    }));
    const runtime = createMockRuntime({ sendMessage });
    const failingStore: XMPTStore = {
      append: mock(async () => {
        throw new Error('store unavailable');
      }),
      list: mock(() => []),
    };
    const xmpt = createXMPTRuntime({ runtime, store: failingStore });

    const result = await xmpt.send(
      { card: peerCard },
      {
        threadId: 'thread-store-failure',
        content: { text: 'hello' },
      }
    );

    expect(result.taskId).toBe('task-store-failure');
    expect(result.status).toBe('running');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('throws deterministic error when inbox skill is missing', async () => {
    const fetchCard = mock(async () => ({
      ...peerCard,
      skills: [],
    }));

    const runtime = createMockRuntime({ fetchCard });
    const xmpt = createXMPTRuntime({ runtime });

    await expect(
      xmpt.send(
        { url: 'https://peer.example.com' },
        {
          content: { text: 'hello' },
        }
      )
    ).rejects.toThrow('[XMPT_INBOX_SKILL_MISSING]');
  });

  it('listMessages() filters by thread and records inbound/outbound flows', async () => {
    const runtime = createMockRuntime();
    const xmpt = createXMPTRuntime({ runtime });

    await xmpt.send(
      { card: peerCard },
      {
        threadId: 'thread-1',
        content: { text: 'outbound' },
      }
    );

    await xmpt.receive({
      id: 'inbound-1',
      threadId: 'thread-1',
      from: 'peer',
      content: { text: 'inbound' },
      createdAt: new Date().toISOString(),
    });

    await xmpt.receive({
      id: 'other-thread',
      threadId: 'thread-2',
      from: 'peer',
      content: { text: 'other' },
      createdAt: new Date().toISOString(),
    });

    const threadMessages = await xmpt.listMessages({ threadId: 'thread-1' });
    expect(threadMessages).toHaveLength(2);
    expect(
      threadMessages.some(message => message.direction === 'inbound')
    ).toBe(true);
    expect(
      threadMessages.some(message => message.direction === 'outbound')
    ).toBe(true);
  });

  it('receive() continues when a subscriber throws', async () => {
    const inboxHandler = mock(async () => ({
      content: { text: 'ack:hello' },
    }));
    const runtime = createMockRuntime();
    const xmpt = createXMPTRuntime({ runtime, inboxHandler });
    xmpt.onMessage(() => {
      throw new Error('observer failure');
    });

    const reply = await xmpt.receive({
      id: 'receive-observer-failure',
      threadId: 'thread-observer-failure',
      content: { text: 'hello' },
      createdAt: new Date().toISOString(),
    });

    expect(reply?.content.text).toBe('ack:hello');
    expect(inboxHandler).toHaveBeenCalledTimes(1);
  });

  it('sendAndWait() continues when a subscriber throws while processing reply', async () => {
    const runtime = createMockRuntime({
      getTask: mock(async () => ({
        taskId: 'task-observer-failure',
        status: 'completed' as const,
        result: {
          output: {
            id: 'reply-observer-failure',
            threadId: 'thread-observer-failure',
            content: { text: 'ack:hello' },
            createdAt: new Date().toISOString(),
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    });
    const xmpt = createXMPTRuntime({ runtime });
    xmpt.onMessage(() => {
      throw new Error('observer failure');
    });

    const result = await xmpt.sendAndWait(
      { card: peerCard },
      {
        threadId: 'thread-observer-failure',
        content: { text: 'hello' },
      }
    );

    expect(result.delivery.taskId).toBe('task-1');
    expect(result.task.status).toBe('completed');
    expect(result.task.result?.output?.content.text).toBe('ack:hello');
  });

  it('onMessage() subscribes and unsubscribes handlers', async () => {
    const runtime = createMockRuntime();
    const xmpt = createXMPTRuntime({ runtime });

    const handler = mock(async (_message: XMPTMessage) => {});
    const unsubscribe = xmpt.onMessage(handler);

    await xmpt.receive({
      id: 'm-1',
      threadId: 'thread-1',
      content: { text: 'hello' },
      createdAt: new Date().toISOString(),
    });

    unsubscribe();

    await xmpt.receive({
      id: 'm-2',
      threadId: 'thread-2',
      content: { text: 'hello-again' },
      createdAt: new Date().toISOString(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
