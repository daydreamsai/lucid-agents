import { describe, expect,it } from 'bun:test';

import type { PEPMatch,SanctionsMatch } from './schema';
import {
  calculateRiskScore,
  calculateSimilarity,
  createFreshness,
  determineAction,
  determineScreeningStatus,
  generateRationale,
  performScreeningCheck,
  scoreToConfidence,
} from './screening';

// ============================================================================
// Business Logic Tests - Screening
// ============================================================================

describe('Screening Business Logic Tests', () => {
  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(calculateSimilarity('John Doe', 'John Doe')).toBe(1);
    });

    it('should return 1 for case-insensitive match', () => {
      expect(calculateSimilarity('JOHN DOE', 'john doe')).toBe(1);
    });

    it('should return 1 for strings with extra whitespace', () => {
      expect(calculateSimilarity('  John Doe  ', 'John Doe')).toBe(1);
    });

    it('should return 0 for empty strings', () => {
      expect(calculateSimilarity('', 'John')).toBe(0);
      expect(calculateSimilarity('John', '')).toBe(0);
    });

    it('should return high similarity for minor typos', () => {
      const similarity = calculateSimilarity('John Doe', 'Jon Doe');
      expect(similarity).toBeGreaterThan(0.85);
    });

    it('should return low similarity for different names', () => {
      const similarity = calculateSimilarity('John Doe', 'Jane Smith');
      expect(similarity).toBeLessThan(0.5);
    });

    it('should handle unicode characters', () => {
      const similarity = calculateSimilarity('José García', 'Jose Garcia');
      expect(similarity).toBeGreaterThan(0.8);
    });
  });

  describe('scoreToConfidence', () => {
    it('should return exact for score >= 0.99', () => {
      expect(scoreToConfidence(1.0)).toBe('exact');
      expect(scoreToConfidence(0.99)).toBe('exact');
    });

    it('should return high for score >= 0.9', () => {
      expect(scoreToConfidence(0.95)).toBe('high');
      expect(scoreToConfidence(0.9)).toBe('high');
    });

    it('should return medium for score >= 0.75', () => {
      expect(scoreToConfidence(0.85)).toBe('medium');
      expect(scoreToConfidence(0.75)).toBe('medium');
    });

    it('should return low for score < 0.75', () => {
      expect(scoreToConfidence(0.7)).toBe('low');
      expect(scoreToConfidence(0.5)).toBe('low');
      expect(scoreToConfidence(0)).toBe('low');
    });
  });

  describe('determineScreeningStatus', () => {
    const createSanctionsMatch = (score: number): SanctionsMatch => ({
      list_source: 'OFAC_SDN',
      list_entry_id: 'test-123',
      matched_name: 'Test Entity',
      match_score: score,
      match_type: score >= 0.99 ? 'exact' : 'fuzzy',
      sanctions_programs: ['TEST'],
    });

    const createPEPMatch = (score: number, active: boolean): PEPMatch => ({
      pep_id: 'pep-123',
      matched_name: 'Test Person',
      match_score: score,
      category: 'government_minister',
      position: 'Minister',
      country: 'US',
      active,
    });

    it('should return clear when no matches', () => {
      expect(determineScreeningStatus([], [], 0.85)).toBe('clear');
    });

    it('should return confirmed_match for exact sanctions match', () => {
      const matches = [createSanctionsMatch(1.0)];
      expect(determineScreeningStatus(matches, [], 0.85)).toBe('confirmed_match');
    });

    it('should return escalate for high sanctions match', () => {
      const matches = [createSanctionsMatch(0.95)];
      expect(determineScreeningStatus(matches, [], 0.85)).toBe('escalate');
    });

    it('should return escalate for active high-confidence PEP', () => {
      const pepMatches = [createPEPMatch(0.95, true)];
      expect(determineScreeningStatus([], pepMatches, 0.85)).toBe('escalate');
    });

    it('should return potential_match for fuzzy sanctions match', () => {
      const matches = [createSanctionsMatch(0.87)];
      expect(determineScreeningStatus(matches, [], 0.85)).toBe('potential_match');
    });

    it('should return potential_match for any PEP match below escalation', () => {
      const pepMatches = [createPEPMatch(0.85, false)];
      expect(determineScreeningStatus([], pepMatches, 0.85)).toBe('potential_match');
    });
  });

  describe('calculateRiskScore', () => {
    const createSanctionsMatch = (score: number): SanctionsMatch => ({
      list_source: 'OFAC_SDN',
      list_entry_id: 'test-123',
      matched_name: 'Test Entity',
      match_score: score,
      match_type: 'fuzzy',
      sanctions_programs: ['TEST'],
    });

    const createPEPMatch = (score: number, active: boolean): PEPMatch => ({
      pep_id: 'pep-123',
      matched_name: 'Test Person',
      match_score: score,
      category: 'government_minister',
      position: 'Minister',
      country: 'US',
      active,
    });

    it('should return 0 for no matches', () => {
      expect(calculateRiskScore([], [])).toBe(0);
    });

    it('should return 50 for exact sanctions match', () => {
      const matches = [createSanctionsMatch(1.0)];
      expect(calculateRiskScore(matches, [])).toBe(50);
    });

    it('should return 35 for high sanctions match', () => {
      const matches = [createSanctionsMatch(0.95)];
      expect(calculateRiskScore(matches, [])).toBe(35);
    });

    it('should cap at 100', () => {
      const matches = [
        createSanctionsMatch(1.0),
        createSanctionsMatch(1.0),
        createSanctionsMatch(1.0),
      ];
      expect(calculateRiskScore(matches, [])).toBe(100);
    });

    it('should add PEP risk appropriately', () => {
      const pepMatches = [createPEPMatch(1.0, true)];
      expect(calculateRiskScore([], pepMatches)).toBe(25); // 25 * 1.0
    });

    it('should reduce PEP risk for inactive', () => {
      const pepMatches = [createPEPMatch(1.0, false)];
      expect(calculateRiskScore([], pepMatches)).toBe(10); // 10 * 1.0
    });

    it('should combine sanctions and PEP risk', () => {
      const sanctionsMatches = [createSanctionsMatch(0.95)]; // 35
      const pepMatches = [createPEPMatch(1.0, true)]; // 25
      expect(calculateRiskScore(sanctionsMatches, pepMatches)).toBe(60);
    });
  });

  describe('determineAction', () => {
    it('should reject confirmed_match', () => {
      expect(determineAction('confirmed_match', 100)).toBe('reject');
    });

    it('should escalate for escalate status', () => {
      expect(determineAction('escalate', 50)).toBe('escalate');
    });

    it('should escalate for high risk score', () => {
      expect(determineAction('potential_match', 75)).toBe('escalate');
    });

    it('should manual_review for potential_match', () => {
      expect(determineAction('potential_match', 40)).toBe('manual_review');
    });

    it('should manual_review for moderate risk score', () => {
      expect(determineAction('clear', 35)).toBe('manual_review');
    });

    it('should auto_approve for clear with low risk', () => {
      expect(determineAction('clear', 10)).toBe('auto_approve');
    });
  });

  describe('generateRationale', () => {
    const createSanctionsMatch = (name: string, score: number): SanctionsMatch => ({
      list_source: 'OFAC_SDN',
      list_entry_id: 'test-123',
      matched_name: name,
      match_score: score,
      match_type: 'fuzzy',
      sanctions_programs: ['TEST'],
    });

    const createPEPMatch = (active: boolean): PEPMatch => ({
      pep_id: 'pep-123',
      matched_name: 'Test Person',
      match_score: 0.9,
      category: 'government_minister',
      position: 'Minister',
      country: 'US',
      active,
    });

    it('should indicate no matches for clear status', () => {
      const rationale = generateRationale('clear', [], [], 0);
      expect(rationale).toContain('No sanctions or PEP matches found');
    });

    it('should describe sanctions matches', () => {
      const matches = [createSanctionsMatch('Bad Actor', 0.95)];
      const rationale = generateRationale('potential_match', matches, [], 35);
      expect(rationale).toContain('1 sanctions match');
      expect(rationale).toContain('Bad Actor');
      expect(rationale).toContain('OFAC_SDN');
      expect(rationale).toContain('95%');
    });

    it('should describe PEP matches', () => {
      const pepMatches = [createPEPMatch(true), createPEPMatch(false)];
      const rationale = generateRationale('potential_match', [], pepMatches, 30);
      expect(rationale).toContain('2 PEP match');
      expect(rationale).toContain('1 currently active');
    });

    it('should include risk score', () => {
      const rationale = generateRationale('clear', [], [], 15);
      expect(rationale).toContain('risk score: 15/100');
    });
  });

  describe('createFreshness', () => {
    it('should create fresh status for recent data', () => {
      const recentDate = new Date(Date.now() - 1000); // 1 second ago
      const freshness = createFreshness(recentDate);
      expect(freshness.sla_status).toBe('fresh');
      expect(freshness.staleness_ms).toBeLessThan(3600000);
    });

    it('should create stale status for older data', () => {
      const oldDate = new Date(Date.now() - 7200000); // 2 hours ago
      const freshness = createFreshness(oldDate);
      expect(freshness.sla_status).toBe('stale');
    });

    it('should create expired status for very old data', () => {
      const veryOldDate = new Date(Date.now() - 172800000); // 2 days ago
      const freshness = createFreshness(veryOldDate);
      expect(freshness.sla_status).toBe('expired');
    });

    it('should include valid ISO timestamps', () => {
      const freshness = createFreshness();
      expect(() => new Date(freshness.generated_at)).not.toThrow();
      expect(freshness.data_source_updated_at).toBeDefined();
    });
  });

  describe('performScreeningCheck', () => {
    const sanctionsDb = [
      { name: 'Bad Actor', aliases: ['B. Actor', 'BadActor'], list: 'OFAC_SDN', programs: ['IRAN'], id: 'sdn-001' },
      { name: 'Evil Corp', aliases: [], list: 'EU_SANCTIONS', programs: ['RUSSIA'], id: 'eu-001' },
    ];

    const pepDb = [
      { name: 'John Minister', category: 'government_minister', position: 'Finance Minister', country: 'US', active: true, id: 'pep-001' },
      { name: 'Jane Former', category: 'senior_official', position: 'Former Director', country: 'GB', active: false, id: 'pep-002' },
    ];

    it('should return clear for unknown entity', () => {
      const result = performScreeningCheck(
        { entity_name: 'Innocent Person' },
        sanctionsDb,
        pepDb
      );
      expect(result.screening_status).toBe('clear');
      expect(result.recommended_action).toBe('auto_approve');
      expect(result.evidence_bundle.sanctions_matches).toHaveLength(0);
      expect(result.evidence_bundle.pep_matches).toHaveLength(0);
    });

    it('should find exact sanctions match', () => {
      const result = performScreeningCheck(
        { entity_name: 'Bad Actor' },
        sanctionsDb,
        pepDb
      );
      expect(result.screening_status).toBe('confirmed_match');
      expect(result.recommended_action).toBe('reject');
      expect(result.evidence_bundle.sanctions_matches).toHaveLength(1);
      expect(result.evidence_bundle.sanctions_matches[0].matched_name).toBe('Bad Actor');
    });

    it('should find alias match', () => {
      const result = performScreeningCheck(
        { entity_name: 'B. Actor' },
        sanctionsDb,
        pepDb
      );
      expect(result.screening_status).toBe('confirmed_match');
      expect(result.evidence_bundle.sanctions_matches[0].matched_name).toBe('B. Actor');
    });

    it('should find PEP match', () => {
      const result = performScreeningCheck(
        { entity_name: 'John Minister' },
        sanctionsDb,
        pepDb
      );
      expect(result.evidence_bundle.pep_matches).toHaveLength(1);
      expect(result.evidence_bundle.pep_matches[0].active).toBe(true);
    });

    it('should respect include_sanctions=false', () => {
      const result = performScreeningCheck(
        { entity_name: 'Bad Actor', include_sanctions: false },
        sanctionsDb,
        pepDb
      );
      expect(result.evidence_bundle.sanctions_matches).toHaveLength(0);
    });

    it('should respect include_pep=false', () => {
      const result = performScreeningCheck(
        { entity_name: 'John Minister', include_pep: false },
        sanctionsDb,
        pepDb
      );
      expect(result.evidence_bundle.pep_matches).toHaveLength(0);
    });

    it('should respect fuzzy_threshold', () => {
      // With high threshold, fuzzy match should not trigger
      const strictResult = performScreeningCheck(
        { entity_name: 'Bad Actr', fuzzy_threshold: 0.99 },
        sanctionsDb,
        pepDb
      );
      expect(strictResult.screening_status).toBe('clear');

      // With lower threshold, fuzzy match should trigger
      const lenientResult = performScreeningCheck(
        { entity_name: 'Bad Actr', fuzzy_threshold: 0.8 },
        sanctionsDb,
        pepDb
      );
      expect(lenientResult.screening_status).not.toBe('clear');
    });

    it('should include freshness metadata', () => {
      const result = performScreeningCheck(
        { entity_name: 'Test' },
        sanctionsDb,
        pepDb
      );
      expect(result.freshness).toBeDefined();
      expect(result.freshness.generated_at).toBeDefined();
      expect(result.freshness.sla_status).toBeDefined();
    });

    it('should include confidence score', () => {
      const result = performScreeningCheck(
        { entity_name: 'Test' },
        sanctionsDb,
        pepDb
      );
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should record search parameters', () => {
      const result = performScreeningCheck(
        { entity_name: 'Test Entity', fuzzy_threshold: 0.9 },
        sanctionsDb,
        pepDb
      );
      expect(result.evidence_bundle.search_parameters_used.entity_name).toBe('Test Entity');
      expect(result.evidence_bundle.search_parameters_used.fuzzy_threshold).toBe(0.9);
    });
  });
});
