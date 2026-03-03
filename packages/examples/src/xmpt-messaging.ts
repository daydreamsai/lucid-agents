import { createAgent } from '@lucid-agents/core';
import { createLocalXmptNetwork, xmpt } from '@lucid-agents/xmpt';

async function main() {
  const network = createLocalXmptNetwork();

  const agentA = await createAgent({
    name: 'xmpt-agent-a',
    version: '1.0.0',
    description: 'XMPT sender',
  })
    .use(
      xmpt({
        transport: 'local',
        inbox: 'agent-a',
        network,
      })
    )
    .build();

  const agentB = await createAgent({
    name: 'xmpt-agent-b',
    version: '1.0.0',
    description: 'XMPT receiver',
  })
    .use(
      xmpt({
        transport: 'local',
        inbox: 'agent-b',
        network,
      })
    )
    .build();

  if (!agentA.xmpt || !agentB.xmpt) {
    throw new Error('XMPT runtime missing');
  }

  agentB.xmpt.onMessage(async envelope => {
    console.log(
      `[agent-b] received on ${envelope.threadId}:`,
      envelope.payload
    );
    await agentB.xmpt?.reply(envelope.threadId, {
      ok: true,
      text: 'pong',
    });
  });

  agentA.xmpt.onMessage(envelope => {
    console.log(`[agent-a] reply on ${envelope.threadId}:`, envelope.payload);
  });

  const sent = await agentA.xmpt.send({
    to: 'agent-b',
    payload: { text: 'ping' },
  });

  console.log(
    `[agent-a] sent ${sent.id} on thread ${sent.threadId} to ${sent.to}`
  );

  // Agentmail transport configuration:
  // xmpt({ transport: 'agentmail', inbox: 'agent@agentmail.to' })
}

main().catch(error => {
  console.error('[xmpt-messaging] fatal error:', error);
  process.exitCode = 1;
});
