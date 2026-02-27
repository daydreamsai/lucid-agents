import type { CreateAgentAppReturn } from '@lucid-agents/types/core';
import {
  RiskScoreRequestSchema,
  RiskScoreResponseSchema,
  ExposurePathsRequestSchema,
  ExposurePathsResponseSchema,
  EntityProfileRequestSchema,
  EntityProfileResponseSchema,
} from './schemas';
import {
  calculateRiskScore,
  findExposurePaths,
  buildEntityProfile,
  computeFreshness,
  validateConfidence,
} from './lib/risk-engine';

export * from './schemas';
export * from './lib/risk-engine';

export function addRiskApiEntrypoints(appResult: CreateAgentAppReturn<any, any, any>) {
  const { addEntrypoint } = appResult;

  // POST /v1/risk/score
  addEntrypoint({
    key: 'risk-score',
    description: 'Calculate counterparty risk score with evidence',
    price: '0.10', // $0.10 per call
    input: RiskScoreRequestSchema,
    output: RiskScoreResponseSchema,
    handler: async ctx => {
      const { address, lookback_days = 30 } = ctx.input;

      // Mock risk factors (in production, fetch from graph database)
      const riskFactors = [
        {
          factor: 'sanctions_proximity',
          weight: 0.3,
          evidence: ['Entity within 2 hops of sanctioned address'],
        },
      ];

      const scoreData = calculateRiskScore({ address, riskFactors });
      const freshness = computeFreshness(new Date().toISOString());
      const confidence = validateConfidence(0.85);

      return {
        output: {
          ...scoreData,
          freshness,
          confidence,
        },
      };
    },
  });

  // GET /v1/risk/exposure-paths
  addEntrypoint({
    key: 'exposure-paths',
    description: 'Find exposure paths to high-risk entities',
    price: '0.15', // $0.15 per call
    input: ExposurePathsRequestSchema,
    output: ExposurePathsResponseSchema,
    handler: async ctx => {
      const { address, max_depth = 3, min_confidence = 0.6 } = ctx.input;

      // Mock graph (in production, query graph database)
      const graph = {
        [address]: [
          {
            target: '0x1234567890123456789012345678901234567890',
            risk: 0.7,
            confidence: 0.8,
          },
        ],
      };

      const pathsData = findExposurePaths({
        address,
        maxDepth: max_depth,
        minConfidence: min_confidence,
        graph,
      });

      const freshness = computeFreshness(new Date().toISOString());

      return {
        output: {
          ...pathsData,
          freshness,
        },
      };
    },
  });

  // GET /v1/risk/entity-profile
  addEntrypoint({
    key: 'entity-profile',
    description: 'Get comprehensive entity risk profile',
    price: '0.20', // $0.20 per call
    input: EntityProfileRequestSchema,
    output: EntityProfileResponseSchema,
    handler: async ctx => {
      const { address } = ctx.input;

      // Mock transaction data (in production, fetch from blockchain indexer)
      const transactions = [
        { timestamp: '2025-01-01T00:00:00Z', volume: '1000' },
        { timestamp: '2026-02-26T23:00:00Z', volume: '2000' },
      ];

      const riskData = {
        sanctionsProximity: 2,
        mixerExposure: false,
        highRiskCounterparties: 1,
      };

      const profileData = buildEntityProfile({
        address,
        transactions,
        riskData,
      });

      const freshness = computeFreshness(new Date().toISOString());
      const confidence = validateConfidence(0.92);

      return {
        output: {
          ...profileData,
          freshness,
          confidence,
        },
      };
    },
  });
}
