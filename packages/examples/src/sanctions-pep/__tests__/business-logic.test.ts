import { describe, expect, it } from 'bun:test';
import {
  calculateMatchConfidence,
  calculateStringSimilarity,
  determineScreeningStatus,
  calculateAggregateRisk,
  buildOwnershipChain,
  calculateFreshnessMetadata,
  type SanctionsListEntry,
  type OwnershipRecord,
} from '../business-logic';

/**
 * Business Logic Tests - Phase 2 of TDD
 *
 * These tests validate core data transforms, scoring, and ranking behavior.
 * They should fail initially until business logic is implemented.
 */

describe('Business Logic Tests - Matching & Scoring', () => {
  describe('calculateMatchConfidence', () => {
    it('should return 1.0 for exact name match', () => {
      const entry: SanctionsListEntry = {
        name: 'Acme Corp',
        aliases: [],
        list: 'OFAC SDN',
        addedDate: '2024-01-01',
      };

      const confidence = calculateMatchConfidence('Acme Corp', entry);
      expect(confidence).toBe(1.0);
    });

    it('should return 0.95 for alias match', () => {
      const entry: SanctionsListEntry = {
        name: 'Acme Corporation',
        aliases: ['Acme Corp', 'ACME'],
        list: 'OFAC SDN',
        addedDate: '2024-01-01',
      };

      const confidence = calculateMatchConfidence('Acme Corp', entry);
      expect(confidence).toBe(0.95);
    });

    it('should return high confidence for similar names', () => {
      const entry: SanctionsListEntry = {
        name: 'Acme Corporation',
        aliases: [],
        list: 'OFAC SDN',
        addedDate: '2024-01-01',
      };

      const confidence = calculateMatchConfidence('Acme Corporation Ltd', entry);
      expect(confidence).toBeGreaterThan(0.7);
      expect(confidence).toBeLessThan(0.95);
    });

    it('should return 0 for completely different names', () => {
      const entry: SanctionsListEntry = {
        name: 'XYZ Industries',
        aliases: [],
        list: 'OFAC SDN',
        addedDate: '2024-01-01',
      };

      const confidence = calculateMatchConfidence('Acme Corp', entry);
      expect(confidence).toBe(0.0);
    });

    it('should be case-insensitive', () => {
      const entry: SanctionsListEntry = {
        name: 'ACME CORP',
        aliases: [],
        list: 'OFAC SDN',
        addedDate: '2024-01-01',
      };

      const confidence = calculateMatchConfidence('acme corp', entry);
      expect(confidence).toBe(1.0);
    });
  });

  describe('determineScreeningStatus', () => {
    it('should return clear for no matches', () => {
      const status = determineScreeningStatus([]);
      expect(status).toBe('clear');
    });

    it('should return blocked for high confidence match', () => {
      const matches = [{ confidence: 0.98, list: 'OFAC SDN' }];
      const status = determineScreeningStatus(matches);
      expect(status).toBe('blocked');
    });

    it('should return flagged for medium confidence match', () => {
      const matches = [{ confidence: 0.85, list: 'UN Sanctions' }];
      const status = determineScreeningStatus(matches);
      expect(status).toBe('flagged');
    });

    it('should return clear for low confidence match', () => {
      const matches = [{ confidence: 0.65, list: 'EU Sanctions' }];
      const status = determineScreeningStatus(matches);
      expect(status).toBe('clear');
    });

    it('should use highest confidence when multiple matches', () => {
      const matches = [
        { confidence: 0.75, list: 'OFAC SDN' },
        { confidence: 0.96, list: 'UN Sanctions' },
        { confidence: 0.82, list: 'EU Sanctions' },
      ];
      const status = determineScreeningStatus(matches);
      expect(status).toBe('blocked');
    });
  });
});

