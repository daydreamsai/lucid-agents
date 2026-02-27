import { describe, expect, it } from 'bun:test';

/**
 * Business Logic Tests - Phase 2 of TDD
 * 
 * These tests validate core data transforms, scoring, and ranking behavior.
 * They should fail initially until business logic is implemented.
 */

// Mock data structures
interface SanctionsListEntry {
  name: string;
  aliases: string[];
  list: string;
  addedDate: string;
}

interface PEPEntry {
  name: string;
  position: string;
  country: string;
  riskLevel: 'high' | 'medium' | 'low';
}

interface OwnershipRecord {
  parent: string;
  child: string;
  ownershipPct: number;
  level: number;
}

// Business logic functions to be implemented
export function calculateMatchConfidence(
  entityName: string,
  listEntry: SanctionsListEntry
): number {
  // Exact match = 1.0
  if (entityName.toLowerCase() === listEntry.name.toLowerCase()) {
    return 1.0;
  }

  // Alias match = 0.95
  for (const alias of listEntry.aliases) {
    if (entityName.toLowerCase() === alias.toLowerCase()) {
      return 0.95;
    }
  }

  // Fuzzy match (simplified Levenshtein-based)
  const similarity = calculateStringSimilarity(
    entityName.toLowerCase(),
    listEntry.name.toLowerCase()
  );

  // Only return matches above 0.7 threshold
  return similarity >= 0.7 ? similarity : 0.0;
}

export function calculateStringSimilarity(str1: string, str2: string): number {
  // Simplified similarity calculation
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

export function determineScreeningStatus(
  matches: Array<{ confidence: number; list: string }>
): 'clear' | 'flagged' | 'blocked' {
  if (matches.length === 0) return 'clear';

  const maxConfidence = Math.max(...matches.map(m => m.confidence));

  // High confidence match = blocked
  if (maxConfidence >= 0.95) return 'blocked';

  // Medium confidence = flagged for review
  if (maxConfidence >= 0.7) return 'flagged';

  return 'clear';
}

export function calculateAggregateRisk(
  exposureChain: Array<{
    exposure_type: 'sanctions' | 'pep' | 'none';
    confidence: number;
    ownership_pct: number;
  }>
): 'high' | 'medium' | 'low' {
  if (exposureChain.length === 0) return 'low';

  // Calculate weighted risk score
  let riskScore = 0;

  for (const item of exposureChain) {
    if (item.exposure_type === 'none') continue;

    const typeWeight = item.exposure_type === 'sanctions' ? 2.0 : 1.0;
    const ownershipWeight = item.ownership_pct / 100;
    const confidenceWeight = item.confidence;

    riskScore += typeWeight * ownershipWeight * confidenceWeight;
  }

  // Thresholds
  if (riskScore >= 1.5) return 'high';
  if (riskScore >= 0.5) return 'medium';
  return 'low';
}

export function buildOwnershipChain(
  entityName: string,
  records: OwnershipRecord[],
  maxDepth: number
): OwnershipRecord[] {
  const chain: OwnershipRecord[] = [];
  let currentEntity = entityName;
  let currentLevel = 1;

  while (currentLevel <= maxDepth) {
    const parent = records.find(
      r => r.child.toLowerCase() === currentEntity.toLowerCase()
    );

    if (!parent) break;

    chain.push({ ...parent, level: currentLevel });
    currentEntity = parent.parent;
    currentLevel++;
  }

  return chain;
}

export function calculateFreshnessMetadata(lastUpdated: Date) {
  const now = new Date();
  const ageMs = now.getTime() - lastUpdated.getTime();
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));

  // Refresh every 2 hours for sanctions data
  const refreshIntervalHours = 2;
  const nextRefresh = new Date(
    lastUpdated.getTime() + refreshIntervalHours * 60 * 60 * 1000
  );

  return {
    data_age_hours: ageHours,
    next_refresh: nextRefresh.toISOString(),
  };
}

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
