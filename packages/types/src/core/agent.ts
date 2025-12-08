import type { AgentConfig } from './config';
import type { EntrypointDef } from './entrypoint';

/**
 * Core agent interface providing entrypoint management.
 */
export type AgentCore = {
  readonly config: AgentConfig;
  addEntrypoint: (entrypoint: EntrypointDef) => void;
  getEntrypoint: (key: string) => EntrypointDef | undefined;
  listEntrypoints: () => EntrypointDef[];
};
