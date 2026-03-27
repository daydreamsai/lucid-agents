import { describe, expect, it } from 'bun:test';
import {
  calculateRiskScore,
  findExposurePaths,
  buildEntityProfile,
  computeFreshness,
  validateConfidence,
} from '../lib/risk-engine';

describe('Business Logic Tests - Risk Engine', () => {
  describe('calculateRiskScore', () => {
    it('should return 0 for address with no risk factors', () => {
      const result = calculateRiskScore({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        riskFactors: [],
      });

      expect(result.risk_score).toBe(0);
      expect(result.risk_factors).toHaveLength(0);
    });

    it('should calculate weighted risk score correctly', () => {
      const result = calculateRiskScore({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        riskFactors: [
          { factor: 'sanctions_proximity', weight: 0.4, evidence: ['2 hops'] },
          { factor: 'mixer_exposure', weight: 0.3, evidence: ['tornado'] },
        ],
      });

      expect(result.risk_score).toBeGreaterThan(0);
      expect(result.risk_score).toBeLessThanOrEqual(1);
      expect(result.risk_factors).toHaveLength(2);
    });

    it('should cap risk score at 1.0', () => {
      const result = calculateRiskScore({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        riskFactors: [
          { factor: 'high_risk_1', weight: 0.8, evidence: ['test'] },
          { factor: 'high_risk_2', weight: 0.9, evidence: ['test'] },
        ],
      });

      expect(result.risk_score).toBeLessThanOrEqual(1);
    });

    it('should include evidence references in output', () => {
      const result = calculateRiskScore({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        riskFactors: [
          { factor: 'test', weight: 0.5, evidence: ['evidence_1', 'evidence_2'] },
        ],
      });

      expect(result.evidence_refs.length).toBeGreaterThan(0);
    });
  });

  describe('findExposurePaths', () => {
    it('should return empty paths for isolated address', () => {
      const result = findExposurePaths({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        maxDepth: 3,
        graph: {},
      });

      expect(result.paths).toHaveLength(0);
      expect(result.total_paths).toBe(0);
    });

    it('should find direct exposure paths', () => {
      const graph = {
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb': [
          {
            target: '0x1234567890123456789012345678901234567890',
            risk: 0.7,
            confidence: 0.8,
          },
        ],
      };

      const result = findExposurePaths({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        maxDepth: 2,
        graph,
      });

      expect(result.paths.length).toBeGreaterThan(0);
      expect(result.paths[0].path).toHaveLength(2);
    });

    it('should respect max_depth parameter', () => {
      const graph = {
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb': [
          { target: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', risk: 0.5, confidence: 0.9 },
        ],
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': [
          { target: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', risk: 0.6, confidence: 0.85 },
        ],
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': [
          { target: '0xcccccccccccccccccccccccccccccccccccccccc', risk: 0.7, confidence: 0.8 },
        ],
      };

      const result = findExposurePaths({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        maxDepth: 2,
        graph,
      });

      const maxPathLength = Math.max(...result.paths.map(p => p.path.length));
      expect(maxPathLength).toBeLessThanOrEqual(3); // maxDepth + 1 (includes source)
    });

    it('should filter by min_confidence', () => {
      const graph = {
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb': [
          { target: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', risk: 0.5, confidence: 0.9 },
          { target: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', risk: 0.6, confidence: 0.4 },
        ],
      };

      const result = findExposurePaths({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        maxDepth: 2,
        minConfidence: 0.7,
        graph,
      });

      result.paths.forEach(path => {
        expect(path.confidence).toBeGreaterThanOrEqual(0.7);
      });
    });
  });

  describe('buildEntityProfile', () => {
    it('should build profile with transaction stats', () => {
      const result = buildEntityProfile({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        transactions: [
          { timestamp: '2025-01-01T00:00:00Z', volume: '1000' },
          { timestamp: '2026-02-26T23:00:00Z', volume: '2000' },
        ],
      });

      expect(result.address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
      expect(result.transaction_stats.transaction_count).toBe(2);
      expect(result.transaction_stats.total_volume).toBe('3000');
    });

    it('should identify risk indicators', () => {
      const result = buildEntityProfile({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        transactions: [],
        riskData: {
          sanctionsProximity: 1,
          mixerExposure: true,
          highRiskCounterparties: 5,
        },
      });

      expect(result.risk_indicators.sanctions_proximity).toBe(1);
      expect(result.risk_indicators.mixer_exposure).toBe(true);
      expect(result.risk_indicators.high_risk_counterparties).toBe(5);
    });

    it('should assign labels based on behavior', () => {
      const result = buildEntityProfile({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        transactions: Array(1000).fill({ timestamp: '2026-01-01T00:00:00Z', volume: '10000' }),
      });

      expect(result.labels).toContain('high-volume');
    });
  });

  describe('computeFreshness', () => {
    it('should calculate staleness correctly', () => {
      const dataTimestamp = new Date(Date.now() - 120000); // 2 minutes ago
      const result = computeFreshness(dataTimestamp.toISOString());

      expect(result.staleness_seconds).toBeGreaterThanOrEqual(120);
      expect(result.staleness_seconds).toBeLessThan(130); // allow small variance
    });

    it('should return 0 staleness for current data', () => {
      const dataTimestamp = new Date().toISOString();
      const result = computeFreshness(dataTimestamp);

      expect(result.staleness_seconds).toBeLessThan(5);
    });
  });

  describe('validateConfidence', () => {
    it('should return confidence within [0, 1]', () => {
      expect(validateConfidence(0.85)).toBe(0.85);
      expect(validateConfidence(0)).toBe(0);
      expect(validateConfidence(1)).toBe(1);
    });

    it('should clamp confidence above 1', () => {
      expect(validateConfidence(1.5)).toBe(1);
    });

    it('should clamp confidence below 0', () => {
      expect(validateConfidence(-0.2)).toBe(0);
    });
  });
});
