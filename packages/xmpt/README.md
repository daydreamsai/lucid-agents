# @lucid-agents/xmpt

XMPT agent-to-agent messaging extension for Lucid agents.

## Usage

```ts
import { createAgent } from '@lucid-agents/core';
import { xmpt } from '@lucid-agents/xmpt';

const runtime = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(
    xmpt({
      transport: 'agentmail',
      inbox: 'agent@agentmail.to',
    })
  )
  .build();

await runtime.xmpt?.send({
  to: 'other@agentmail.to',
  payload: { text: 'hello' },
});
```
