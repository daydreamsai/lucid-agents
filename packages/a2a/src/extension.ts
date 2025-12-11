import type {
  AgentRuntime,
  BuildContext,
  Extension,
} from '@lucid-agents/types/core';
import type { A2ARuntime } from '@lucid-agents/types/a2a';

import { createA2ARuntime } from './runtime';

export function a2a(): Extension<{ a2a: A2ARuntime }> {
  return {
    name: 'a2a',
    build(_ctx: BuildContext): { a2a: A2ARuntime } {
      // A2A runtime needs the full runtime, so we create it in onBuild
      // Return placeholder - will be replaced in onBuild
      return {
        a2a: {} as A2ARuntime,
      };
    },
    onBuild(runtime: AgentRuntime) {
      const a2aRuntime = createA2ARuntime(runtime);
      runtime.a2a = a2aRuntime;
    },
  };
}
