/**
 * identitySolana() Extension for Lucid SDK.
 * Mirrors identity() from @lucid-agents/identity but for Solana.
 */

import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { AgentRuntime, Extension } from '@lucid-agents/types/core';
import type { TrustConfig } from '@lucid-agents/types/identity';

import type { SolanaIdentityConfig } from './env';
import type { SolanaAgentRegistrationOptions } from './init';
import { createSolanaAgentIdentity, getSolanaTrustConfig } from './init';
import { createAgentCardWithSolanaIdentity } from './manifest';

export type { SolanaIdentityConfig };

/**
 * identitySolana Extension — add 8004-Solana identity to a Lucid agent.
 *
 * @example
 * ```ts
 * import { createAgent } from '@lucid-agents/core';
 * import { identitySolana, identitySolanaFromEnv } from '@lucid-agents/identity-solana';
 *
 * const agent = await createAgent({ name: 'my-agent', version: '1.0.0' })
 *   .use(identitySolana({ config: identitySolanaFromEnv() }))
 *   .build();
 * ```
 */
export function identitySolana(options?: {
  config?: SolanaIdentityConfig;
}): Extension<{
  trust?: TrustConfig;
  identity?: { registration?: SolanaAgentRegistrationOptions };
}> {
  const config = options?.config;
  let trustConfig: TrustConfig | undefined = config?.trust;

  return {
    name: 'identity-solana',

    build(): {
      trust?: TrustConfig;
      identity?: { registration?: SolanaAgentRegistrationOptions };
    } {
      const registration = config?.registration;
      return {
        trust: trustConfig,
        identity: registration ? { registration } : undefined,
      };
    },

    async onBuild(_runtime: AgentRuntime): Promise<void> {
      // If trust config is already provided, skip automatic setup
      if (trustConfig) return;

      // If identity config is present, auto-configure
      if (config?.domain || config?.autoRegister !== undefined || config?.privateKey) {
        const identityResult = await createSolanaAgentIdentity(config ?? {});
        trustConfig = getSolanaTrustConfig(identityResult);
      }
    },

    onManifestBuild(
      card: AgentCardWithEntrypoints,
      _runtime: AgentRuntime
    ): AgentCardWithEntrypoints {
      if (trustConfig) {
        return createAgentCardWithSolanaIdentity(card, trustConfig);
      }
      return card;
    },
  };
}
