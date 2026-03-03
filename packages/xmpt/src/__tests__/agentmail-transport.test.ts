import type { XmptEnvelope } from '@lucid-agents/types/xmpt';
import { describe, expect, it, mock } from 'bun:test';

import { createAgentmailTransport } from '../agentmail-transport';

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('createAgentmailTransport', () => {
  it('sends envelopes and polls for inbound envelopes', async () => {
    const incomingEnvelope: XmptEnvelope<{ text: string }> = {
      id: 'msg-inbound',
      threadId: 'thread-1',
      from: 'agent-b@agentmail.to',
      to: 'agent-a@agentmail.to',
      transport: 'agentmail',
      createdAt: new Date().toISOString(),
      payload: { text: 'pong' },
    };

    let pollCount = 0;
    const fetchMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if ((init?.method ?? 'GET') === 'POST') {
          expect(url).toBe('https://agentmail.test/v1/messages');
          return new Response(null, { status: 202 });
        }

        pollCount += 1;
        if (pollCount === 1) {
          return new Response(
            JSON.stringify({
              messages: [incomingEnvelope],
              nextCursor: incomingEnvelope.id,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          );
        }

        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    );

    const transport = createAgentmailTransport({
      inbox: 'agent-a@agentmail.to',
      baseUrl: 'https://agentmail.test/v1',
      fetch: fetchMock,
      pollIntervalMs: 10,
    });

    const received: XmptEnvelope[] = [];
    const unsubscribe = await Promise.resolve(
      transport.subscribe('agent-a@agentmail.to', envelope => {
        received.push(envelope);
      })
    );

    await transport.send({
      id: 'msg-outbound',
      threadId: 'thread-1',
      from: 'agent-a@agentmail.to',
      to: 'agent-b@agentmail.to',
      transport: 'agentmail',
      createdAt: new Date().toISOString(),
      payload: { text: 'ping' },
    });

    await wait(25);
    unsubscribe();

    expect(fetchMock).toHaveBeenCalled();
    expect(received).toHaveLength(1);
    expect(received[0]?.payload).toEqual({ text: 'pong' });
  });
});
