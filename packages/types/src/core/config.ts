import type { AgentMeta } from './manifest';

/**
 * Configuration for an agent instance.
 * Contains only the core agent metadata - extension configurations are managed by their respective runtimes.
 */
export type AgentConfig = {
  meta: AgentMeta;
};
