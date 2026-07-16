import type { AgentManifest } from '@lucid-agents/types/core';
import type { TrustConfig } from '@lucid-agents/types/identity';

/**
 * Creates a new Agent Card with identity/trust metadata added.
 * Immutable - returns new card, doesn't mutate input.
 */
export function createAgentCardWithIdentity(
  card: AgentManifest,
  trustConfig: TrustConfig
): AgentManifest {
  const enhanced: AgentManifest = {
    ...card,
  };

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
