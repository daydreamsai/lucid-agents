import type { AgentMeta } from '@lucid-agents/types/core';

import { AgentBuilder } from './extensions/builder';

/**
 * Creates a new agent builder for constructing an agent runtime with extensions.
 *
 * @example
 * ```typescript
 * const identity = identity({ trust });
 * const payments = payments({ config });
 * const a2a = a2a();
 *
 * const agent = createAgent(meta)
 *   .use(identity)
 *   .use(payments)
 *   .use(a2a)
 *   .build();
 * ```
 */
export function createAgent(meta: AgentMeta): AgentBuilder {
  return new AgentBuilder(meta);
}

export { AgentBuilder } from './extensions/builder';
