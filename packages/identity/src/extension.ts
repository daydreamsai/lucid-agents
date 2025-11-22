import type {
  AgentCardWithEntrypoints,
  AgentRuntime,
  Extension,
} from '@lucid-agents/types/core';
import type { TrustConfig } from '@lucid-agents/types/identity';

import type { CreateAgentIdentityOptions } from './init';
import { createAgentIdentity, getTrustConfig } from './init';
import { createAgentCardWithIdentity } from './manifest';

export type IdentityConfig = {
  trust?: TrustConfig;
  domain?: string;
  autoRegister?: boolean;
  rpcUrl?: string;
  chainId?: number;
};

export function identity(options?: {
  config?: IdentityConfig;
}): Extension<{ trust?: TrustConfig }> {
  const config = options?.config;
  let trustConfig: TrustConfig | undefined = config?.trust;
  let identityResult:
    | Awaited<ReturnType<typeof createAgentIdentity>>
    | undefined;

  return {
    name: 'identity',
    build(): { trust?: TrustConfig } {
      return { trust: trustConfig };
    },
    async onBuild(runtime: AgentRuntime): Promise<void> {
      // If trust config is already provided, no need to create identity
      if (trustConfig || !runtime.wallets?.agent) {
        return;
      }

      // If identity config is provided, create identity automatically
      if (config?.domain || config?.autoRegister !== undefined) {
        const identityOptions: CreateAgentIdentityOptions = {
          runtime,
          domain: config.domain,
          autoRegister: config.autoRegister,
          rpcUrl: config.rpcUrl,
          chainId: config.chainId,
        };

        identityResult = await createAgentIdentity(identityOptions);
        trustConfig = getTrustConfig(identityResult);
      }
    },
    onManifestBuild(
      card: AgentCardWithEntrypoints,
      _runtime: AgentRuntime
    ): AgentCardWithEntrypoints {
      // Use trust config from closure (set in onBuild or from config)
      if (trustConfig) {
        return createAgentCardWithIdentity(card, trustConfig);
      }
      return card;
    },
  };
}
