// ERC-8004 Identity Reputation Signal API
// Provides paid HTTP endpoints for agent trust/reputation signals

export {
  createErrorResponse,
  createReputationHandlers,
  jsonResponse,
} from './handlers';
export type { ReputationHandlerConfig, ReputationHandlers } from './handlers';

export * from './schemas';

export {
  calculateConfidence,
  calculateTrustScore,
  createFreshnessMetadata,
  createReputationService,
  ReputationService,
} from './service';
export type { ReputationDataSource, ReputationServiceConfig } from './service';
