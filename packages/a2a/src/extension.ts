import type { BuildContext, Extension } from '@lucid-agents/types/core';
import type {
  A2ARuntime,
  CreateA2ARuntimeOptions,
} from '@lucid-agents/types/a2a';

import { createA2ARuntime } from './runtime';

export function a2a(
  options?: CreateA2ARuntimeOptions
): Extension<{ a2a: A2ARuntime }> {
  let a2aRuntime: A2ARuntime | undefined;
  return {
    name: 'a2a',
    build(ctx: BuildContext): { a2a: A2ARuntime } {
      a2aRuntime = createA2ARuntime(ctx.runtime, options);
      return { a2a: a2aRuntime };
    },
    onManifestBuild(card) {
      return {
        ...card,
        capabilities: {
          ...card.capabilities,
          stateTransitionHistory: true,
        },
      };
    },
    async dispose() {
      await a2aRuntime?.tasks.close();
    },
  };
}
