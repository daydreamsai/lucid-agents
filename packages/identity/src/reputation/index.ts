// ERC-8004 Identity Reputation Signal API
// Provides paid HTTP endpoints for agent trust/reputation signals

export {
  createErrorResponse,
  createReputationHandlers,
  jsonResponse,
  type ReputationHandlerConfig,
  type ReputationHandlers,
} from './handlers';
export * from './schemas';
export {
  calculateConfidence,
  calculateTrustScore,
  createFreshnessMetadata,
  createReputationService,
  type ReputationDataSource,
  ReputationService,
  type ReputationServiceConfig,
} from './service';
