/**
 * Agent card manifest helpers for Solana identity.
 * Mirrors createAgentCardWithIdentity() from @lucid-agents/identity.
 */

import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { TrustConfig } from '@lucid-agents/types/identity';

/**
 * Create a new Agent Card with Solana identity/trust metadata added.
 * Immutable — returns new card, doesn't mutate input.
 */
export function createAgentCardWithSolanaIdentity(
  card: AgentCardWithEntrypoints,
  trustConfig: TrustConfig
): AgentCardWithEntrypoints {
  const enhanced: AgentCardWithEntrypoints = { ...card };

  if (trustConfig.registrations) {
    enhanced.registrations = trustConfig.registrations;
  }

  if (trustConfig.trustModels) {
    const unique = Array.from(new Set(trustConfig.trustModels));
    enhanced.trustModels = unique;
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
