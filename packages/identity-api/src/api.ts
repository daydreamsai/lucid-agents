import { Hono } from 'hono';
import type { IdentityRegistryClient } from '@lucid-agents/identity/dist/registries/identity';
import type { ReputationRegistryClient } from '@lucid-agents/identity/dist/registries/reputation';
import {
  ReputationRequestSchema,
  HistoryRequestSchema,
  TrustBreakdownRequestSchema,
  type ReputationResponse,
  type HistoryResponse,
  type TrustBreakdownResponse,
  type ErrorResponse,
} from './schemas';
import {
  calculateCompletionRate,
  calculateDisputeRate,
  calculateConfidence,
  aggregateTrustBreakdown,
} from './scoring';

export interface IdentityAPIConfig {
  identityClient: IdentityRegistryClient;
  reputationClient: ReputationRegistryClient;
  enablePayments?: boolean;
  paymentConfig?: {
    payTo: string;
    facilitatorUrl: string;
    network: string;
  };
}

export function createIdentityAPI(config: IdentityAPIConfig): Hono {
  const app = new Hono();

  // GET /v1/identity/reputation
  app.get('/v1/identity/reputation', async (c) => {
    try {
      const query = c.req.query();
      const parsed = ReputationRequestSchema.parse(query);

      // Extract chain ID from chain string (e.g., "eip155:84532" -> 84532)
      const chainId = parseInt(parsed.chain.split(':')[1]);

      if (chainId !== config.reputationClient.chainId) {
        const error: ErrorResponse = {
          error: {
            code: 'CHAIN_MISMATCH',
            message: `Chain ${parsed.chain} not supported`,
            details: {
              supported_chains: [`eip155:${config.reputationClient.chainId}`],
            },
          },
        };
        return c.json(error, 400);
      }

      // Fetch reputation data
      const feedback = await config.reputationClient.getAllFeedback(1n); // Mock agent ID
      const summary = await config.reputationClient.getSummary(1n);

      // Calculate metrics
      const completedTasks = 95; // Mock data
      const totalTasks = 100;
      const disputes = 2;

      const completion_rate = calculateCompletionRate(completedTasks, totalTasks);
      const dispute_rate = calculateDisputeRate(disputes, totalTasks);

      const breakdown = aggregateTrustBreakdown(feedback, completedTasks, disputes);

      const now = new Date();
      const ageSeconds = 120; // Mock freshness

      const response: ReputationResponse = {
        trust_score: breakdown.overall_score,
        completion_rate,
        dispute_rate,
        onchain_identity_state: {
          agentId: '1',
          owner: parsed.agentAddress,
          registered: true,
        },
        evidence_urls: [],
        freshness: {
          timestamp: now.toISOString(),
          age_seconds: ageSeconds,
        },
        confidence: calculateConfidence(Number(summary.count), ageSeconds),
      };

      return c.json(response);
    } catch (error) {
      if (error instanceof Error && 'issues' in error) {
        const errorResponse: ErrorResponse = {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid request parameters',
            details: error,
          },
        };
        return c.json(errorResponse, 400);
      }

      const errorResponse: ErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      };
      return c.json(errorResponse, 500);
    }
  });

  // GET /v1/identity/history
  app.get('/v1/identity/history', async (c) => {
    try {
      const query = c.req.query();
      const parsed = HistoryRequestSchema.parse({
        ...query,
        limit: query.limit ? parseInt(query.limit) : undefined,
        offset: query.offset ? parseInt(query.offset) : undefined,
      });

      const chainId = parseInt(parsed.chain.split(':')[1]);

      if (chainId !== config.reputationClient.chainId) {
        const error: ErrorResponse = {
          error: {
            code: 'CHAIN_MISMATCH',
            message: `Chain ${parsed.chain} not supported`,
          },
        };
        return c.json(error, 400);
      }

      // Fetch feedback history
      const feedback = await config.reputationClient.getAllFeedback(1n);

      const events = feedback.slice(parsed.offset, parsed.offset + parsed.limit).map((f) => ({
        type: 'feedback' as const,
        timestamp: new Date().toISOString(),
        from: f.clientAddress,
        value: Number(f.value),
        metadata: {
          tag1: f.tag1,
          tag2: f.tag2,
        },
      }));

      const response: HistoryResponse = {
        events,
        total_count: feedback.length,
        freshness: {
          timestamp: new Date().toISOString(),
          age_seconds: 60,
        },
      };

      return c.json(response);
    } catch (error) {
      if (error instanceof Error && 'issues' in error) {
        const errorResponse: ErrorResponse = {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid request parameters',
            details: error,
          },
        };
        return c.json(errorResponse, 400);
      }

      const errorResponse: ErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      };
      return c.json(errorResponse, 500);
    }
  });

  // GET /v1/identity/trust-breakdown
  app.get('/v1/identity/trust-breakdown', async (c) => {
    try {
      const query = c.req.query();
      const parsed = TrustBreakdownRequestSchema.parse(query);

      const chainId = parseInt(parsed.chain.split(':')[1]);

      if (chainId !== config.reputationClient.chainId) {
        const error: ErrorResponse = {
          error: {
            code: 'CHAIN_MISMATCH',
            message: `Chain ${parsed.chain} not supported`,
          },
        };
        return c.json(error, 400);
      }

      // Fetch reputation data
      const feedback = await config.reputationClient.getAllFeedback(1n);
      const summary = await config.reputationClient.getSummary(1n);

      const completedTasks = 95;
      const disputes = 2;

      const breakdown = aggregateTrustBreakdown(feedback, completedTasks, disputes);

      const now = new Date();
      const ageSeconds = 30;

      const response: TrustBreakdownResponse = {
        components: breakdown.components,
        weights: breakdown.weights,
        overall_score: breakdown.overall_score,
        freshness: {
          timestamp: now.toISOString(),
          age_seconds: ageSeconds,
        },
        confidence: calculateConfidence(Number(summary.count), ageSeconds),
      };

      return c.json(response);
    } catch (error) {
      if (error instanceof Error && 'issues' in error) {
        const errorResponse: ErrorResponse = {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid request parameters',
            details: error,
          },
        };
        return c.json(errorResponse, 400);
      }

      const errorResponse: ErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      };
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
