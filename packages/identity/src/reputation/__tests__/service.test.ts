import { beforeEach, describe, expect, it, mock } from 'bun:test';

import type {
  EvidenceUrl,
  HistoryEvent,
  OnchainIdentityState,
  TrustComponent,
} from '../schemas';
import {
  calculateConfidence,
  calculateTrustScore,
  createFreshnessMetadata,
  createReputationService,
  type ReputationDataSource,
  ReputationService,
} from '../service';

// ============================================================================
// Unit Tests: Pure Functions
// ============================================================================

describe('calculateTrustScore', () => {
  it('returns maximum score for perfect metrics', () => {
    const score = calculateTrustScore({
      completionRate: 100,
      disputeRate: 0,
      isRegistered: true,
      isActive: true,
      historyEventCount: 100,
    });
    expect(score).toBe(100);
  });

  it('returns minimum score for worst metrics', () => {
    const score = calculateTrustScore({
      completionRate: 0,
      disputeRate: 100,
      isRegistered: false,
      isActive: false,
      historyEventCount: 0,
    });
    expect(score).toBe(0);
  });

  it('weights completion rate at 40%', () => {
    const baseScore = calculateTrustScore({
      completionRate: 0,
      disputeRate: 0,
      isRegistered: false,
      isActive: false,
      historyEventCount: 0,
    });
    const withCompletion = calculateTrustScore({
      completionRate: 100,
      disputeRate: 0,
      isRegistered: false,
      isActive: false,
      historyEventCount: 0,
    });
    expect(withCompletion - baseScore).toBeCloseTo(40, 1);
  });

  it('weights dispute rate inversely at 30%', () => {
    const lowDispute = calculateTrustScore({
      completionRate: 50,
      disputeRate: 0,
      isRegistered: false,
      isActive: false,
      historyEventCount: 0,
    });
    const highDispute = calculateTrustScore({
      completionRate: 50,
      disputeRate: 100,
      isRegistered: false,
      isActive: false,
      historyEventCount: 0,
    });
    expect(lowDispute - highDispute).toBeCloseTo(30, 1);
  });

  it('adds 20% for verified identity (registered + active)', () => {
    const unverified = calculateTrustScore({
      completionRate: 50,
      disputeRate: 50,
      isRegistered: false,
      isActive: false,
      historyEventCount: 50,
    });
    const verified = calculateTrustScore({
      completionRate: 50,
      disputeRate: 50,
      isRegistered: true,
      isActive: true,
      historyEventCount: 50,
    });
    expect(verified - unverified).toBeCloseTo(20, 1);
  });

  it('caps history contribution at 10%', () => {
    const lowHistory = calculateTrustScore({
      completionRate: 50,
      disputeRate: 50,
      isRegistered: false,
      isActive: false,
      historyEventCount: 0,
    });
    const highHistory = calculateTrustScore({
      completionRate: 50,
      disputeRate: 50,
      isRegistered: false,
      isActive: false,
      historyEventCount: 1000, // Way over 100
    });
    expect(highHistory - lowHistory).toBeCloseTo(10, 1);
  });

  it('returns score rounded to 2 decimal places', () => {
    const score = calculateTrustScore({
      completionRate: 33.333,
      disputeRate: 16.666,
      isRegistered: true,
      isActive: false,
      historyEventCount: 33,
    });
    const decimalPlaces = (score.toString().split('.')[1] || '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });
});

describe('calculateConfidence', () => {
  it('returns high confidence for fresh data with abundant evidence', () => {
    const confidence = calculateConfidence({
      dataAge: 100,
      evidenceCount: 100,
      isRegistered: true,
      stalenessThreshold: 3600,
    });
    expect(confidence.level).toBe('high');
    expect(confidence.score).toBeGreaterThanOrEqual(0.8);
    expect(confidence.factors).toContain('fresh_data');
    expect(confidence.factors).toContain('abundant_evidence');
    expect(confidence.factors).toContain('verified_identity');
  });

  it('returns medium confidence for recent data with sufficient evidence', () => {
    const confidence = calculateConfidence({
      dataAge: 2000,
      evidenceCount: 25,
      isRegistered: false,
      stalenessThreshold: 3600,
    });
    expect(confidence.level).toBe('medium');
    expect(confidence.score).toBeGreaterThanOrEqual(0.5);
    expect(confidence.score).toBeLessThan(0.8);
  });

  it('returns low confidence for very stale data with minimal evidence', () => {
    const confidence = calculateConfidence({
      dataAge: 7200, // 2 hours, well past threshold
      evidenceCount: 2, // Very limited
      isRegistered: false,
      stalenessThreshold: 1800, // 30 min threshold to ensure stale
    });
    expect(confidence.level).toBe('low');
    expect(confidence.score).toBeLessThan(0.5);
    expect(confidence.factors).toContain('stale_data');
    expect(confidence.factors).toContain('limited_evidence');
  });

  it('caps score at 1.0', () => {
    const confidence = calculateConfidence({
      dataAge: 0,
      evidenceCount: 1000,
      isRegistered: true,
      stalenessThreshold: 3600,
    });
    expect(confidence.score).toBeLessThanOrEqual(1);
  });

  it('includes fresh_data factor when data age is less than half threshold', () => {
    const confidence = calculateConfidence({
      dataAge: 500, // Less than half of 3600
      evidenceCount: 50,
      isRegistered: true,
      stalenessThreshold: 3600,
    });
    expect(confidence.factors).toContain('fresh_data');
    expect(confidence.factors).toContain('abundant_evidence');
    expect(confidence.factors).toContain('verified_identity');
  });
});

describe('createFreshnessMetadata', () => {
  it('calculates data age correctly', () => {
    const lastUpdated = new Date(Date.now() - 60000); // 1 minute ago
    const freshness = createFreshnessMetadata(lastUpdated, 'onchain');
    expect(freshness.dataAge).toBeGreaterThanOrEqual(59);
    expect(freshness.dataAge).toBeLessThanOrEqual(61);
  });

  it('sets source correctly', () => {
    const freshness = createFreshnessMetadata(new Date(), 'cache');
    expect(freshness.source).toBe('cache');
  });

  it('includes nextRefresh when cacheTtl provided', () => {
    const lastUpdated = new Date();
    const freshness = createFreshnessMetadata(lastUpdated, 'aggregated', 300);
    expect(freshness.nextRefresh).toBeDefined();
    const nextRefresh = new Date(freshness.nextRefresh!);
    expect(nextRefresh.getTime() - lastUpdated.getTime()).toBe(300000);
  });

  it('omits nextRefresh when cacheTtl not provided', () => {
    const freshness = createFreshnessMetadata(new Date(), 'onchain');
    expect(freshness.nextRefresh).toBeUndefined();
  });

  it('formats lastUpdated as ISO string', () => {
    const freshness = createFreshnessMetadata(new Date(), 'onchain');
    expect(freshness.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ============================================================================
// Integration Tests: ReputationService
// ============================================================================

describe('ReputationService', () => {
  let mockDataSource: ReputationDataSource;
  let service: ReputationService;

  const mockIdentityState: OnchainIdentityState = {
    registered: true,
    agentId: '123',
    registryAddress: '0xregistry',
    domain: 'agent.example.com',
    owner: '0xowner',
    active: true,
    trustModels: ['feedback'],
  };

  const mockMetrics = {
    completionRate: 95,
    disputeRate: 2,
    totalTasks: 100,
    totalDisputes: 2,
  };

  const mockEvidence: EvidenceUrl[] = [
    {
      type: 'transaction' as const,
      url: 'https://basescan.org/tx/0x123',
      timestamp: '2024-01-15T10:00:00Z',
    },
  ];

  const mockHistoryEvents: HistoryEvent[] = [
    {
      id: 'evt_001',
      type: 'task_completed',
      timestamp: '2024-01-15T10:00:00Z',
      details: { taskId: 'task_123' },
    },
  ];

  const mockTrustComponents: TrustComponent[] = [
    {
      name: 'Task Completion',
      score: 95,
      weight: 0.4,
      description: 'Historical task completion rate',
      evidenceCount: 100,
    },
    {
      name: 'Dispute Resolution',
      score: 90,
      weight: 0.3,
      description: 'Dispute handling',
      evidenceCount: 5,
    },
    {
      name: 'Peer Feedback',
      score: 85,
      weight: 0.3,
      description: 'Ratings from other agents',
      evidenceCount: 45,
    },
  ];

  beforeEach(() => {
    mockDataSource = {
      fetchIdentityState: mock(() => Promise.resolve(mockIdentityState)),
      fetchPerformanceMetrics: mock(() => Promise.resolve(mockMetrics)),
      fetchEvidence: mock(() => Promise.resolve(mockEvidence)),
      fetchHistory: mock(() =>
        Promise.resolve({ events: mockHistoryEvents, total: 50 })
      ),
      fetchTrustComponents: mock(() => Promise.resolve(mockTrustComponents)),
    };

    service = createReputationService({
      dataSource: mockDataSource,
      cacheTtlSeconds: 300,
      stalenessThresholdSeconds: 3600,
    });
  });

  describe('getReputation', () => {
    it('returns complete reputation response', async () => {
      const response = await service.getReputation({
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        timeframe: '30d',
        evidenceDepth: 'standard',
      });

      expect(response.agentAddress).toBe(
        '0x1234567890123456789012345678901234567890'
      );
      expect(response.chain).toBe('base');
      expect(response.trustScore).toBeGreaterThan(0);
      expect(response.completionRate).toBe(95);
      expect(response.disputeRate).toBe(2);
      expect(response.onchainIdentityState).toEqual(mockIdentityState);
      expect(response.evidenceUrls).toEqual(mockEvidence);
      expect(response.freshness).toBeDefined();
      expect(response.confidence).toBeDefined();
    });

    it('calls data source with correct parameters', async () => {
      await service.getReputation({
        agentAddress: '0xabcd',
        chain: 'ethereum',
        timeframe: '7d',
        evidenceDepth: 'full',
      });

      expect(mockDataSource.fetchIdentityState).toHaveBeenCalledWith(
        '0xabcd',
        'ethereum'
      );
      expect(mockDataSource.fetchPerformanceMetrics).toHaveBeenCalledWith(
        '0xabcd',
        'ethereum',
        '7d'
      );
      expect(mockDataSource.fetchEvidence).toHaveBeenCalledWith(
        '0xabcd',
        'ethereum',
        'full'
      );
    });

    it('fetches data in parallel', async () => {
      const callOrder: string[] = [];
      mockDataSource.fetchIdentityState = mock(async () => {
        callOrder.push('identity_start');
        await new Promise(r => setTimeout(r, 10));
        callOrder.push('identity_end');
        return mockIdentityState;
      });
      mockDataSource.fetchPerformanceMetrics = mock(async () => {
        callOrder.push('metrics_start');
        await new Promise(r => setTimeout(r, 10));
        callOrder.push('metrics_end');
        return mockMetrics;
      });

      await service.getReputation({
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        timeframe: '30d',
        evidenceDepth: 'standard',
      });

      // Both should start before either ends (parallel execution)
      const identityStartIdx = callOrder.indexOf('identity_start');
      const metricsStartIdx = callOrder.indexOf('metrics_start');
      const identityEndIdx = callOrder.indexOf('identity_end');
      const metricsEndIdx = callOrder.indexOf('metrics_end');

      expect(identityStartIdx).toBeLessThan(identityEndIdx);
      expect(metricsStartIdx).toBeLessThan(metricsEndIdx);
      // Both starts should happen before both ends
      expect(Math.max(identityStartIdx, metricsStartIdx)).toBeLessThan(
        Math.min(identityEndIdx, metricsEndIdx)
      );
    });

    it('includes freshness metadata with aggregated source', async () => {
      const response = await service.getReputation({
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        timeframe: '30d',
        evidenceDepth: 'standard',
      });

      expect(response.freshness.source).toBe('aggregated');
      expect(response.freshness.lastUpdated).toBeDefined();
      expect(response.freshness.dataAge).toBeGreaterThanOrEqual(0);
    });

    it('calculates confidence based on evidence and registration', async () => {
      const response = await service.getReputation({
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        timeframe: '30d',
        evidenceDepth: 'standard',
      });

      expect(response.confidence.level).toBeDefined();
      expect(response.confidence.score).toBeGreaterThan(0);
      expect(response.confidence.factors.length).toBeGreaterThan(0);
    });
  });

  describe('getHistory', () => {
    it('returns paginated history response', async () => {
      const response = await service.getHistory({
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        limit: 20,
        offset: 0,
      });

      expect(response.agentAddress).toBe(
        '0x1234567890123456789012345678901234567890'
      );
      expect(response.chain).toBe('base');
      expect(response.events).toEqual(mockHistoryEvents);
      expect(response.total).toBe(50);
      expect(response.limit).toBe(20);
      expect(response.offset).toBe(0);
      expect(response.freshness).toBeDefined();
    });

    it('passes pagination parameters to data source', async () => {
      await service.getHistory({
        agentAddress: '0xabcd',
        chain: 'ethereum',
        limit: 50,
        offset: 100,
      });

      expect(mockDataSource.fetchHistory).toHaveBeenCalledWith(
        '0xabcd',
        'ethereum',
        50,
        100
      );
    });

    it('includes freshness metadata with onchain source', async () => {
      const response = await service.getHistory({
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        limit: 20,
        offset: 0,
      });

      expect(response.freshness.source).toBe('onchain');
    });
  });

  describe('getTrustBreakdown', () => {
    it('returns trust breakdown with components', async () => {
      const response = await service.getTrustBreakdown({
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        timeframe: '30d',
      });

      expect(response.agentAddress).toBe(
        '0x1234567890123456789012345678901234567890'
      );
      expect(response.chain).toBe('base');
      expect(response.components).toEqual(mockTrustComponents);
      expect(response.overallScore).toBeGreaterThan(0);
      expect(response.freshness).toBeDefined();
      expect(response.confidence).toBeDefined();
    });

    it('calculates overall score from weighted components', async () => {
      const response = await service.getTrustBreakdown({
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        timeframe: '30d',
      });

      // Expected: 95*0.4 + 90*0.3 + 85*0.3 = 38 + 27 + 25.5 = 90.5
      expect(response.overallScore).toBeCloseTo(90.5, 1);
    });

    it('aggregates evidence count for confidence calculation', async () => {
      const response = await service.getTrustBreakdown({
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        timeframe: '30d',
      });

      // Total evidence: 100 + 5 + 45 = 150 (abundant)
      expect(response.confidence.factors).toContain('abundant_evidence');
    });
  });
});
