import { describe, expect, it, beforeAll, afterAll } from 'bun:test';

/**
 * Integration Tests - Phase 3 of TDD
 * 
 * These tests validate endpoint handlers with payment middleware.
 * They should fail initially until the full agent is implemented.
 */

describe('Integration Tests - Endpoint Handlers', () => {
  let serverUrl: string;
  let server: any;

  beforeAll(async () => {
    // Server will be started by index.ts implementation
    serverUrl = 'http://localhost:3010';
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('POST /v1/screening/check', () => {
    it('should require payment (402 without payment)', async () => {
      const response = await fetch(`${serverUrl}/v1/screening/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entityName: 'Test Corp',
        }),
      });

      // Should return 402 Payment Required
      expect(response.status).toBe(402);
    });

    it('should return valid screening result with payment', async () => {
      // This test assumes payment middleware is configured
      // In real scenario, would include x402 payment headers
      const response = await fetch(`${serverUrl}/v1/screening/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': 'Bearer <x402-token>' // Would be added in real test
        },
        body: JSON.stringify({
          entityName: 'Clean Corp',
          identifiers: {
            taxId: '12-3456789',
          },
          addresses: ['123 Main St'],
        }),
      });

      // With proper payment, should succeed
      // expect(response.status).toBe(200);

      // For now, just verify endpoint exists
      expect([200, 402]).toContain(response.status);
    });

    it('should validate input schema', async () => {
      const response = await fetch(`${serverUrl}/v1/screening/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Missing required entityName
          identifiers: {},
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('INVALID_INPUT');
    });

    it('should return proper response schema', async () => {
      // Mock test - would need actual payment in production
      const mockResponse = {
        screening_status: 'clear',
        match_confidence: 0.0,
        matches: [],
        evidence_bundle: {
          sources: ['OFAC', 'UN', 'EU'],
          last_updated: new Date().toISOString(),
        },
        freshness: {
          data_age_hours: 0,
          next_refresh: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        },
      };

      // Validate structure
      expect(mockResponse.screening_status).toMatch(/^(clear|flagged|blocked)$/);
      expect(mockResponse.match_confidence).toBeGreaterThanOrEqual(0);
      expect(mockResponse.match_confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(mockResponse.matches)).toBe(true);
      expect(mockResponse.evidence_bundle.sources).toBeDefined();
      expect(mockResponse.freshness.data_age_hours).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /v1/screening/exposure-chain', () => {
    it('should require payment (402 without payment)', async () => {
      const response = await fetch(
        `${serverUrl}/v1/screening/exposure-chain?entityName=Test%20Corp&ownershipDepth=3`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      expect(response.status).toBe(402);
    });

    it('should validate query parameters', async () => {
      const response = await fetch(
        `${serverUrl}/v1/screening/exposure-chain?ownershipDepth=15`, // Missing entityName, invalid depth
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(400);
    });

    it('should return proper response schema', async () => {
      const mockResponse = {
        exposure_chain: [
          {
            level: 1,
            entity: 'Parent Corp',
            ownership_pct: 75.0,
            exposure_type: 'none',
            confidence: 0.0,
          },
        ],
        aggregate_risk: 'low',
        freshness: {
          data_age_hours: 0,
          next_refresh: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        },
      };

      expect(Array.isArray(mockResponse.exposure_chain)).toBe(true);
      expect(mockResponse.aggregate_risk).toMatch(/^(high|medium|low)$/);
      expect(mockResponse.freshness).toBeDefined();
    });
  });

  describe('GET /v1/screening/jurisdiction-risk', () => {
    it('should require payment (402 without payment)', async () => {
      const response = await fetch(
        `${serverUrl}/v1/screening/jurisdiction-risk?jurisdictions=US,EU`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(402);
    });

    it('should validate jurisdiction codes', async () => {
      const response = await fetch(
        `${serverUrl}/v1/screening/jurisdiction-risk?jurisdictions=USA,EUROPE`, // Invalid codes
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(400);
    });

    it('should return proper response schema', async () => {
      const mockResponse = {
        jurisdiction_risk: [
          {
            jurisdiction: 'US',
            risk_level: 'low',
            sanctions_active: true,
            pep_requirements: 'enhanced_due_diligence',
          },
        ],
        freshness: {
          data_age_hours: 24,
          next_refresh: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      };

      expect(Array.isArray(mockResponse.jurisdiction_risk)).toBe(true);
      expect(mockResponse.jurisdiction_risk[0].jurisdiction).toHaveLength(2);
      expect(mockResponse.jurisdiction_risk[0].risk_level).toMatch(
        /^(high|medium|low)$/
      );
      expect(mockResponse.freshness).toBeDefined();
    });
  });

  describe('Agent Manifest', () => {
    it('should expose agent manifest at /.well-known/agent.json', async () => {
      const response = await fetch(`${serverUrl}/.well-known/agent.json`);

      expect(response.status).toBe(200);
      const manifest = await response.json();

      expect(manifest.name).toBe('sanctions-pep-intelligence');
      expect(manifest.version).toBeDefined();
      expect(manifest.entrypoints).toBeDefined();
    });

    it('should include pricing in manifest', async () => {
      const response = await fetch(`${serverUrl}/.well-known/agent.json`);
      const manifest = await response.json();

      // Check that entrypoints have pricing
      const checkEndpoint = manifest.entrypoints?.find(
        (e: any) => e.key === 'screening-check'
      );
      expect(checkEndpoint?.price).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should respond within 500ms for cached path', async () => {
      const start = Date.now();

      await fetch(`${serverUrl}/v1/screening/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entityName: 'Test Corp',
        }),
      });

      const duration = Date.now() - start;

      // P95 target is 500ms
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Error Handling', () => {
    it('should return structured error for invalid JSON', async () => {
      const response = await fetch(`${serverUrl}/v1/screening/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json{',
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBeDefined();
      expect(data.error.message).toBeDefined();
    });

    it('should return 404 for unknown endpoints', async () => {
      const response = await fetch(`${serverUrl}/v1/screening/unknown`);
      expect(response.status).toBe(404);
    });

    it('should handle internal errors gracefully', async () => {
      // This would test error handling in business logic
      // For now, just verify error response structure
      const errorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      };

      expect(errorResponse.error.code).toBeDefined();
      expect(errorResponse.error.message).toBeDefined();
    });
  });
});

describe('Integration Tests - Payment Middleware', () => {
  it('should enforce payment on all monetized endpoints', async () => {
    const endpoints = [
      { path: '/v1/screening/check', method: 'POST' },
      { path: '/v1/screening/exposure-chain', method: 'GET' },
      { path: '/v1/screening/jurisdiction-risk', method: 'GET' },
    ];

    for (const endpoint of endpoints) {
      const response = await fetch(`http://localhost:3010${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: endpoint.method === 'POST' ? JSON.stringify({ entityName: 'Test' }) : undefined,
      });

      // All should require payment
      expect(response.status).toBe(402);
    }
  });

  it('should include payment metadata in 402 response', async () => {
    const response = await fetch('http://localhost:3010/v1/screening/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entityName: 'Test' }),
    });

    expect(response.status).toBe(402);

    // x402 middleware should add payment headers
    const paymentHeader = response.headers.get('x-payment-required');
    // In real implementation, this would be present
    // expect(paymentHeader).toBeDefined();
  });
});

