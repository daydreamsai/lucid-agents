import { a2a } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import { xmpt } from '../extension';

describe('xmpt extension', () => {
  it('adds runtime slice and inbox entrypoint', async () => {
    const runtime = await createAgent({
      name: 'xmpt-agent',
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

    expect(runtime.xmpt).toBeDefined();

    const entrypoint = runtime.entrypoints
      .snapshot()
      .find(value => value.key === 'xmpt-inbox');

    expect(entrypoint).toBeDefined();
    expect(entrypoint?.handler).toBeDefined();
  });

  it('tags inbox skill for manifest discoverability', async () => {
    const runtime = await createAgent({
      name: 'discoverable-agent',
      version: '1.0.0',
    })
      .use(a2a())
      .use(http())
      .use(xmpt())
      .build();

    const manifest = runtime.manifest.build('https://agent.example.com');
    const inboxSkill = manifest.skills?.find(
      skill => skill.id === 'xmpt-inbox'
    );

    expect(inboxSkill).toBeDefined();
    expect(inboxSkill?.tags).toContain('xmpt');
    expect(inboxSkill?.tags).toContain('xmpt-inbox');
  });

  it('keeps existing manifest skills unchanged', async () => {
    const runtime = await createAgent({
      name: 'compat-agent',
      version: '1.0.0',
    })
      .addEntrypoint({
        key: 'echo',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async ctx => ({
          output: { text: (ctx.input as { text: string }).text },
        }),
      })
      .use(a2a())
      .use(http())
      .use(xmpt())
      .build();

    const manifest = runtime.manifest.build('https://agent.example.com');
    const echoSkill = manifest.skills?.find(skill => skill.id === 'echo');

    expect(echoSkill).toBeDefined();
    expect(echoSkill?.tags).toBeUndefined();
  });

  it('fails to build when a2a runtime is missing', async () => {
    await expect(
      createAgent({
        name: 'missing-a2a',
        version: '1.0.0',
      })
        .use(http())
        .use(xmpt())
        .build()
    ).rejects.toThrow('[XMPT_PEER_UNREACHABLE]');
  });

  it('fails fast for invalid configuration', () => {
    expect(() => xmpt({ inbox: { key: '   ' } })).toThrow(
      '[XMPT_INVALID_CONFIG]'
    );
  });
});
