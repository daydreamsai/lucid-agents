import type { ManifestRuntime } from '../a2a';
import type { AgentHttpHandlers } from '../http';
import type { PaymentsRuntime } from '../payments';
import type { WalletsRuntime } from '../wallets';
import type { A2ARuntime } from '../a2a';
import type { AP2Runtime } from '../ap2';
import type { EntrypointsRuntime } from './entrypoint';
import type { AnalyticsRuntime } from '../analytics';
import type { SchedulerRuntime } from '../scheduler';
import type { AgentCore } from './agent';

/**
 * Agent runtime interface.
 * This type is defined in the types package to avoid circular dependencies
 * between @lucid-agents/core and @lucid-agents/payments.
 *
 * The actual implementation is in @lucid-agents/core.
 */
export type AgentRuntime = {
  /**
   * Agent core instance.
   */
  agent: AgentCore;
  wallets?: WalletsRuntime;
  payments?: PaymentsRuntime;
  analytics?: AnalyticsRuntime;
  a2a?: A2ARuntime;
  ap2?: AP2Runtime;
  scheduler?: SchedulerRuntime;
  handlers?: AgentHttpHandlers;
  entrypoints: EntrypointsRuntime;
  manifest: ManifestRuntime;
};
