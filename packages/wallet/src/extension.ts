import type { BuildContext, Extension } from '@lucid-agents/types/core';
import type {
  WalletsConfig,
  WalletsRuntime,
} from '@lucid-agents/types/wallets';

import { createWalletsRuntime } from './runtime';

export function wallets(options?: {
  config?: WalletsConfig;
}): Extension<{ wallets?: WalletsRuntime }> {
  return {
    name: 'wallets',
    build(ctx: BuildContext): { wallets?: WalletsRuntime } {
      const walletsRuntime = createWalletsRuntime(options?.config);
      return { wallets: walletsRuntime };
    },
  };
}
