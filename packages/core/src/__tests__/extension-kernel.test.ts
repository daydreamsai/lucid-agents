import type { Extension } from '@lucid-agents/types/core';
import { describe, expect, it } from 'bun:test';

import { createAgent } from '../runtime';

describe('extension kernel', () => {
  it('orders declared dependencies and exposes prior capabilities to build', async () => {
    const events: string[] = [];
    const dependent: Extension<{ dependent: string }, { foundation: string }> =
      {
        name: 'dependent',
        requires: ['foundation'],
        build(ctx) {
          events.push('dependent');
          return {
            dependent: ctx.runtime.foundation,
          };
        },
      };
    const foundation: Extension<{ foundation: string }> = {
      name: 'foundation',
      build() {
        events.push('foundation');
        return { foundation: 'ready' };
      },
    };

    const runtime = await createAgent({ name: 'ordered', version: '1.0.0' })
      .use(dependent)
      .use(foundation)
      .build();

    expect(events).toEqual(['foundation', 'dependent']);
    expect(runtime.foundation).toBe('ready');
    expect(runtime.dependent).toBe('ready');
  });

  it('rejects missing dependencies before allocating resources', async () => {
    let built = false;
    const extension: Extension<{ value: true }> = {
      name: 'dependent',
      requires: ['missing'],
      build() {
        built = true;
        return { value: true };
      },
    };

    await expect(
      createAgent({ name: 'missing', version: '1.0.0' }).use(extension).build()
    ).rejects.toThrow('requires missing extension "missing"');
    expect(built).toBe(false);
  });

  it('prevents build when typed dependencies were never installed', () => {
    const dependent: Extension<{ dependent: true }, { foundation: string }> = {
      name: 'dependent',
      requires: ['foundation'],
      build: () => ({ dependent: true }),
    };
    const incomplete = createAgent({ name: 'typed', version: '1.0.0' }).use(
      dependent
    );

    const assertBuildRejected = () => {
      // @ts-expect-error foundation is absent from accumulated capabilities
      void incomplete.build();
    };
    void assertBuildRejected;
  });

  it('starts sequentially and closes resources once in reverse order', async () => {
    const events: string[] = [];
    const first: Extension<{ first: true }> = {
      name: 'first',
      async build() {
        await Promise.resolve();
        events.push('build:first');
        return { first: true };
      },
      dispose() {
        events.push('dispose:first');
      },
    };
    const second: Extension<{ second: true }> = {
      name: 'second',
      requires: ['first'],
      async build() {
        events.push('build:second');
        return { second: true };
      },
      dispose() {
        events.push('dispose:second');
      },
    };

    const runtime = await createAgent({ name: 'close', version: '1.0.0' })
      .use(second)
      .use(first)
      .build();
    await runtime.close();
    await runtime.close();

    expect(events).toEqual([
      'build:first',
      'build:second',
      'dispose:second',
      'dispose:first',
    ]);
  });

  it('disposes completed extensions when a later build fails', async () => {
    const events: string[] = [];
    const allocated: Extension<{ allocated: true }> = {
      name: 'allocated',
      build: () => ({ allocated: true }),
      dispose: () => {
        events.push('disposed');
      },
    };
    const failing: Extension<{ never: true }> = {
      name: 'failing',
      requires: ['allocated'],
      build() {
        throw new Error('boom');
      },
    };

    await expect(
      createAgent({ name: 'rollback', version: '1.0.0' })
        .use(failing)
        .use(allocated)
        .build()
    ).rejects.toThrow('boom');
    expect(events).toEqual(['disposed']);
  });

  it('disposes the current extension when its built slice is rejected', async () => {
    const events: string[] = [];
    const conflicting: Extension<{ manifest: string }> = {
      name: 'conflicting',
      build() {
        events.push('allocated');
        return { manifest: 'conflict' };
      },
      dispose() {
        events.push('disposed');
      },
    };

    await expect(
      createAgent({ name: 'rollback-current', version: '1.0.0' })
        .use(conflicting)
        .build()
    ).rejects.toThrow('both define "manifest"');
    expect(events).toEqual(['allocated', 'disposed']);
  });

  it('rejects duplicate entrypoint keys in the canonical registry', async () => {
    const runtime = await createAgent({
      name: 'unique-entrypoints',
      version: '1.0.0',
    })
      .addEntrypoint({ key: 'once' })
      .build();

    expect(() => runtime.entrypoints.add({ key: 'once' })).toThrow(
      'already registered'
    );
    expect('registerEntrypoint' in runtime.agent).toBe(false);
    expect('configureEntrypointLifecycle' in runtime.agent).toBe(false);
  });
});
