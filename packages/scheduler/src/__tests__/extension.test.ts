import { describe, expect, it, mock } from 'bun:test';

import { scheduler } from '../extension';
import { createMemoryStore } from '../store/memory';

describe('scheduler extension', () => {
  it('builds over the A2A capability and disposes its owned store', async () => {
    const store = createMemoryStore();
    const close = mock(async () => undefined);
    store.close = close;
    const extension = scheduler({ store, clock: () => 1_000 });
    const slice = await extension.build({
      meta: { name: 'test', version: '1' },
      runtime: {
        a2a: { client: {} },
        agent: {
          config: { meta: { name: 'test', version: '1' } },
          getEntrypoint: () => undefined,
          listEntrypoints: () => [],
        },
        entrypoints: { add: () => {}, list: () => [], snapshot: () => [] },
        manifest: { build: () => ({ entrypoints: {} }), invalidate: () => {} },
      },
    } as never);

    expect(extension.requires).toEqual(['a2a']);
    expect(extension.after).toEqual(['payments']);
    expect(slice.scheduler.createHire).toBeFunction();
    await extension.dispose?.({} as never);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
