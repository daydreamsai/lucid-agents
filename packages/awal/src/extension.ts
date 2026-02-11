import type { BuildContext, Extension } from '@lucid-agents/types/core';
import type { AwalConfig, AwalRuntime } from '@lucid-agents/types/awal';

import { createAwalRuntime } from './runtime';

export function awal(options?: { config?: AwalConfig }): Extension<{ awal?: AwalRuntime }> {
  return {
    name: 'awal',
    build(_ctx: BuildContext): { awal?: AwalRuntime } {
      if (!options?.config) {
        return { awal: undefined };
      }

      return {
        awal: createAwalRuntime(options.config),
      };
    },
  };
}
