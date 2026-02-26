import { describe, it, expect } from 'vitest';
import { LineageRequestSchema, LineageResponseSchema, FreshnessRequestSchema, FreshnessResponseSchema, VerifyHashRequestSchema, VerifyHashResponseSchema } from './schema';
import { getLineage, checkFreshness, verifyHash, generateFreshness } from './logic';

describe('Contract Tests', () => {
  it('should accept valid lineage request', () => {
    expect(LineageRequestSchema.safeParse({ datasetId: 'ds-123' }).success).toBe(true);
  });
  it('should reject empty datasetId', () => {
    expect(LineageRequestSchema.safeParse({ datasetId: '' }).success).toBe(false);
  });
  it('should accept valid hash format', () => {
    expect(VerifyHashRequestSchema.safeParse({ datasetId: 'ds-123', expectedHash: '0x' + 'a'.repeat(64) }).success).toBe(true);
  });
  it('should reject invalid hash', () => {
    expect(VerifyHashRequestSchema.safeParse({ datasetId: 'ds-123', expectedHash: 'invalid' }).success).toBe(false);
  });
  it('should validate lineage response', () => {
    expect(LineageResponseSchema.safeParse(getLineage({ datasetId: 'ds-123' })).success).toBe(true);
  });
  it('should validate freshness response', () => {
    expect(FreshnessResponseSchema.safeParse(checkFreshness({ datasetId: 'ds-123' })).success).toBe(true);
  });
  it('should validate verify-hash response', () => {
    expect(VerifyHashResponseSchema.safeParse(verifyHash({ datasetId: 'ds-123', expectedHash: '0x' + 'a'.repeat(64) })).success).toBe(true);
  });
});

describe('Business Logic Tests', () => {
  describe('getLineage', () => {
    it('should return nodes and edges', () => {
      const r = getLineage({ datasetId: 'ds-123' });
      expect(r.lineage_graph.nodes.length).toBeGreaterThan(0);
      expect(r.lineage_graph.edges.length).toBeGreaterThan(0);
    });
    it('should respect depth', () => {
      const shallow = getLineage({ datasetId: 'ds-123', depth: 1 });
      const deep = getLineage({ datasetId: 'ds-123', depth: 5 });
      expect(deep.lineage_graph.nodes.length).toBeGreaterThan(shallow.lineage_graph.nodes.length);
    });
    it('should include root_id', () => {
      const r = getLineage({ datasetId: 'ds-123' });
      expect(r.lineage_graph.nodes.some(n => n.id === r.lineage_graph.root_id)).toBe(true);
    });
  });

  describe('checkFreshness', () => {
    it('should return staleness_ms >= 0', () => {
      expect(checkFreshness({ datasetId: 'ds-123' }).staleness_ms).toBeGreaterThanOrEqual(0);
    });
    it('should return valid sla_status', () => {
      expect(['fresh', 'stale', 'expired', 'unknown']).toContain(checkFreshness({ datasetId: 'ds-123' }).sla_status);
    });
    it('should include attestation_refs', () => {
      expect(checkFreshness({ datasetId: 'ds-123' }).attestation_refs.length).toBeGreaterThan(0);
    });
  });

  describe('verifyHash', () => {
    it('should return valid verification_status', () => {
      expect(['verified', 'mismatch', 'not_found', 'error']).toContain(verifyHash({ datasetId: 'ds-123', expectedHash: '0x' + 'a'.repeat(64) }).verification_status);
    });
    it('should return expected_hash matching input', () => {
      const hash = '0x' + 'b'.repeat(64);
      expect(verifyHash({ datasetId: 'ds-123', expectedHash: hash }).expected_hash).toBe(hash);
    });
  });
});

describe('Freshness Tests', () => {
  it('fresh when low staleness', () => expect(generateFreshness(0).sla_status).toBe('fresh'));
  it('stale when medium staleness', () => expect(generateFreshness(400000).sla_status).toBe('stale'));
  it('expired when high staleness', () => expect(generateFreshness(4000000).sla_status).toBe('expired'));
});
