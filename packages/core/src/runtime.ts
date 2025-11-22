import type { AgentMeta } from '@lucid-agents/types/core';

import { AppBuilder } from './extensions/builder';

/**
 * Creates a new app builder for constructing an agent runtime with extensions.
 *
 * @example
 * ```typescript
 * const identity = identity({ trust });
 * const payments = payments({ config });
 * const a2a = a2a();
 *
 * const runtime = createApp(meta)
 *   .use(identity)
 *   .use(payments)
 *   .use(a2a)
 *   .build();
 * ```
 */
export function createApp(meta: AgentMeta): AppBuilder {
  return new AppBuilder(meta);
}

export { AppBuilder } from './extensions/builder';
