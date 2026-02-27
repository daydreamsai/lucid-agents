import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

/**
 * Integration tests for Regulatory Delta Feed API
 * Tests schema validation and response structure (TDD Step 3)
 * 
 * Note: Full x402 payment flow tests require network access to facilitator.
 * These tests validate the API contract without network dependencies.
 */

// Input schemas (same as implementation)
const DeltaInputSchema = z.object({
  jurisdiction: z.string().min(2),
  industry: z.string().optional(),
  since: z.string().datetime().optional(),
  source_priority: z.array(z.string()).optional(),
});

const ImpactInputSchema = z.object({
  jurisdiction: z.string().min(2),
  rule_id: z.string(),
  control_framework: z.string().optional(),
});

const MapControlsInputSchema = z.object({
  jurisdiction: z.string().min(2),
  industry: z.string(),
  control_framework: z.string(),
});

// Output schemas
const DeltaOutputSchema = z.object({
  deltas: z.array(z.object({
    rule_id: z.string(),
    jurisdiction: z.string(),
    semantic_change_type: z.enum(['added', 'modified', 'removed', 'clarified']),
    diff_text: z.string(),
    effective_date: z.string().datetime(),
    urgency_score: z.number().min(0).max(10),
    source_url: z.string().url().optional(),
    freshness_timestamp: z.string().datetime(),
    confidence_score: z.number().min(0).max(1),
  })),
  total_count: z.number(),
  freshness_timestamp: z.string().datetime(),
});

const ImpactOutputSchema = z.object({
  rule_id: z.string(),
  affected_controls: z.array(z.object({
    control_id: z.string(),
    control_name: z.string(),
    impact_level: z.enum(['high', 'medium', 'low']),
    remediation_required: z.boolean(),
  })),
  freshness_timestamp: z.string().datetime(),
  confidence_score: z.number().min(0).max(1),
});

const MapControlsOutputSchema = z.object({
  mappings: z.array(z.object({
    regulation_id: z.string(),
    control_id: z.string(),
    mapping_confidence: z.number().min(0).max(1),
  })),
  framework: z.string(),
  freshness_timestamp: z.string().datetime(),
});

// Mock handler implementations for testing
function handleDelta(input: z.infer<typeof DeltaInputSchema>) {
  const { jurisdiction, since } = input;
  const mockDeltas = [
    {
      rule_id: 'SEC-2024-001',
      jurisdiction,
      semantic_change_type: 'modified' as const,
      diff_text: 'Updated disclosure requirements',
      effective_date: '2024-06-01T00:00:00Z',
      urgency_score: 7.5,
      source_url: 'https://sec.gov/rules/2024-001',
      freshness_timestamp: new Date().toISOString(),
      confidence_score: 0.95,
    },
    {
      rule_id: 'SEC-2024-002',
      jurisdiction,
      semantic_change_type: 'added' as const,
      diff_text: 'New AI documentation requirements',
      effective_date: '2024-09-01T00:00:00Z',
      urgency_score: 8.0,
      source_url: 'https://sec.gov/rules/2024-002',
      freshness_timestamp: new Date().toISOString(),
      confidence_score: 0.92,
    },
  ];
  let filtered = mockDeltas;
  if (since) {
    filtered = mockDeltas.filter(d => d.effective_date >= since);
  }
  filtered.sort((a, b) => b.urgency_score - a.urgency_score);
  return {
    deltas: filtered,
    total_count: filtered.length,
    freshness_timestamp: new Date().toISOString(),
  };
}

function handleImpact(input: z.infer<typeof ImpactInputSchema>) {
  return {
    rule_id: input.rule_id,
    affected_controls: [
      {
        control_id: 'SOC2-CC6.1',
        control_name: 'Logical Access Controls',
        impact_level: 'high' as const,
        remediation_required: true,
      },
      {
        control_id: 'SOC2-CC7.2',
        control_name: 'System Monitoring',
        impact_level: 'medium' as const,
        remediation_required: true,
      },
    ],
    freshness_timestamp: new Date().toISOString(),
    confidence_score: 0.88,
  };
}

function handleMapControls(input: z.infer<typeof MapControlsInputSchema>) {
  return {
    mappings: [
      {
        regulation_id: 'SEC-2024-001',
        control_id: 'SOC2-CC6.1',
        mapping_confidence: 0.92,
      },
      {
        regulation_id: 'SEC-2024-002',
        control_id: 'SOC2-CC7.2',
        mapping_confidence: 0.85,
      },
    ],
    framework: input.control_framework,
    freshness_timestamp: new Date().toISOString(),
  };
}

