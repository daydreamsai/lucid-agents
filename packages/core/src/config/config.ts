import { paymentsFromEnv } from '@lucid-agents/payments';
import type { AgentKitConfig } from '@lucid-agents/types/core';
import { walletsFromEnv } from '@lucid-agents/wallet';

import { hasDefinedValue } from '../utils/utils';

const defaultConfig: AgentKitConfig = {};

const environmentConfig: AgentKitConfig = pruneConfig({
  payments: paymentsFromEnv(),
  wallets: walletsFromEnv(),
});

let runtimeOverrides: AgentKitConfig = {};
let activeInstanceConfig: AgentKitConfig | undefined;

export function configureAgentKit(overrides: AgentKitConfig) {
  runtimeOverrides = mergeConfigs(runtimeOverrides, overrides);
}

export function resetAgentKitConfigForTesting() {
  runtimeOverrides = {};
  activeInstanceConfig = undefined;
}

export function getAgentKitConfig(
  instanceConfig?: AgentKitConfig
): AgentKitConfig {
  const withEnv = mergeConfigs(defaultConfig, environmentConfig);
  const withRuntime = mergeConfigs(withEnv, runtimeOverrides);
  return mergeConfigs(withRuntime, instanceConfig);
}

export function setActiveInstanceConfig(config?: AgentKitConfig) {
  activeInstanceConfig = config;
}

export function getActiveInstanceConfig(): AgentKitConfig | undefined {
  return activeInstanceConfig;
}

function mergeConfigs(
  base: AgentKitConfig,
  patch?: AgentKitConfig
): AgentKitConfig {
  if (!patch) return base;
  const next: AgentKitConfig = { ...base };

  if (patch.payments) {
    next.payments = { ...(next.payments ?? {}), ...patch.payments };
  }

  if (patch.wallets) {
    next.wallets = { ...(next.wallets ?? {}), ...patch.wallets };
  }

  return pruneConfig(next);
}

function pruneConfig(config: AgentKitConfig): AgentKitConfig {
  const next: AgentKitConfig = { ...config };

  if (!hasDefinedValue(next.payments)) {
    // Debug: log what's being pruned
    if (next.payments) {
      console.log(
        '[DEBUG] pruneConfig: payments config exists but hasDefinedValue returned false',
        next.payments
      );
    }
    next.payments = undefined;
  }

  if (next.wallets) {
    const hasAgent = Boolean(next.wallets.agent);
    const hasDeveloper = Boolean(next.wallets.developer);
    if (!hasAgent && !hasDeveloper) {
      next.wallets = undefined;
    }
  }

  return next;
}
