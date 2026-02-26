import { describe, expect, it } from 'bun:test';

import {
  createReputationHandlers,
  createReputationService,
  type HistoryEvent,
  type ReputationDataSource,
} from '../index';

/**
 * Integration tests verifying the complete flow from HTTP request
 * through service layer to response, including x402 payment behavior.
 */
describe('Integration: Full API Flow', () => {
  // Mock data source simulating real data
  const createMockDataSource = (): ReputationDataSource => ({
    fetchIdentityState: async (agentAddress, chain) => ({
      registered: true,
      agentId: '42',
      registryAddress: '0xregistry1234567890123456789012345678901234',
      domain: 'test-agent.example.com',
      owner: agentAddress,
      active: true,
      trustModels: ['feedback', 'inference-validation'],
    }),
    fetchPerformanceMetrics: async (agentAddress, chain, timeframe) => ({
      completionRate: 92.5,
      disputeRate: 3.2,
      totalTasks: 250,
      totalDisputes: 8,
    }),
    fetchEvidence: async (agentAddress, chain, depth) => {
      const baseEvidence = [
        {
          type: 'transaction' as const,
          url: `https://basescan.org/tx/0xabc123`,
          description: 'Task completion transaction',
          timestamp: '2024-01-15T10:00:00Z',
        },
      ];
      if (depth === 'minimal') return baseEvidence.slice(0, 1);
      if (depth === 'standard') return baseEvidence;
      // full
      return [
        ...baseEvidence,
        {
          type: 'attestation' as const,
          url: 'https://eas.example.com/attestation/0xdef456',
          description: 'Identity attestation',
          timestamp: '2024-01-14T08:00:00Z',
        },
        {
          type: 'feedback' as const,
          url: 'https://api.example.com/feedback/123',
          description: 'Peer feedback record',
          timestamp: '2024-01-13T12:00:00Z',
        },
      ];
    },
    fetchHistory: async (agentAddress, chain, limit, offset) => {
      const eventTypes: HistoryEvent['type'][] = ['task_completed', 'feedback_received', 'attestation_added'];
      const allEvents: HistoryEvent[] = Array.from({ length: 100 }, (_, i) => ({
        id: `evt_${String(i + 1).padStart(3, '0')}`,
        type: eventTypes[i % 3],
        timestamp: new Date(Date.now() - i * 3600000).toISOString(),
        details: { index: i },
      }));
      return {
        events: allEvents.slice(offset, offset + limit),
        total: allEvents.length,
      };
    },
    fetchTrustComponents: async (agentAddress, chain, timeframe) => [
      {
        name: 'Task Completion',
        score: 92.5,
        weight: 0.4,
        description: 'Historical task completion rate',
        evidenceCount: 250,
      },
      {
        name: 'Dispute Resolution',
        score: 85,
        weight: 0.3,
        description: 'Dispute handling and resolution track record',
        evidenceCount: 8,
      },
      {
        name: 'Peer Feedback',
        score: 88,
        weight: 0.3,
        description: 'Aggregate ratings from peer agents',
        evidenceCount: 45,
      },
    ],
  });

  describe('GET /v1/identity/reputation', () => {
    it('returns complete reputation payload for valid agent', async () => {
      const service = createReputationService({
        dataSource: createMockDataSource(),
        cacheTtlSeconds: 300,
      });
      const handlers = createReputationHandlers({ service });

      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890&chain=base&timeframe=30d&evidenceDepth=standard'
      );
      const response = await handlers.handleReputation(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.agentAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(body.chain).toBe('base');
      expect(body.trustScore).toBeGreaterThan(0);
      expect(body.trustScore).toBeLessThanOrEqual(100);
      expect(body.completionRate).toBe(92.5);
      expect(body.disputeRate).toBe(3.2);
      expect(body.onchainIdentityState.registered).toBe(true);
      expect(body.onchainIdentityState.active).toBe(true);
      expect(body.evidenceUrls.length).toBeGreaterThan(0);
      expect(body.freshness.source).toBe('aggregated');
      expect(body.freshness.lastUpdated).toBeDefined();
      expect(body.confidence.level).toBeDefined();
      expect(body.confidence.score).toBeGreaterThan(0);
    });

    it('respects evidenceDepth parameter', async () => {
      const service = createReputationService({
        dataSource: createMockDataSource(),
      });
      const handlers = createReputationHandlers({ service });

      const minimalRequest = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890&evidenceDepth=minimal'
      );
      const fullRequest = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890&evidenceDepth=full'
      );

      const minimalResponse = await handlers.handleReputation(minimalRequest);
      const fullResponse = await handlers.handleReputation(fullRequest);

      const minimalBody = await minimalResponse.json();
      const fullBody = await fullResponse.json();

      expect(fullBody.evidenceUrls.length).toBeGreaterThan(
        minimalBody.evidenceUrls.length
      );
    });
  });

  describe('GET /v1/identity/history', () => {
    it('returns paginated history with correct bounds', async () => {
      const service = createReputationService({
        dataSource: createMockDataSource(),
      });
      const handlers = createReputationHandlers({ service });

      const request = new Request(
        'https://api.example.com/v1/identity/history?agentAddress=0x1234567890123456789012345678901234567890&limit=10&offset=5'
      );
      const response = await handlers.handleHistory(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.events.length).toBe(10);
      expect(body.total).toBe(100);
      expect(body.limit).toBe(10);
      expect(body.offset).toBe(5);
      expect(body.events[0].id).toBe('evt_006'); // offset=5 means start at index 5
    });

    it('handles pagination at boundaries', async () => {
      const service = createReputationService({
        dataSource: createMockDataSource(),
      });
      const handlers = createReputationHandlers({ service });

      const request = new Request(
        'https://api.example.com/v1/identity/history?agentAddress=0x1234567890123456789012345678901234567890&limit=20&offset=90'
      );
      const response = await handlers.handleHistory(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.events.length).toBe(10); // Only 10 remaining
      expect(body.total).toBe(100);
    });
  });

  describe('GET /v1/identity/trust-breakdown', () => {
    it('returns weighted component breakdown', async () => {
      const service = createReputationService({
        dataSource: createMockDataSource(),
      });
      const handlers = createReputationHandlers({ service });

      const request = new Request(
        'https://api.example.com/v1/identity/trust-breakdown?agentAddress=0x1234567890123456789012345678901234567890&timeframe=30d'
      );
      const response = await handlers.handleTrustBreakdown(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.components.length).toBe(3);

      // Verify weights sum to 1
      const totalWeight = body.components.reduce(
        (sum: number, c: any) => sum + c.weight,
        0
      );
      expect(totalWeight).toBeCloseTo(1, 2);

      // Verify overall score matches weighted calculation
      const calculatedScore = body.components.reduce(
        (sum: number, c: any) => sum + c.score * c.weight,
        0
      );
      expect(body.overallScore).toBeCloseTo(calculatedScore, 1);
    });
  });

  describe('x402 Payment Integration', () => {
    it('blocks access without payment when required', async () => {
      const service = createReputationService({
        dataSource: createMockDataSource(),
      });
      const handlers = createReputationHandlers({
        service,
        requirePayment: true,
        checkPayment: async () => false,
      });

      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890'
      );
      const response = await handlers.handleReputation(request);
      const body = await response.json();

      expect(response.status).toBe(402);
      expect(body.error.code).toBe('PAYMENT_REQUIRED');
      expect(body.error.details?.x402).toBe(true);
    });

    it('allows access after successful payment', async () => {
      const service = createReputationService({
        dataSource: createMockDataSource(),
      });

      // Simulate payment verification via x402 header
      const checkPayment = async (req: Request) => {
        const paymentHeader = req.headers.get('X-Payment-Proof');
        return paymentHeader === 'valid-proof-token';
      };

      const handlers = createReputationHandlers({
        service,
        requirePayment: true,
        checkPayment,
      });

      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890',
        {
          headers: { 'X-Payment-Proof': 'valid-proof-token' },
        }
      );
      const response = await handlers.handleReputation(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('returns structured errors for validation failures', async () => {
      const service = createReputationService({
        dataSource: createMockDataSource(),
      });
      const handlers = createReputationHandlers({ service });

      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=not-an-address'
      );
      const response = await handlers.handleReputation(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('INVALID_ADDRESS');
      expect(body.error.message).toBeDefined();
    });

    it('handles chain mismatch gracefully', async () => {
      const service = createReputationService({
        dataSource: createMockDataSource(),
      });
      const handlers = createReputationHandlers({ service });

      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890&chain=solana'
      );
      const response = await handlers.handleReputation(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('INVALID_CHAIN');
    });
  });

  describe('Freshness and Staleness', () => {
    it('includes freshness metadata in reputation and trust-breakdown responses', async () => {
      const service = createReputationService({
        dataSource: createMockDataSource(),
        cacheTtlSeconds: 300,
        stalenessThresholdSeconds: 3600,
      });
      const handlers = createReputationHandlers({ service });

      // Test reputation endpoint
      const reputationReq = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890'
      );
      const reputationRes = await handlers.handleReputation(reputationReq);
      const reputationBody = await reputationRes.json();

      expect(reputationBody.freshness).toBeDefined();
      expect(reputationBody.freshness.lastUpdated).toBeDefined();
      expect(reputationBody.freshness.dataAge).toBeGreaterThanOrEqual(0);
      expect(reputationBody.freshness.source).toBeDefined();

      // Test trust-breakdown endpoint
      const breakdownReq = new Request(
        'https://api.example.com/v1/identity/trust-breakdown?agentAddress=0x1234567890123456789012345678901234567890'
      );
      const breakdownRes = await handlers.handleTrustBreakdown(breakdownReq);
      const breakdownBody = await breakdownRes.json();

      expect(breakdownBody.freshness).toBeDefined();
      expect(breakdownBody.freshness.lastUpdated).toBeDefined();
    });

    it('includes confidence annotations where relevant', async () => {
      const service = createReputationService({
        dataSource: createMockDataSource(),
      });
      const handlers = createReputationHandlers({ service });

      // Reputation and trust-breakdown should have confidence
      const reputationReq = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890'
      );
      const breakdownReq = new Request(
        'https://api.example.com/v1/identity/trust-breakdown?agentAddress=0x1234567890123456789012345678901234567890'
      );

      const reputationRes = await handlers.handleReputation(reputationReq);
      const breakdownRes = await handlers.handleTrustBreakdown(breakdownReq);

      const reputationBody = await reputationRes.json();
      const breakdownBody = await breakdownRes.json();

      expect(reputationBody.confidence).toBeDefined();
      expect(reputationBody.confidence.level).toMatch(/^(high|medium|low)$/);
      expect(reputationBody.confidence.score).toBeGreaterThanOrEqual(0);
      expect(reputationBody.confidence.score).toBeLessThanOrEqual(1);
      expect(Array.isArray(reputationBody.confidence.factors)).toBe(true);

      expect(breakdownBody.confidence).toBeDefined();
    });
  });
});
