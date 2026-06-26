import { beforeEach, describe, expect, it, mock } from 'bun:test';

import {
  createErrorResponse,
  createReputationHandlers,
  jsonResponse,
} from '../handlers';
import type { ReputationService } from '../service';

// ============================================================================
// Unit Tests: Helper Functions
// ============================================================================

describe('createErrorResponse', () => {
  it('creates error response with code and message', () => {
    const error = createErrorResponse('INVALID_ADDRESS', 'Bad address');
    expect(error.error.code).toBe('INVALID_ADDRESS');
    expect(error.error.message).toBe('Bad address');
    expect(error.error.details).toBeUndefined();
  });

  it('includes details when provided', () => {
    const error = createErrorResponse('INVALID_ADDRESS', 'Bad address', {
      provided: '0xinvalid',
    });
    expect(error.error.details).toEqual({ provided: '0xinvalid' });
  });
});

describe('jsonResponse', () => {
  it('creates JSON response with correct content type', () => {
    const response = jsonResponse({ test: 'data' });
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('defaults to status 200', () => {
    const response = jsonResponse({ test: 'data' });
    expect(response.status).toBe(200);
  });

  it('uses provided status code', () => {
    const response = jsonResponse({ error: 'not found' }, 404);
    expect(response.status).toBe(404);
  });

  it('serializes data as JSON', async () => {
    const data = { foo: 'bar', num: 123 };
    const response = jsonResponse(data);
    const body = await response.json();
    expect(body).toEqual(data);
  });
});

// ============================================================================
// Integration Tests: Handlers
// ============================================================================

describe('createReputationHandlers', () => {
  let mockService: ReputationService;
  let handlers: ReturnType<typeof createReputationHandlers>;

  const mockReputationResponse = {
    agentAddress: '0x1234567890123456789012345678901234567890',
    chain: 'base' as const,
    trustScore: 85,
    completionRate: 95,
    disputeRate: 2,
    onchainIdentityState: {
      registered: true,
      agentId: '123',
      active: true,
      trustModels: ['feedback'],
    },
    evidenceUrls: [],
    freshness: {
      lastUpdated: '2024-01-15T10:00:00Z',
      dataAge: 60,
      source: 'aggregated' as const,
    },
    confidence: {
      level: 'high' as const,
      score: 0.9,
      factors: ['verified'],
    },
  };

  const mockHistoryResponse = {
    agentAddress: '0x1234567890123456789012345678901234567890',
    chain: 'base' as const,
    events: [
      {
        id: 'evt_001',
        type: 'task_completed' as const,
        timestamp: '2024-01-15T10:00:00Z',
        details: {},
      },
    ],
    total: 100,
    limit: 20,
    offset: 0,
    freshness: {
      lastUpdated: '2024-01-15T10:00:00Z',
      dataAge: 60,
      source: 'onchain' as const,
    },
    confidence: {
      level: 'high' as const,
      score: 0.9,
      factors: ['verified'],
    },
  };

  const mockTrustBreakdownResponse = {
    agentAddress: '0x1234567890123456789012345678901234567890',
    chain: 'base' as const,
    overallScore: 87.5,
    components: [
      {
        name: 'Task Completion',
        score: 95,
        weight: 0.4,
        description: 'Historical completion rate',
        evidenceCount: 100,
      },
    ],
    freshness: {
      lastUpdated: '2024-01-15T10:00:00Z',
      dataAge: 60,
      source: 'aggregated' as const,
    },
    confidence: {
      level: 'high' as const,
      score: 0.9,
      factors: ['verified'],
    },
  };

  beforeEach(() => {
    mockService = {
      getReputation: mock(() => Promise.resolve(mockReputationResponse)),
      getHistory: mock(() => Promise.resolve(mockHistoryResponse)),
      getTrustBreakdown: mock(() => Promise.resolve(mockTrustBreakdownResponse)),
    } as unknown as ReputationService;

    handlers = createReputationHandlers({ service: mockService });
  });

  describe('handleReputation', () => {
    it('returns 200 with valid reputation data', async () => {
      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890&chain=base'
      );
      const response = await handlers.handleReputation(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.trustScore).toBe(85);
      expect(body.agentAddress).toBe('0x1234567890123456789012345678901234567890');
    });

    it('applies default values for optional params', async () => {
      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890'
      );
      await handlers.handleReputation(request);

      expect(mockService.getReputation).toHaveBeenCalledWith({
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        timeframe: '30d',
        evidenceDepth: 'standard',
      });
    });

    it('returns 400 for invalid address', async () => {
      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=invalid'
      );
      const response = await handlers.handleReputation(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('INVALID_ADDRESS');
    });

    it('returns 400 for invalid chain', async () => {
      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890&chain=invalid'
      );
      const response = await handlers.handleReputation(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('INVALID_CHAIN');
    });

    it('returns 400 for invalid timeframe', async () => {
      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890&timeframe=invalid'
      );
      const response = await handlers.handleReputation(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('INVALID_TIMEFRAME');
    });

    it('returns 404 when agent not found', async () => {
      mockService.getReputation = mock(() =>
        Promise.reject(new Error('Agent not found'))
      );
      handlers = createReputationHandlers({ service: mockService });

      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890'
      );
      const response = await handlers.handleReputation(request);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe('AGENT_NOT_FOUND');
    });

    it('returns 500 for internal errors', async () => {
      mockService.getReputation = mock(() =>
        Promise.reject(new Error('Database connection failed'))
      );
      handlers = createReputationHandlers({ service: mockService });

      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890'
      );
      const response = await handlers.handleReputation(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('handleHistory', () => {
    it('returns 200 with paginated history', async () => {
      const request = new Request(
        'https://api.example.com/v1/identity/history?agentAddress=0x1234567890123456789012345678901234567890&limit=20&offset=0'
      );
      const response = await handlers.handleHistory(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.events).toHaveLength(1);
      expect(body.total).toBe(100);
      expect(body.limit).toBe(20);
      expect(body.offset).toBe(0);
    });

    it('parses numeric parameters correctly', async () => {
      const request = new Request(
        'https://api.example.com/v1/identity/history?agentAddress=0x1234567890123456789012345678901234567890&limit=50&offset=100'
      );
      await handlers.handleHistory(request);

      expect(mockService.getHistory).toHaveBeenCalledWith({
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        limit: 50,
        offset: 100,
      });
    });

    it('returns 400 for invalid address', async () => {
      const request = new Request(
        'https://api.example.com/v1/identity/history?agentAddress=bad'
      );
      const response = await handlers.handleHistory(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('INVALID_ADDRESS');
    });
  });

  describe('handleTrustBreakdown', () => {
    it('returns 200 with trust breakdown', async () => {
      const request = new Request(
        'https://api.example.com/v1/identity/trust-breakdown?agentAddress=0x1234567890123456789012345678901234567890'
      );
      const response = await handlers.handleTrustBreakdown(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.overallScore).toBe(87.5);
      expect(body.components).toHaveLength(1);
    });

    it('returns 400 for invalid address', async () => {
      const request = new Request(
        'https://api.example.com/v1/identity/trust-breakdown?agentAddress=invalid'
      );
      const response = await handlers.handleTrustBreakdown(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('INVALID_ADDRESS');
    });
  });

  describe('Payment verification', () => {
    it('returns 402 when payment required but not provided', async () => {
      const checkPayment = mock(() => Promise.resolve(false));
      handlers = createReputationHandlers({
        service: mockService,
        requirePayment: true,
        checkPayment,
      });

      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890'
      );
      const response = await handlers.handleReputation(request);

      expect(response.status).toBe(402);
      const body = await response.json();
      expect(body.error.code).toBe('PAYMENT_REQUIRED');
      expect(body.error.details?.x402).toBe(true);
    });

    it('proceeds when payment verified', async () => {
      const checkPayment = mock(() => Promise.resolve(true));
      handlers = createReputationHandlers({
        service: mockService,
        requirePayment: true,
        checkPayment,
      });

      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890'
      );
      const response = await handlers.handleReputation(request);

      expect(response.status).toBe(200);
    });

    it('skips payment check when requirePayment is false', async () => {
      const checkPayment = mock(() => Promise.resolve(false));
      handlers = createReputationHandlers({
        service: mockService,
        requirePayment: false,
        checkPayment,
      });

      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890'
      );
      const response = await handlers.handleReputation(request);

      expect(response.status).toBe(200);
      expect(checkPayment).not.toHaveBeenCalled();
    });

    it('applies payment check to all endpoints', async () => {
      const checkPayment = mock(() => Promise.resolve(false));
      handlers = createReputationHandlers({
        service: mockService,
        requirePayment: true,
        checkPayment,
      });

      const endpoints = [
        '/v1/identity/reputation',
        '/v1/identity/history',
        '/v1/identity/trust-breakdown',
      ];

      for (const endpoint of endpoints) {
        const request = new Request(
          `https://api.example.com${endpoint}?agentAddress=0x1234567890123456789012345678901234567890`
        );
        const handler =
          endpoint === '/v1/identity/reputation'
            ? handlers.handleReputation
            : endpoint === '/v1/identity/history'
              ? handlers.handleHistory
              : handlers.handleTrustBreakdown;

        const response = await handler(request);
        expect(response.status).toBe(402);
      }
    });

    it('returns 402 when requirePayment is true but checkPayment is omitted (fail-closed)', async () => {
      handlers = createReputationHandlers({
        service: mockService,
        requirePayment: true,
        // checkPayment intentionally omitted
      });

      const address = '0x1234567890123456789012345678901234567890';

      const repResponse = await handlers.handleReputation(
        new Request(`https://api.example.com/v1/identity/reputation?agentAddress=${address}`)
      );
      expect(repResponse.status).toBe(402);
      const repBody = await repResponse.json();
      expect(repBody.error.code).toBe('PAYMENT_REQUIRED');
      expect(repBody.error.details?.x402).toBe(true);

      const histResponse = await handlers.handleHistory(
        new Request(`https://api.example.com/v1/identity/history?agentAddress=${address}`)
      );
      expect(histResponse.status).toBe(402);
      const histBody = await histResponse.json();
      expect(histBody.error.code).toBe('PAYMENT_REQUIRED');

      const trustResponse = await handlers.handleTrustBreakdown(
        new Request(`https://api.example.com/v1/identity/trust-breakdown?agentAddress=${address}`)
      );
      expect(trustResponse.status).toBe(402);
      const trustBody = await trustResponse.json();
      expect(trustBody.error.code).toBe('PAYMENT_REQUIRED');
    });

    it('returns 402 when checkPayment throws an error (fail-closed)', async () => {
      handlers = createReputationHandlers({
        service: mockService,
        requirePayment: true,
        checkPayment: async () => { throw new Error('Payment service unavailable'); },
      });

      const request = new Request(
        'https://api.example.com/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890'
      );
      const response = await handlers.handleReputation(request);

      expect(response.status).toBe(402);
      const body = await response.json();
      expect(body.error.code).toBe('PAYMENT_REQUIRED');
      expect(body.error.details?.x402).toBe(true);
    });
  });
});
