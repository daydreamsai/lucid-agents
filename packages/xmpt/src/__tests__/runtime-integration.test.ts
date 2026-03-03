import { createAgent } from '@lucid-agents/core';
import { describe, expect, it } from 'bun:test';

import { xmpt } from '../extension';
import { createLocalXmptNetwork } from '../local-transport';

describe('xmpt extension runtime integration', () => {
  it('attaches runtime.xmpt via .use()', async () => {
    const network = createLocalXmptNetwork();

    const runtime = await createAgent({
      name: 'xmpt-runtime-test',
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

    expect(runtime.xmpt).toBeDefined();
    expect(typeof runtime.xmpt?.send).toBe('function');
    expect(typeof runtime.xmpt?.onMessage).toBe('function');
    expect(typeof runtime.xmpt?.reply).toBe('function');
  });
});
