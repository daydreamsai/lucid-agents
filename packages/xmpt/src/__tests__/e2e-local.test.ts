import { createAgent } from '@lucid-agents/core';
import type { XmptEnvelope } from '@lucid-agents/types/xmpt';
import { describe, expect, it } from 'bun:test';

import { xmpt } from '../extension';
import { createLocalXmptNetwork } from '../local-transport';

function withTimeout<T>(promise: Promise<T>, timeoutMs = 500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

describe('XMPT local e2e integration', () => {
  it('exchanges messages and replies over a shared local transport', async () => {
    const network = createLocalXmptNetwork();

    const runtimeA = await createAgent({
      name: 'agent-a',
      version: '1.0.0',
    })
      .use(
        xmpt({
          transport: 'local',
          inbox: 'agent-a',
          network,
        })
      )
      .build();

    const runtimeB = await createAgent({
      name: 'agent-b',
      version: '1.0.0',
    })
      .use(
        xmpt({
          transport: 'local',
          inbox: 'agent-b',
          network,
        })
      )
      .build();

    if (!runtimeA.xmpt || !runtimeB.xmpt) {
      throw new Error('XMPT runtime missing');
    }

    let receivedByB: XmptEnvelope<{ text: string }> | undefined;

    const replyPromise = new Promise<XmptEnvelope<{ text: string }>>(
      resolve => {
        runtimeA.xmpt?.onMessage(envelope => {
          resolve(envelope as XmptEnvelope<{ text: string }>);
        });
      }
    );

    runtimeB.xmpt.onMessage(async envelope => {
      receivedByB = envelope as XmptEnvelope<{ text: string }>;
      await runtimeB.xmpt?.reply(envelope.threadId, { text: 'pong' });
    });

    const sent = await runtimeA.xmpt.send({
      to: 'agent-b',
      payload: { text: 'ping' },
    });

    const reply = await withTimeout(replyPromise);

    expect(receivedByB?.payload).toEqual({ text: 'ping' });
    expect(reply.payload).toEqual({ text: 'pong' });
    expect(reply.threadId).toBe(sent.threadId);
    expect(reply.replyTo).toBe(sent.id);
  });
});