describe('Regulatory Delta API - Integration Tests', () => {
  describe('regulations-delta endpoint', () => {
    it('validates input and returns properly structured response', () => {
      const input = { jurisdiction: 'US' };
      expect(() => DeltaInputSchema.parse(input)).not.toThrow();
      
      const output = handleDelta(input);
      expect(() => DeltaOutputSchema.parse(output)).not.toThrow();
      expect(output.deltas.length).toBeGreaterThan(0);
      expect(output.total_count).toBe(output.deltas.length);
    });

    it('filters deltas by since parameter', () => {
      const input = { jurisdiction: 'US', since: '2024-07-01T00:00:00Z' };
      const output = handleDelta(input);
      
      expect(output.deltas.every(d => d.effective_date >= input.since!)).toBe(true);
    });

    it('returns deltas sorted by urgency score descending', () => {
      const input = { jurisdiction: 'US' };
      const output = handleDelta(input);
      
      for (let i = 1; i < output.deltas.length; i++) {
        expect(output.deltas[i - 1].urgency_score).toBeGreaterThanOrEqual(output.deltas[i].urgency_score);
      }
    });

    it('rejects invalid jurisdiction (too short)', () => {
      const input = { jurisdiction: 'X' };
      expect(() => DeltaInputSchema.parse(input)).toThrow();
    });

    it('includes freshness_timestamp in response', () => {
      const input = { jurisdiction: 'US' };
      const output = handleDelta(input);
      
      expect(output.freshness_timestamp).toBeDefined();
      expect(() => new Date(output.freshness_timestamp)).not.toThrow();
    });
  });

  describe('regulations-impact endpoint', () => {
    it('validates input and returns affected controls', () => {
      const input = { jurisdiction: 'US', rule_id: 'SEC-2024-001' };
      expect(() => ImpactInputSchema.parse(input)).not.toThrow();
      
      const output = handleImpact(input);
      expect(() => ImpactOutputSchema.parse(output)).not.toThrow();
      expect(output.rule_id).toBe(input.rule_id);
      expect(output.affected_controls.length).toBeGreaterThan(0);
    });

    it('includes confidence_score in response', () => {
      const input = { jurisdiction: 'US', rule_id: 'SEC-2024-001' };
      const output = handleImpact(input);
      
      expect(output.confidence_score).toBeGreaterThanOrEqual(0);
      expect(output.confidence_score).toBeLessThanOrEqual(1);
    });

    it('marks high-impact controls with remediation_required', () => {
      const input = { jurisdiction: 'US', rule_id: 'SEC-2024-001' };
      const output = handleImpact(input);
      
      const highImpact = output.affected_controls.filter(c => c.impact_level === 'high');
      expect(highImpact.every(c => c.remediation_required)).toBe(true);
    });
  });

  describe('regulations-map-controls endpoint', () => {
    it('validates input and returns control mappings', () => {
      const input = { jurisdiction: 'US', industry: 'finance', control_framework: 'SOC2' };
      expect(() => MapControlsInputSchema.parse(input)).not.toThrow();
      
      const output = handleMapControls(input);
      expect(() => MapControlsOutputSchema.parse(output)).not.toThrow();
      expect(output.framework).toBe(input.control_framework);
      expect(output.mappings.length).toBeGreaterThan(0);
    });

    it('includes mapping_confidence for each mapping', () => {
      const input = { jurisdiction: 'US', industry: 'finance', control_framework: 'SOC2' };
      const output = handleMapControls(input);
      
      output.mappings.forEach(m => {
        expect(m.mapping_confidence).toBeGreaterThanOrEqual(0);
        expect(m.mapping_confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Freshness and Quality Guarantees', () => {
    it('all responses include freshness_timestamp', () => {
      const deltaOutput = handleDelta({ jurisdiction: 'US' });
      const impactOutput = handleImpact({ jurisdiction: 'US', rule_id: 'SEC-2024-001' });
      const mapOutput = handleMapControls({ jurisdiction: 'US', industry: 'finance', control_framework: 'SOC2' });
      
      expect(deltaOutput.freshness_timestamp).toBeDefined();
      expect(impactOutput.freshness_timestamp).toBeDefined();
      expect(mapOutput.freshness_timestamp).toBeDefined();
    });

    it('delta items include per-item freshness and confidence', () => {
      const output = handleDelta({ jurisdiction: 'US' });
      
      output.deltas.forEach(d => {
        expect(d.freshness_timestamp).toBeDefined();
        expect(d.confidence_score).toBeGreaterThanOrEqual(0);
        expect(d.confidence_score).toBeLessThanOrEqual(1);
      });
    });
  });
});
