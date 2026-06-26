/**
 * Business logic for Regulatory Delta Feed
 * Core data transforms, ranking, and scoring functions
 */

export interface RuleDiff {
  rule_id: string;
  jurisdiction: string;
  semantic_change_type: 'added' | 'modified' | 'removed' | 'clarified';
  diff_text: string;
  effective_date: string;
  urgency_score: number;
  source_url?: string;
  freshness_timestamp: string;
  confidence_score: number;
}

export interface ControlMapping {
  control_id: string;
  control_name: string;
  impact_level: 'high' | 'medium' | 'low';
  remediation_required: boolean;
}

/**
 * Calculate urgency score based on change type, effective date, and impact level
 * Returns score from 0-10
 */
export function calculateUrgencyScore(
  changeType: string,
  effectiveDate: string,
  impactLevel?: string
): number {
  const now = Date.now();
  const effective = new Date(effectiveDate).getTime();
  const daysUntilEffective = Math.floor((effective - now) / (24 * 60 * 60 * 1000));

  let baseScore = 5;

  // Adjust by change type
  switch (changeType) {
    case 'removed':
      baseScore = 10;
      break;
    case 'added':
      baseScore = 8;
      break;
    case 'modified':
      baseScore = 6;
      break;
    case 'clarified':
      baseScore = 3;
      break;
  }

  // Adjust by time until effective
  if (daysUntilEffective <= 0) {
    baseScore = 10; // Already effective
  } else if (daysUntilEffective <= 30) {
    baseScore = Math.min(10, baseScore + 2);
  } else if (daysUntilEffective <= 90) {
    baseScore = Math.max(1, baseScore);
  } else {
    baseScore = Math.max(1, baseScore - 2);
  }

  // Adjust by impact level
  if (impactLevel === 'high') {
    baseScore = Math.min(10, baseScore + 1);
  } else if (impactLevel === 'low') {
    baseScore = Math.max(1, baseScore - 1);
  }

  return Math.min(10, Math.max(0, baseScore));
}

/**
 * Filter deltas by date threshold
 */
export function filterDeltasBySince(deltas: RuleDiff[], since: string): RuleDiff[] {
  const sinceDate = new Date(since).getTime();
  return deltas.filter(delta => {
    const effectiveDate = new Date(delta.effective_date).getTime();
    return effectiveDate >= sinceDate;
  });
}

/**
 * Rank deltas by urgency score (descending)
 */
export function rankDeltasByUrgency(deltas: RuleDiff[]): RuleDiff[] {
  return [...deltas].sort((a, b) => b.urgency_score - a.urgency_score);
}

/**
 * Map regulation to control framework
 */
export function mapControlsToRegulation(
  ruleId: string,
  framework: string
): ControlMapping[] {
  // Mock implementation - in production, this would query a mapping database
  const mappings: Record<string, ControlMapping[]> = {
    'SOC2': [
      {
        control_id: 'SOC2-CC6.1',
        control_name: 'Logical and Physical Access Controls',
        impact_level: 'high',
        remediation_required: true,
      },
      {
        control_id: 'SOC2-CC7.2',
        control_name: 'System Monitoring',
        impact_level: 'medium',
        remediation_required: true,
      },
    ],
    'ISO27001': [
      {
        control_id: 'ISO27001-A.9.1',
        control_name: 'Access Control Policy',
        impact_level: 'high',
        remediation_required: true,
      },
      {
        control_id: 'ISO27001-A.12.4',
        control_name: 'Logging and Monitoring',
        impact_level: 'medium',
        remediation_required: true,
      },
    ],
  };

  return mappings[framework] || [];
}

/**
 * Calculate confidence score based on source quality and data age
 */
export function calculateConfidenceScore(
  sourceQuality: number,
  dataAgeDays: number
): number {
  // Start with source quality (0-1)
  let confidence = sourceQuality;

  // Decay confidence based on age
  if (dataAgeDays <= 1) {
    confidence *= 1.0; // No decay for fresh data
  } else if (dataAgeDays <= 7) {
    confidence *= 0.95;
  } else if (dataAgeDays <= 14) {
    confidence *= 0.85;
  } else if (dataAgeDays <= 30) {
    confidence *= 0.7;
  } else {
    confidence *= 0.5;
  }

  return Math.min(1, Math.max(0, confidence));
}
