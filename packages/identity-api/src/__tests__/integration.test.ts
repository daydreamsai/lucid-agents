import { describe, expect, it, beforeAll } from 'bun:test';
import { Hono } from 'hono';
import { createIdentityAPI } from '../api';

describe('Integration Tests - API Endpoints', () => {
  let app: Hono;

  beforeAll(() => {
    // Mock identity client
    const mockIdentityClient = {
      address: '0x0000000000000000000000000000000000000001' as const,
      chainId: 84532,
      getAgentByDomain: async () => null,
      getAgentById: async (id: bigint) => ({
        agentId: id,
        owner: '0x1234567890123456789012345678901234567890' as const,
        agentURI: 'https://example.com/.well-known/agent-registration.json',
      }),
      getMetadata: async () => null,
      register: async () => ({ agentId: 1n, transactionHash: '0xabc' as const }),
      setMetadata: async () => '0xabc' as const,
      transfer: async () => '0xabc' as const,
      transferFrom: async () => '0xabc' as const,
      approve: async () => '0xabc' as const,
      setApprovalForAll: async () => '0xabc' as const,
      getApproved: async () => '0x0000000000000000000000000000000000000000' as const,
      isApprovedForAll: async () => false,
      getVersion: async () => '1.0.0',
    };

    const mockReputationClient = {
      address: '0x0000000000000000000000000000000000000002' as const,
      chainId: 84532,
      getIdentityRegistry: async () => '0x0000000000000000000000000000000000000001' as const,
      getFeedback: async () => ({
        agentId: 1n,
        clientAddress: '0x1111111111111111111111111111111111111111' as const,
        feedbackIndex: 1n,
        value: 90n,
        valueDecimals: 0,
        tag1: 'reliable',
        tag2: 'fast',
        isRevoked: false,
      }),
      getAllFeedback: async () => [
        {
          agentId: 1n,
          clientAddress: '0x1111111111111111111111111111111111111111' as const,
          feedbackIndex: 1n,
          value: 90n,
          valueDecimals: 0,
          tag1: 'reliable',
          tag2: 'fast',
          isRevoked: false,
        },
        {
          agentId: 1n,
          clientAddress: '0x2222222222222222222222222222222222222222' as const,
          feedbackIndex: 1n,
          value: 85n,
          valueDecimals: 0,
          tag1: 'quality',
          tag2: '',
          isRevoked: false,
        },
      ],
      getSummary: async () => ({
        count: 2n,
        value: 175n,
        valueDecimals: 0,
      }),
      getClients: async () => [
        '0x1111111111111111111111111111111111111111' as const,
        '0x2222222222222222222222222222222222222222' as const,
      ],
      getLastIndex: async () => 1n,
      getResponseCount: async () => 0n,
      giveFeedback: async () => '0xabc' as const,
      revokeFeedback: async () => '0xabc' as const,
      appendResponse: async () => '0xabc' as const,
      getVersion: async () => '1.0.0',
    };

    app = createIdentityAPI({
      identityClient: mockIdentityClient,
      reputationClient: mockReputationClient,
      enablePayments: false,
    });
  });

  describe('GET /v1/identity/reputation', () => {
    it('returns reputation data for valid agent', async () => {
      const res = await app.request(
        '/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890&chain=eip155:84532'
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.trust_score).toBeGreaterThanOrEqual(0);
      expect(data.trust_score).toBeLessThanOrEqual(100);
      expect(data.completion_rate).toBeGreaterThanOrEqual(0);
      expect(data.completion_rate).toBeLessThanOrEqual(1);
      expect(data.freshness).toBeDefined();
      expect(data.confidence).toBeGreaterThanOrEqual(0);
      expect(data.confidence).toBeLessThanOrEqual(1);
    });

    it('returns 400 for invalid agent address', async () => {
      const res = await app.request(
        '/v1/identity/reputation?agentAddress=invalid&chain=eip155:84532'
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 for missing required parameters', async () => {
      const res = await app.request('/v1/identity/reputation');

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('GET /v1/identity/history', () => {
    it('returns history events for valid agent', async () => {
      const res = await app.request(
        '/v1/identity/history?agentAddress=0x1234567890123456789012345678901234567890&chain=eip155:84532'
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.events)).toBe(true);
      expect(data.total_count).toBeGreaterThanOrEqual(0);
      expect(data.freshness).toBeDefined();
    });

    it('respects limit parameter', async () => {
      const res = await app.request(
        '/v1/identity/history?agentAddress=0x1234567890123456789012345678901234567890&chain=eip155:84532&limit=5'
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.events.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /v1/identity/trust-breakdown', () => {
    it('returns trust breakdown for valid agent', async () => {
      const res = await app.request(
        '/v1/identity/trust-breakdown?agentAddress=0x1234567890123456789012345678901234567890&chain=eip155:84532'
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.components).toBeDefined();
      expect(data.weights).toBeDefined();
      expect(data.overall_score).toBeGreaterThanOrEqual(0);
      expect(data.overall_score).toBeLessThanOrEqual(100);
      expect(data.freshness).toBeDefined();
      expect(data.confidence).toBeGreaterThanOrEqual(0);
      expect(data.confidence).toBeLessThanOrEqual(1);
    });

    it('validates component scores are in range', async () => {
      const res = await app.request(
        '/v1/identity/trust-breakdown?agentAddress=0x1234567890123456789012345678901234567890&chain=eip155:84532'
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      
      Object.values(data.components).forEach((score: any) => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });

    it('validates weights sum to 1', async () => {
      const res = await app.request(
        '/v1/identity/trust-breakdown?agentAddress=0x1234567890123456789012345678901234567890&chain=eip155:84532'
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      
      const weightSum = Object.values(data.weights).reduce(
        (sum: number, weight: any) => sum + weight,
        0
      );
      expect(weightSum).toBeCloseTo(1, 5);
    });
  });

  describe('Error Handling', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await app.request('/v1/identity/unknown');
      expect(res.status).toBe(404);
    });

    it('returns structured error response', async () => {
      const res = await app.request(
        '/v1/identity/reputation?agentAddress=invalid&chain=eip155:84532'
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBeDefined();
      expect(data.error.message).toBeDefined();
    });
  });
});
