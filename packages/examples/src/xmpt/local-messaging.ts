import { a2a } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { xmpt } from '@lucid-agents/xmpt';

async function main(): Promise<void> {
  const alpha = await createAgent({
    name: 'alpha',
    version: '1.0.0',
    description: 'XMPT sender',
  })
    .use(a2a())
    .use(http())
    .use(xmpt())
    .build();

  const beta = await createAgent({
    name: 'beta',
    version: '1.0.0',
    description: 'XMPT receiver',
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
    port: 8789,
    fetch: alphaApp.app.fetch,
  });

  const betaServer = Bun.serve({
    port: 8790,
    fetch: betaApp.app.fetch,
  });

  try {
    console.log('Alpha listening on http://localhost:8789');
    console.log('Beta listening on http://localhost:8790');

    const result = await alpha.xmpt!.sendAndWait(
      { url: 'http://localhost:8790' },
      {
        threadId: 'example-thread',
        content: { text: 'hello from alpha' },
      },
      {
        timeoutMs: 5000,
      }
    );

    console.log('Delivery:', result.delivery);
    console.log('Task status:', result.task.status);
    console.log('Reply output:', result.task.result?.output);

    const betaMessages = await beta.xmpt!.listMessages({
      threadId: 'example-thread',
    });

    console.log('Beta message history:', betaMessages);
  } finally {
    alphaServer.stop();
    betaServer.stop();
  }
}

await main();
