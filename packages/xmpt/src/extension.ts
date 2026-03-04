import type {
  AgentRuntime,
  BuildContext,
  Extension,
} from '@lucid-agents/types/core';
import type { XmptRuntime, XmptExtensionOptions } from './types';
import { createXmptRuntime } from './runtime';

export { createXmptRuntime } from './runtime';
export type { XmptRuntimeImpl } from './runtime';

export function xmpt(options?: XmptExtensionOptions): Extension<{ xmpt: XmptRuntime }> {
  const opts = options || {};
  
  return {
    name: 'xmpt',
    build(_ctx: BuildContext): { xmpt: XmptRuntime } {
      return {
        xmpt: {} as XmptRuntime,
      };
    },
    async onBuild(runtime: AgentRuntime) {
      const xmptRuntime = createXmptRuntime(runtime, opts);
      await xmptRuntime.initialize();
      runtime.xmpt = xmptRuntime;
    },
  };
}
