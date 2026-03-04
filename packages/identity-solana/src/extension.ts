import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { AgentRuntime, Extension } from '@lucid-agents/types/core';

import type { SolanaIdentityConfig, SolanaTrustConfig } from './types';
export type { SolanaIdentityConfig as IdentityConfig } from './types';
import { createSolanaAgentIdentity, getSolanaTrustConfig } from './init';
import { createAgentCardWithSolanaIdentity } from './manifest';

/**
 * Create a Solana identity extension for Lucid agents
 *
 * @example
 * ```typescript
 * import { createAgent } from '@lucid-agents/core';
 * import { identitySolana } from '@lucid-agents/identity-solana';
 *
 * const agent = await createAgent({
 *   name: 'my-solana-agent',
 *   version: '1.0.0',
 * }).use(identitySolana({
 *   config: {
 *     rpcUrl: 'https://api.mainnet-beta.solana.com',
 *     cluster: 'mainnet-beta',
 *     autoRegister: true,
 *     registration: {
 *       name: 'My Solana Agent',
 *       description: 'An agent on Solana',
 *     }
 *   }
 * })).build();
 * ```
 */
export function identitySolana(
  options?: { config?: SolanaIdentityConfig }
): Extension<{
  trust?: SolanaTrustConfig;
  identitySolana?: {
    registration?: SolanaIdentityConfig['registration'];
  };
}> {
  const config = options?.config;
  let trustConfig: SolanaTrustConfig | undefined = config?.trust;
  let identityResult:
    | Awaited<ReturnType<typeof createSolanaAgentIdentity>>
    | undefined;

  return {
    name: 'identity-solana',
    build(): {
      trust?: SolanaTrustConfig;
      identitySolana?: {
        registration?: SolanaIdentityConfig['registration'];
      };
    } {
      const registration = config?.registration;
      return {
        trust: trustConfig,
        identitySolana: registration ? { registration } : undefined,
      };
    },
    async onBuild(runtime: AgentRuntime): Promise<void> {
      // If trust config is already provided, no need to create identity
      if (trustConfig || !runtime.wallets?.agent) {
        return;
      }

      // If identity config is provided, create identity automatically
      if (config?.domain || config?.autoRegister !== undefined) {
        const identityOptions = {
          runtime,
          domain: config.domain,
          autoRegister: config.autoRegister,
          rpcUrl: config.rpcUrl,
          cluster: config.cluster,
          registration: config.registration,
        };

        identityResult = await createSolanaAgentIdentity(identityOptions);
        trustConfig = getSolanaTrustConfig(identityResult);
      }
    },
    onManifestBuild(
      card: AgentCardWithEntrypoints,
      _runtime: AgentRuntime
    ): AgentCardWithEntrypoints {
      // Use trust config from closure (set in onBuild or from config)
      if (trustConfig) {
        return createAgentCardWithSolanaIdentity(card, trustConfig);
      }
      return card;
    },
  };
}