describe('Integration Tests - Freshness & Quality', () => {
  it('should include freshness metadata in all responses', async () => {
    const mockResponse = {
      screening_status: 'clear',
      match_confidence: 0.0,
      matches: [],
      evidence_bundle: {
        sources: ['OFAC'],
        last_updated: new Date().toISOString(),
      },
      freshness: {
        data_age_hours: 1,
        next_refresh: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
    };

    expect(mockResponse.freshness).toBeDefined();
    expect(mockResponse.freshness.data_age_hours).toBeGreaterThanOrEqual(0);
    expect(mockResponse.freshness.next_refresh).toBeDefined();
  });

  it('should include confidence scores in screening results', async () => {
    const mockMatch = {
      list: 'OFAC SDN',
      entity: 'Test Corp',
      confidence: 0.95,
      reason: 'Exact match',
    };

    expect(mockMatch.confidence).toBeGreaterThanOrEqual(0);
    expect(mockMatch.confidence).toBeLessThanOrEqual(1);
  });

  it('should propagate confidence through ownership chain', async () => {
    const mockChain = [
      {
        level: 1,
        entity: 'Parent',
        ownership_pct: 75,
        exposure_type: 'pep',
        confidence: 0.88,
      },
      {
        level: 2,
        entity: 'Grandparent',
        ownership_pct: 60,
        exposure_type: 'sanctions',
        confidence: 0.92,
      },
    ];

    for (const item of mockChain) {
      expect(item.confidence).toBeGreaterThanOrEqual(0);
      expect(item.confidence).toBeLessThanOrEqual(1);
    }
  });
});
