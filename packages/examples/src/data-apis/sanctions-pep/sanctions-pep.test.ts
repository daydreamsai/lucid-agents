import { describe, it, expect } from 'vitest';
import { ScreeningCheckRequestSchema, ScreeningCheckResponseSchema, ExposureChainRequestSchema, ExposureChainResponseSchema, JurisdictionRiskRequestSchema, JurisdictionRiskResponseSchema } from './schema';
import { screenEntity, getExposureChain, assessJurisdictionRisk, generateFreshness } from './logic';

describe('Contract Tests', () => {
  it('should accept valid screening request', () => {
    expect(ScreeningCheckRequestSchema.safeParse({ entityName: 'John Doe' }).success).toBe(true);
  });
  it('should accept screening with identifiers', () => {
    expect(ScreeningCheckRequestSchema.safeParse({ entityName: 'John Doe', identifiers: [{ type: 'passport', value: 'AB123456' }] }).success).toBe(true);
  });
  it('should reject empty entityName', () => {
    expect(ScreeningCheckRequestSchema.safeParse({ entityName: '' }).success).toBe(false);
  });
  it('should accept valid jurisdiction request', () => {
    expect(JurisdictionRiskRequestSchema.safeParse({ jurisdictions: ['US', 'UK'] }).success).toBe(true);
  });
  it('should reject invalid jurisdiction code', () => {
    expect(JurisdictionRiskRequestSchema.safeParse({ jurisdictions: ['USA'] }).success).toBe(false);
  });
  it('should validate screening response', () => {
    expect(ScreeningCheckResponseSchema.safeParse(screenEntity({ entityName: 'Test Entity' })).success).toBe(true);
  });
  it('should validate exposure chain response', () => {
    expect(ExposureChainResponseSchema.safeParse(getExposureChain({ entityName: 'Test Corp' })).success).toBe(true);
  });
  it('should validate jurisdiction risk response', () => {
    expect(JurisdictionRiskResponseSchema.safeParse(assessJurisdictionRisk({ jurisdictions: ['US', 'RU'] })).success).toBe(true);
  });
});

describe('Business Logic Tests', () => {
  describe('screenEntity', () => {
    it('should return valid screening_status', () => {
      const r = screenEntity({ entityName: 'Test Person' });
      expect(['clear', 'potential_match', 'confirmed_match', 'error']).toContain(r.screening_status);
    });
    it('should return match_confidence between 0-100', () => {
      const r = screenEntity({ entityName: 'Test Person' });
      expect(r.match_confidence).toBeGreaterThanOrEqual(0);
      expect(r.match_confidence).toBeLessThanOrEqual(100);
    });
    it('should return consistent results', () => {
      const r1 = screenEntity({ entityName: 'Consistent Test' });
      const r2 = screenEntity({ entityName: 'Consistent Test' });
      expect(r1.screening_status).toBe(r2.screening_status);
    });
    it('should include matches when not clear', () => {
      const r = screenEntity({ entityName: 'High Risk Entity XYZ' });
      if (r.screening_status !== 'clear') {
        expect(r.matches.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getExposureChain', () => {
    it('should return exposure chain array', () => {
      const r = getExposureChain({ entityName: 'Test Corp' });
      expect(r.exposure_chain.length).toBeGreaterThan(0);
    });
    it('should include root entity first', () => {
      const r = getExposureChain({ entityName: 'Root Entity' });
      expect(r.exposure_chain[0].entity_name).toBe('Root Entity');
    });
    it('should return risk score between 0-100', () => {
      const r = getExposureChain({ entityName: 'Test Corp' });
      expect(r.total_risk_score).toBeGreaterThanOrEqual(0);
      expect(r.total_risk_score).toBeLessThanOrEqual(100);
    });
    it('should respect ownershipDepth', () => {
      const shallow = getExposureChain({ entityName: 'Test', ownershipDepth: 1 });
      const deep = getExposureChain({ entityName: 'Test', ownershipDepth: 5 });
      expect(deep.exposure_chain.length).toBeGreaterThan(shallow.exposure_chain.length);
    });
  });

  describe('assessJurisdictionRisk', () => {
    it('should return risk for each jurisdiction', () => {
      const r = assessJurisdictionRisk({ jurisdictions: ['US', 'UK', 'DE'] });
      expect(r.jurisdiction_risk.length).toBe(3);
    });
    it('should flag high-risk jurisdictions', () => {
      const r = assessJurisdictionRisk({ jurisdictions: ['KP', 'IR'] });
      r.jurisdiction_risk.forEach(j => {
        expect(['very_high', 'prohibited']).toContain(j.risk_level);
      });
    });
    it('should return valid overall_risk', () => {
      const r = assessJurisdictionRisk({ jurisdictions: ['US'] });
      expect(['low', 'medium', 'high', 'very_high', 'prohibited']).toContain(r.overall_risk);
    });
  });
});

describe('Freshness Tests', () => {
  it('fresh when low staleness', () => expect(generateFreshness(0).sla_status).toBe('fresh'));
  it('stale when medium staleness', () => expect(generateFreshness(400000).sla_status).toBe('stale'));
  it('expired when high staleness', () => expect(generateFreshness(4000000).sla_status).toBe('expired'));
});

describe('Integration Tests', () => {
  it('end-to-end screening flow', () => {
    const input = { entityName: 'Integration Test Entity', ownershipDepth: 2 };
    expect(ScreeningCheckResponseSchema.safeParse(screenEntity(input)).success).toBe(true);
  });
  it('end-to-end exposure chain flow', () => {
    const input = { entityName: 'Chain Test Corp', ownershipDepth: 3 };
    expect(ExposureChainResponseSchema.safeParse(getExposureChain(input)).success).toBe(true);
  });
  it('end-to-end jurisdiction risk flow', () => {
    const input = { jurisdictions: ['US', 'RU', 'CN'] };
    expect(JurisdictionRiskResponseSchema.safeParse(assessJurisdictionRisk(input)).success).toBe(true);
  });
});
