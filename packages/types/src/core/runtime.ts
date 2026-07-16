import type { ManifestRuntime } from './manifest';
import type { EntrypointsRuntime } from './entrypoint';
import type { AgentCore } from './agent';

/** Protocol-neutral runtime services owned by the extension kernel. */
export type AgentRuntimeBase<Capabilities extends object = {}> = {
  agent: AgentCore;
  entrypoints: EntrypointsRuntime<Capabilities>;
  manifest: ManifestRuntime;
  /** Dispose extension resources in reverse dependency order. Idempotent. */
  close: () => Promise<void>;
};

/**
 * Runtime base plus the exact capabilities contributed by installed extensions.
 * Protocol packages own their capability types; core does not enumerate them.
 */
export type AgentRuntime<Capabilities extends object = {}> =
  AgentRuntimeBase<Capabilities> & Capabilities;
