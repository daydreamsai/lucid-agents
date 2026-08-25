import type { Extension } from '@lucid-agents/types/core';

import { TaskmarketClient } from './client';
import type { TaskmarketExtensionOptions, TaskmarketRuntime } from './types';

export function taskmarket(
  options: TaskmarketExtensionOptions
): Extension<{ taskmarket: TaskmarketRuntime }> {
  return {
    name: 'taskmarket',
    build() {
      return {
        taskmarket: new TaskmarketClient(options),
      };
    },
  };
}