describe('Business Logic Tests - Ownership Chain', () => {
  describe('buildOwnershipChain', () => {
    it('should build single-level ownership chain', () => {
      const records: OwnershipRecord[] = [
        {
          parent: 'Parent Corp',
          child: 'Acme Corp',
          ownershipPct: 75,
          level: 0,
        },
      ];

      const chain = buildOwnershipChain('Acme Corp', records, 3);
      expect(chain).toHaveLength(1);
      expect(chain[0].parent).toBe('Parent Corp');
      expect(chain[0].level).toBe(1);
    });

    it('should build multi-level ownership chain', () => {
      const records: OwnershipRecord[] = [
        {
          parent: 'Parent Corp',
          child: 'Acme Corp',
          ownershipPct: 75,
          level: 0,
        },
        {
          parent: 'Grandparent Corp',
          child: 'Parent Corp',
          ownershipPct: 60,
          level: 0,
        },
      ];

      const chain = buildOwnershipChain('Acme Corp', records, 3);
      expect(chain).toHaveLength(2);
      expect(chain[0].parent).toBe('Parent Corp');
      expect(chain[0].level).toBe(1);
      expect(chain[1].parent).toBe('Grandparent Corp');
      expect(chain[1].level).toBe(2);
    });

    it('should respect max depth limit', () => {
      const records: OwnershipRecord[] = [
        {
          parent: 'Parent Corp',
          child: 'Acme Corp',
          ownershipPct: 75,
          level: 0,
        },
        {
          parent: 'Grandparent Corp',
          child: 'Parent Corp',
          ownershipPct: 60,
          level: 0,
        },
        {
          parent: 'Great Grandparent Corp',
          child: 'Grandparent Corp',
          ownershipPct: 50,
          level: 0,
        },
      ];

      const chain = buildOwnershipChain('Acme Corp', records, 2);
      expect(chain).toHaveLength(2);
    });

    it('should handle entity with no parents', () => {
      const records: OwnershipRecord[] = [];
      const chain = buildOwnershipChain('Acme Corp', records, 3);
      expect(chain).toHaveLength(0);
    });
  });

  describe('calculateAggregateRisk', () => {
    it('should return low for empty chain', () => {
      const risk = calculateAggregateRisk([]);
      expect(risk).toBe('low');
    });

    it('should return high for direct sanctions exposure', () => {
      const chain = [
        {
          exposure_type: 'sanctions' as const,
          confidence: 0.95,
          ownership_pct: 100,
        },
      ];
      const risk = calculateAggregateRisk(chain);
      expect(risk).toBe('high');
    });

    it('should return medium for indirect PEP exposure', () => {
      const chain = [
        {
          exposure_type: 'pep' as const,
          confidence: 0.85,
          ownership_pct: 60,
        },
      ];
      const risk = calculateAggregateRisk(chain);
      expect(risk).toBe('medium');
    });

    it('should return low for minimal exposure', () => {
      const chain = [
        {
          exposure_type: 'pep' as const,
          confidence: 0.5,
          ownership_pct: 10,
        },
      ];
      const risk = calculateAggregateRisk(chain);
      expect(risk).toBe('low');
    });

    it('should weight sanctions higher than PEP', () => {
      const sanctionsChain = [
        {
          exposure_type: 'sanctions' as const,
          confidence: 0.8,
          ownership_pct: 50,
        },
      ];
      const pepChain = [
        {
          exposure_type: 'pep' as const,
          confidence: 0.8,
          ownership_pct: 50,
        },
      ];

      const sanctionsRisk = calculateAggregateRisk(sanctionsChain);
      const pepRisk = calculateAggregateRisk(pepChain);

      // Sanctions should produce higher risk
      expect(sanctionsRisk).not.toBe(pepRisk);
    });

    it('should ignore none exposure types', () => {
      const chain = [
        {
          exposure_type: 'none' as const,
          confidence: 1.0,
          ownership_pct: 100,
        },
      ];
      const risk = calculateAggregateRisk(chain);
      expect(risk).toBe('low');
    });
  });
});

describe('Business Logic Tests - Freshness', () => {
  describe('calculateFreshnessMetadata', () => {
    it('should calculate correct age in hours', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const metadata = calculateFreshnessMetadata(twoHoursAgo);

      expect(metadata.data_age_hours).toBe(2);
    });

    it('should calculate next refresh time', () => {
      const now = new Date();
      const metadata = calculateFreshnessMetadata(now);

      const nextRefresh = new Date(metadata.next_refresh);
      const expectedRefresh = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      // Allow 1 second tolerance
      expect(Math.abs(nextRefresh.getTime() - expectedRefresh.getTime())).toBeLessThan(
        1000
      );
    });

    it('should return ISO 8601 formatted timestamp', () => {
      const now = new Date();
      const metadata = calculateFreshnessMetadata(now);

      expect(metadata.next_refresh).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });
});
