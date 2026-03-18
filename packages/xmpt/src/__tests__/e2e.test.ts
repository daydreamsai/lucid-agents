import { a2a } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { describe, expect, it } from 'bun:test';

import { xmpt } from '../extension';

describe('xmpt local e2e', () => {
  it('exchanges messages between two local agents', async () => {
    const alpha = await createAgent({
      name: 'alpha',
      version: '1.0.0',
    })
      .use(a2a())
      .use(http())
      .use(xmpt())
      .build();

    const beta = await createAgent({
      name: 'beta',
      version: '1.0.0',
    })
      .use(a2a())
      .use(http())
      .use(
        xmpt({
          inbox: {
            handler: async ({ message }) => ({
              content: {
                text: `ack:${message.content.text ?? ''}`,
              },
            }),
          },
        })
      )
      .build();

    const alphaApp = await createAgentApp(alpha);
    const betaApp = await createAgentApp(beta);

    const alphaServer = Bun.serve({
      port: 0,
      fetch: alphaApp.app.fetch,
    });

    const betaServer = Bun.serve({
      port: 0,
      fetch: betaApp.app.fetch,
    });

    try {
      const betaUrl = `http://127.0.0.1:${betaServer.port}`;

      const result = await alpha.xmpt!.sendAndWait(
        { url: betaUrl },
        {
          threadId: 'thread-e2e',
          content: { text: 'hello' },
        },
        {
          timeoutMs: 3000,
        }
      );

      expect(result.task.status).toBe('completed');
      expect(result.task.result?.output?.threadId).toBe('thread-e2e');
      expect(result.task.result?.output?.content.text).toBe('ack:hello');

      const betaMessages = await beta.xmpt!.listMessages({
        threadId: 'thread-e2e',
      });
      expect(betaMessages).toHaveLength(2);
      expect(betaMessages[0]?.direction).toBe('inbound');
      expect(betaMessages[1]?.direction).toBe('outbound');
    } finally {
      alphaServer.stop();
      betaServer.stop();
    }
  });
});
