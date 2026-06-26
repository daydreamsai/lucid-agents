import { describe, expect,it } from 'bun:test';

import {
  AddressSchema,
  ErrorResponseSchema,
  ExposureChainRequestSchema,
  ExposureChainResponseSchema,
  FreshnessSchema,
  IdentifierSchema,
  JurisdictionRiskRequestSchema,
  JurisdictionRiskResponseSchema,
  ScreeningCheckRequestSchema,
  ScreeningCheckResponseSchema,
} from './schema';

// ============================================================================
// Contract Tests - Schema Validation
// ============================================================================

describe('Schema Contract Tests', () => {
  describe('FreshnessSchema', () => {
    it('should accept valid freshness data', () => {
      const valid = {
        generated_at: '2024-01-15T10:30:00.000Z',
        staleness_ms: 3600000,
        sla_status: 'fresh',
        data_source_updated_at: '2024-01-15T09:30:00.000Z',
      };
      expect(() => FreshnessSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid sla_status', () => {
      const invalid = {
        generated_at: '2024-01-15T10:30:00.000Z',
        staleness_ms: 3600000,
        sla_status: 'invalid_status',
      };
      expect(() => FreshnessSchema.parse(invalid)).toThrow();
    });

    it('should reject negative staleness_ms', () => {
      const invalid = {
        generated_at: '2024-01-15T10:30:00.000Z',
        staleness_ms: -100,
        sla_status: 'fresh',
      };
      expect(() => FreshnessSchema.parse(invalid)).toThrow();
    });
  });

  describe('IdentifierSchema', () => {
    it('should accept valid identifier', () => {
      const valid = {
        type: 'passport',
        value: 'AB123456',
        country: 'US',
      };
      expect(() => IdentifierSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid identifier type', () => {
      const invalid = {
        type: 'invalid_type',
        value: 'AB123456',
      };
      expect(() => IdentifierSchema.parse(invalid)).toThrow();
    });

    it('should reject country code with wrong length', () => {
      const invalid = {
        type: 'passport',
        value: 'AB123456',
        country: 'USA', // Should be 2 chars
      };
      expect(() => IdentifierSchema.parse(invalid)).toThrow();
    });
  });

  describe('AddressSchema', () => {
    it('should accept valid address', () => {
      const valid = {
        street: '123 Main St',
        city: 'New York',
        region: 'NY',
        postal_code: '10001',
        country: 'US',
      };
      expect(() => AddressSchema.parse(valid)).not.toThrow();
    });

    it('should accept minimal address with only country', () => {
      const valid = { country: 'US' };
      expect(() => AddressSchema.parse(valid)).not.toThrow();
    });

    it('should reject missing country', () => {
      const invalid = { city: 'New York' };
      expect(() => AddressSchema.parse(invalid)).toThrow();
    });
  });

  describe('ScreeningCheckRequestSchema', () => {
    it('should accept valid screening request', () => {
      const valid = {
        entity_name: 'John Doe',
        entity_type: 'individual',
        identifiers: [{ type: 'passport', value: 'AB123456', country: 'US' }],
        addresses: [{ country: 'US', city: 'New York' }],
        include_pep: true,
        include_sanctions: true,
        fuzzy_threshold: 0.85,
      };
      expect(() => ScreeningCheckRequestSchema.parse(valid)).not.toThrow();
    });

    it('should apply defaults', () => {
      const minimal = { entity_name: 'John Doe' };
      const parsed = ScreeningCheckRequestSchema.parse(minimal);
      expect(parsed.entity_type).toBe('individual');
      expect(parsed.include_pep).toBe(true);
      expect(parsed.include_sanctions).toBe(true);
      expect(parsed.fuzzy_threshold).toBe(0.85);
    });

    it('should reject empty entity_name', () => {
      const invalid = { entity_name: '' };
      expect(() => ScreeningCheckRequestSchema.parse(invalid)).toThrow();
    });

    it('should reject entity_name over 500 chars', () => {
      const invalid = { entity_name: 'a'.repeat(501) };
      expect(() => ScreeningCheckRequestSchema.parse(invalid)).toThrow();
    });

    it('should reject fuzzy_threshold out of range', () => {
      expect(() => 
        ScreeningCheckRequestSchema.parse({ entity_name: 'Test', fuzzy_threshold: 1.5 })
      ).toThrow();
      expect(() => 
        ScreeningCheckRequestSchema.parse({ entity_name: 'Test', fuzzy_threshold: -0.1 })
      ).toThrow();
    });
  });

  describe('ScreeningCheckResponseSchema', () => {
    it('should accept valid screening response', () => {
      const valid = {
        screening_status: 'clear',
        match_confidence: 'low',
        risk_score: 0,
        evidence_bundle: {
          sanctions_matches: [],
          pep_matches: [],
          adverse_media_count: 0,
          data_sources_checked: ['OFAC_SDN'],
          search_parameters_used: { entity_name: 'John Doe' },
        },
        rationale: 'No matches found.',
        recommended_action: 'auto_approve',
        freshness: {
          generated_at: '2024-01-15T10:30:00.000Z',
          staleness_ms: 0,
          sla_status: 'fresh',
        },
        confidence: 0.95,
      };
      expect(() => ScreeningCheckResponseSchema.parse(valid)).not.toThrow();
    });

    it('should accept response with sanctions match', () => {
      const valid = {
        screening_status: 'confirmed_match',
        match_confidence: 'exact',
        risk_score: 100,
        evidence_bundle: {
          sanctions_matches: [{
            list_source: 'OFAC_SDN',
            list_entry_id: 'SDN-12345',
            matched_name: 'John Doe',
            match_score: 1.0,
            match_type: 'exact',
            sanctions_programs: ['IRAN', 'SYRIA'],
            listing_date: '2020-01-01T00:00:00.000Z',
            reason: 'Terrorism financing',
          }],
          pep_matches: [],
          adverse_media_count: 5,
          data_sources_checked: ['OFAC_SDN', 'EU_SANCTIONS'],
          search_parameters_used: {},
        },
        rationale: 'Exact match found on OFAC SDN list.',
        recommended_action: 'reject',
        freshness: {
          generated_at: '2024-01-15T10:30:00.000Z',
          staleness_ms: 0,
          sla_status: 'fresh',
        },
        confidence: 1.0,
      };
      expect(() => ScreeningCheckResponseSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid screening_status', () => {
      const invalid = {
        screening_status: 'invalid',
        match_confidence: 'low',
        risk_score: 0,
        evidence_bundle: {
          sanctions_matches: [],
          pep_matches: [],
          adverse_media_count: 0,
          data_sources_checked: [],
          search_parameters_used: {},
        },
        rationale: 'Test',
        recommended_action: 'auto_approve',
        freshness: {
          generated_at: '2024-01-15T10:30:00.000Z',
          staleness_ms: 0,
          sla_status: 'fresh',
        },
        confidence: 0.95,
      };
      expect(() => ScreeningCheckResponseSchema.parse(invalid)).toThrow();
    });

    it('should reject risk_score out of range', () => {
      const base = {
        screening_status: 'clear',
        match_confidence: 'low',
        evidence_bundle: {
          sanctions_matches: [],
          pep_matches: [],
          adverse_media_count: 0,
          data_sources_checked: [],
          search_parameters_used: {},
        },
        rationale: 'Test',
        recommended_action: 'auto_approve',
        freshness: {
          generated_at: '2024-01-15T10:30:00.000Z',
          staleness_ms: 0,
          sla_status: 'fresh',
        },
        confidence: 0.95,
      };
      expect(() => ScreeningCheckResponseSchema.parse({ ...base, risk_score: 101 })).toThrow();
      expect(() => ScreeningCheckResponseSchema.parse({ ...base, risk_score: -1 })).toThrow();
    });
  });

  describe('ExposureChainRequestSchema', () => {
    it('should accept valid exposure chain request', () => {
      const valid = {
        entity_name: 'Acme Corp',
        entity_type: 'organization',
        ownership_depth: 3,
        include_indirect: true,
      };
      expect(() => ExposureChainRequestSchema.parse(valid)).not.toThrow();
    });

    it('should apply defaults', () => {
      const minimal = { entity_name: 'Acme Corp' };
      const parsed = ExposureChainRequestSchema.parse(minimal);
      expect(parsed.entity_type).toBe('organization');
      expect(parsed.ownership_depth).toBe(3);
      expect(parsed.include_indirect).toBe(true);
    });

    it('should reject ownership_depth out of range', () => {
      expect(() => 
        ExposureChainRequestSchema.parse({ entity_name: 'Test', ownership_depth: 0 })
      ).toThrow();
      expect(() => 
        ExposureChainRequestSchema.parse({ entity_name: 'Test', ownership_depth: 6 })
      ).toThrow();
    });
  });

  describe('ExposureChainResponseSchema', () => {
    it('should accept valid exposure chain response', () => {
      const valid = {
        root_entity: 'Acme Corp',
        ownership_chain: [{
          entity_id: 'ent-001',
          entity_name: 'Acme Corp',
          entity_type: 'organization',
          ownership_percentage: 100,
          control_type: 'direct',
          jurisdiction: 'US',
          risk_flags: [],
          sanctions_exposure: false,
          pep_exposure: false,
        }],
        total_depth_analyzed: 3,
        high_risk_paths: [],
        aggregate_exposure: {
          sanctions_exposed_entities: 0,
          pep_exposed_entities: 0,
          high_risk_jurisdictions: [],
        },
        freshness: {
          generated_at: '2024-01-15T10:30:00.000Z',
          staleness_ms: 0,
          sla_status: 'fresh',
        },
        confidence: 0.9,
      };
      expect(() => ExposureChainResponseSchema.parse(valid)).not.toThrow();
    });

    it('should accept response with high risk paths', () => {
      const valid = {
        root_entity: 'Shell Corp',
        ownership_chain: [],
        total_depth_analyzed: 3,
        high_risk_paths: [{
          path: ['Shell Corp', 'Offshore Ltd', 'Sanctioned Entity'],
          risk_reason: 'Ownership chain leads to sanctioned entity',
          risk_level: 'critical',
        }],
        aggregate_exposure: {
          sanctions_exposed_entities: 1,
          pep_exposed_entities: 0,
          high_risk_jurisdictions: ['KP', 'IR'],
        },
        freshness: {
          generated_at: '2024-01-15T10:30:00.000Z',
          staleness_ms: 0,
          sla_status: 'fresh',
        },
        confidence: 0.85,
      };
      expect(() => ExposureChainResponseSchema.parse(valid)).not.toThrow();
    });
  });

  describe('JurisdictionRiskRequestSchema', () => {
    it('should accept valid jurisdiction risk request', () => {
      const valid = {
        jurisdictions: ['US', 'GB', 'DE'],
        include_sanctions_programs: true,
        include_fatf_status: true,
      };
      expect(() => JurisdictionRiskRequestSchema.parse(valid)).not.toThrow();
    });

    it('should reject empty jurisdictions array', () => {
      const invalid = { jurisdictions: [] };
      expect(() => JurisdictionRiskRequestSchema.parse(invalid)).toThrow();
    });

    it('should reject too many jurisdictions', () => {
      const invalid = { jurisdictions: Array(51).fill('US') };
      expect(() => JurisdictionRiskRequestSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid country codes', () => {
      const invalid = { jurisdictions: ['USA'] }; // Should be 2 chars
      expect(() => JurisdictionRiskRequestSchema.parse(invalid)).toThrow();
    });
  });

  describe('JurisdictionRiskResponseSchema', () => {
    it('should accept valid jurisdiction risk response', () => {
      const valid = {
        jurisdiction_risks: [{
          jurisdiction: 'US',
          jurisdiction_name: 'United States',
          overall_risk: 'low',
          sanctions_programs_active: [],
          fatf_status: 'member',
          cpi_score: 67,
          risk_factors: [],
        }],
        high_risk_count: 0,
        freshness: {
          generated_at: '2024-01-15T10:30:00.000Z',
          staleness_ms: 0,
          sla_status: 'fresh',
        },
        confidence: 0.95,
      };
      expect(() => JurisdictionRiskResponseSchema.parse(valid)).not.toThrow();
    });

    it('should accept high risk jurisdiction', () => {
      const valid = {
        jurisdiction_risks: [{
          jurisdiction: 'KP',
          jurisdiction_name: 'North Korea',
          overall_risk: 'critical',
          sanctions_programs_active: ['DPRK', 'UN_SANCTIONS'],
          fatf_status: 'black_list',
          risk_factors: ['Comprehensive sanctions', 'Nuclear proliferation'],
        }],
        high_risk_count: 1,
        freshness: {
          generated_at: '2024-01-15T10:30:00.000Z',
          staleness_ms: 0,
          sla_status: 'fresh',
        },
        confidence: 0.99,
      };
      expect(() => JurisdictionRiskResponseSchema.parse(valid)).not.toThrow();
    });
  });

  describe('ErrorResponseSchema', () => {
    it('should accept valid error response', () => {
      const valid = {
        error_code: 'INVALID_INPUT',
        message: 'Entity name is required',
        details: { field: 'entity_name' },
        request_id: 'req-12345',
      };
      expect(() => ErrorResponseSchema.parse(valid)).not.toThrow();
    });

    it('should accept error without details', () => {
      const valid = {
        error_code: 'PAYMENT_REQUIRED',
        message: 'Payment required to access this endpoint',
        request_id: 'req-12345',
      };
      expect(() => ErrorResponseSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid error_code', () => {
      const invalid = {
        error_code: 'UNKNOWN_ERROR',
        message: 'Something went wrong',
        request_id: 'req-12345',
      };
      expect(() => ErrorResponseSchema.parse(invalid)).toThrow();
    });
  });
});
