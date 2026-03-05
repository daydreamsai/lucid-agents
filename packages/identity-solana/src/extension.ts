/**
 * Lucid SDK extension for Solana identity.
 *
 * Usage:
 * ```ts
 * import { createAgent } from '@lucid-agents/core';
 * import { identitySolana, identitySolanaFromEnv } from '@lucid-agents/identity-solana';
 *
 * const agent = await createAgent({ name: 'my-agent', version: '1.0.0' })
 *   .use(identitySolana({ config: identitySolanaFromEnv() }))
 *   .build();
 * ```
 */

import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { AgentRuntime, Extension } from '@lucid-agents/types/core';
import type { TrustConfig } from '@lucid-agents/types/identity';

import { createSolanaAgentIdentity, getSolanaTrustConfig } from './init.js';
import type { SolanaIdentityConfig } from './types.js';

export type { SolanaIdentityConfig };

/**
 * Applies trust/identity metadata from the Solana identity to the agent card.
 * Mirrors createAgentCardWithIdentity() from @lucid-agents/identity.
 */
function createAgentCardWithSolanaIdentity(
  card: AgentCardWithEntrypoints,
  trustConfig: TrustConfig
): AgentCardWithEntrypoints {
  const enhanced: AgentCardWithEntrypoints = { ...card };

  if (trustConfig.registrations) {
    enhanced.registrations = [
      ...(card.registrations ?? []),
      ...trustConfig.registrations,
    ];
  }
  if (trustConfig.trustModels) {
    enhanced.trustModels = Array.from(
      new Set([...(card.trustModels ?? []), ...trustConfig.trustModels])
    );
  }
  if (trustConfig.validationRequestsUri) {
    enhanced.ValidationRequestsURI = trustConfig.validationRequestsUri;
  }
  if (trustConfig.validationResponsesUri) {
    enhanced.ValidationResponsesURI = trustConfig.validationResponsesUri;
  }
  if (trustConfig.feedbackDataUri) {
    enhanced.FeedbackDataURI = trustConfig.feedbackDataUri;
  }

  return enhanced;
}

export { createAgentCardWithSolanaIdentity };

/**
 * Lucid SDK extension: Solana identity.
 *
 * Attaches Solana on-chain identity to the agent manifest during build.
 * Mirrors identity() from @lucid-agents/identity.
 *
 * @param options.config SolanaIdentityConfig (use identitySolanaFromEnv() to load from env)
 */
export function identitySolana(options?: {
  config?: SolanaIdentityConfig;
}): Extension<{
  trust?: TrustConfig;
}> {
  const config = options?.config;
  let trustConfig: TrustConfig | undefined = config?.trust;

  return {
    name: 'identity-solana',

    build(): { trust?: TrustConfig } {
      return { trust: trustConfig };
    },

    async onBuild(runtime: AgentRuntime): Promise<void> {
      // If trust config is already provided, skip identity creation
      if (trustConfig) return;

      // Only auto-create if domain or autoRegister is configured
      if (config?.domain || config?.autoRegister !== undefined || config?.cluster || config?.rpcUrl) {
        const identity = await createSolanaAgentIdentity({
          domain: config?.domain,
          autoRegister: config?.autoRegister,
          cluster: config?.cluster,
          rpcUrl: config?.rpcUrl,
          skipSend: config?.skipSend,
        });
        trustConfig = getSolanaTrustConfig(identity);

        // Update the runtime extension state so downstream consumers see the resolved trust
        if (trustConfig && runtime.extensions?.['identity-solana']) {
          (runtime.extensions['identity-solana'] as { trust?: TrustConfig }).trust = trustConfig;
        }
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
