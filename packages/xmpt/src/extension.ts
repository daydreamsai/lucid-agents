import type { Extension } from '@lucid-agents/types/core';
import type { XmptRuntime } from '@lucid-agents/types/xmpt';

import { createXmptRuntime } from './runtime';
import type { XmptConfig } from './types';

export function xmpt(config: XmptConfig): Extension<{ xmpt: XmptRuntime }> {
  return {
    name: 'xmpt',
    build() {
      return {
        xmpt: createXmptRuntime(config),
      };
    },
  };
}
