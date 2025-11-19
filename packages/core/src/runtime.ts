import { createPaymentsRuntime } from '@lucid-agents/payments';
import type {
  AgentCardWithEntrypoints,
  AgentKitConfig,
  AgentMeta,
  AgentRuntime,
  AP2Config,
} from '@lucid-agents/types/core';
import type { TrustConfig } from '@lucid-agents/types/identity';
import type {
  PaymentsConfig,
  PaymentsRuntime,
} from '@lucid-agents/types/payments';
import { createWalletsRuntime } from '@lucid-agents/wallet';

import { getAgentKitConfig, setActiveInstanceConfig } from './config/config';
import { type AgentCore, createAgentCore } from './core/agent';
import type { Network } from './core/types';
import type { EntrypointDef } from './http/types';
import { buildManifest } from './manifest/manifest';

export type CreateAgentRuntimeOptions = {
  payments?: PaymentsConfig | false;
  ap2?: AP2Config;
  trust?: TrustConfig;
  entrypoints?: Iterable<EntrypointDef>;
  config?: AgentKitConfig;
};

function addEntrypoint(
  def: EntrypointDef,
  payments: PaymentsRuntime | undefined,
  agent: AgentCore,
  invalidateManifestCache: () => void
) {
  if (!def.key) throw new Error('entrypoint.key required');

  if (payments) {
    payments.activate(def);
    if (payments.isActive && payments.config) {
      (agent.config as { payments?: PaymentsConfig | false }).payments =
        payments.config;
    }
  }
  agent.addEntrypoint(def);
  invalidateManifestCache();
}

function createEntrypoints(
  entrypoints: Iterable<EntrypointDef>,
  payments: PaymentsRuntime | undefined,
  agent: AgentCore,
  invalidateManifestCache: () => void
) {
  for (const entrypoint of entrypoints) {
    addEntrypoint(entrypoint, payments, agent, invalidateManifestCache);
  }
}

export function createAgentRuntime(
  meta: AgentMeta,
  opts: CreateAgentRuntimeOptions = {}
): AgentRuntime {
  setActiveInstanceConfig(opts?.config);
  const config = getAgentKitConfig(opts?.config);

  const wallets = createWalletsRuntime(config);
  const payments = createPaymentsRuntime(opts?.payments, config);

  const agent = createAgentCore({
    meta,
    wallets,
    payments: opts?.payments === false ? false : undefined,
  });

  const manifestCache = new Map<string, AgentCardWithEntrypoints>();

  const snapshotEntrypoints = (): EntrypointDef[] =>
    agent.listEntrypoints().map(entry => ({
      ...entry,
      network: entry.network as Network | undefined,
    })) as EntrypointDef[];

  const listEntrypoints = () =>
    snapshotEntrypoints().map(entry => ({
      key: entry.key,
      description: entry.description,
      streaming: Boolean(entry.stream ?? entry.streaming),
    }));

  const buildManifestForOrigin = (origin: string) => {
    const cached = manifestCache.get(origin);
    if (cached) {
      return cached;
    }

    const manifest = buildManifest({
      meta,
      registry: snapshotEntrypoints(),
      origin,
      payments: payments?.config,
      ap2: opts?.ap2,
      trust: opts?.trust,
    });

    manifestCache.set(origin, manifest);
    return manifest;
  };

  const invalidateManifestCache = () => {
    manifestCache.clear();
  };

  if (opts?.entrypoints) {
    createEntrypoints(
      opts.entrypoints,
      payments,
      agent,
      invalidateManifestCache
    );
  }

  return {
    agent,
    config,
    wallets,
    payments,
    entrypoints: {
      add(def: EntrypointDef) {
        addEntrypoint(def, payments, agent, invalidateManifestCache);
      },
      list: listEntrypoints,
      snapshot: snapshotEntrypoints,
    },
    manifest: {
      build: buildManifestForOrigin,
      invalidate: invalidateManifestCache,
    },
  } satisfies AgentRuntime;
}
