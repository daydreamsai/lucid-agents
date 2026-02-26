import type {
  Freshness,
  MatchConfidence,
  PEPMatch,
  SanctionsMatch,
  ScreeningCheckRequest,
  ScreeningCheckResponse,
  ScreeningStatus,
} from './schema';

// ============================================================================
// Screening Business Logic
// ============================================================================

/**
 * Calculate string similarity using Levenshtein distance
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matrix: number[][] = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(s1.length, s2.length);
  return 1 - matrix[s1.length][s2.length] / maxLen;
}

/**
 * Determine match confidence from score
 */
export function scoreToConfidence(score: number): MatchConfidence {
  if (score >= 0.99) return 'exact';
  if (score >= 0.9) return 'high';
  if (score >= 0.75) return 'medium';
  return 'low';
}

/**
 * Determine screening status from matches
 */
export function determineScreeningStatus(
  sanctionsMatches: SanctionsMatch[],
  pepMatches: PEPMatch[],
  threshold: number
): ScreeningStatus {
  const hasExactSanctions = sanctionsMatches.some(m => m.match_score >= 0.99);
  const hasHighSanctions = sanctionsMatches.some(m => m.match_score >= 0.9);
  const hasPotentialSanctions = sanctionsMatches.some(m => m.match_score >= threshold);
  
  const hasActivePEP = pepMatches.some(m => m.active && m.match_score >= 0.9);

  if (hasExactSanctions) return 'confirmed_match';
  if (hasHighSanctions || hasActivePEP) return 'escalate';
  if (hasPotentialSanctions || pepMatches.length > 0) return 'potential_match';
  return 'clear';
}

/**
 * Calculate risk score (0-100)
 */
export function calculateRiskScore(
  sanctionsMatches: SanctionsMatch[],
  pepMatches: PEPMatch[]
): number {
  let score = 0;

  // Sanctions contribute heavily
  for (const match of sanctionsMatches) {
    if (match.match_score >= 0.99) score += 50;
    else if (match.match_score >= 0.9) score += 35;
    else if (match.match_score >= 0.75) score += 20;
    else score += 10;
  }

  // PEP matches contribute moderately
  for (const match of pepMatches) {
    const baseScore = match.active ? 25 : 10;
    score += baseScore * match.match_score;
  }

  return Math.min(100, Math.round(score));
}

/**
 * Determine recommended action
 */
export function determineAction(
  status: ScreeningStatus,
  riskScore: number
): 'auto_approve' | 'manual_review' | 'escalate' | 'reject' {
  if (status === 'confirmed_match') return 'reject';
  if (status === 'escalate' || riskScore >= 70) return 'escalate';
  if (status === 'potential_match' || riskScore >= 30) return 'manual_review';
  return 'auto_approve';
}

/**
 * Generate rationale text
 */
export function generateRationale(
  status: ScreeningStatus,
  sanctionsMatches: SanctionsMatch[],
  pepMatches: PEPMatch[],
  riskScore: number
): string {
  const parts: string[] = [];

  if (status === 'clear') {
    parts.push('No sanctions or PEP matches found.');
  } else {
    if (sanctionsMatches.length > 0) {
      const bestMatch = sanctionsMatches.reduce((a, b) => 
        a.match_score > b.match_score ? a : b
      );
      parts.push(
        `Found ${sanctionsMatches.length} sanctions match(es). ` +
        `Best match: "${bestMatch.matched_name}" on ${bestMatch.list_source} ` +
        `(${Math.round(bestMatch.match_score * 100)}% confidence).`
      );
    }

    if (pepMatches.length > 0) {
      const activePEPs = pepMatches.filter(m => m.active);
      parts.push(
        `Found ${pepMatches.length} PEP match(es), ${activePEPs.length} currently active.`
      );
    }
  }

  parts.push(`Overall risk score: ${riskScore}/100.`);
  return parts.join(' ');
}

/**
 * Create freshness metadata
 */
export function createFreshness(dataSourceUpdatedAt?: Date): Freshness {
  const now = new Date();
  const sourceTime = dataSourceUpdatedAt || new Date(now.getTime() - 3600000); // 1 hour ago default
  const stalenessMs = now.getTime() - sourceTime.getTime();

  let slaStatus: 'fresh' | 'stale' | 'expired';
  if (stalenessMs < 3600000) slaStatus = 'fresh'; // < 1 hour
  else if (stalenessMs < 86400000) slaStatus = 'stale'; // < 24 hours
  else slaStatus = 'expired';

  return {
    generated_at: now.toISOString(),
    staleness_ms: stalenessMs,
    sla_status: slaStatus,
    data_source_updated_at: sourceTime.toISOString(),
  };
}

/**
 * Main screening check function
 */
export function performScreeningCheck(
  request: ScreeningCheckRequest,
  sanctionsDatabase: Array<{ name: string; aliases: string[]; list: string; programs: string[]; id: string }>,
  pepDatabase: Array<{ name: string; category: string; position: string; country: string; active: boolean; id: string }>
): ScreeningCheckResponse {
  const sanctionsMatches: SanctionsMatch[] = [];
  const pepMatches: PEPMatch[] = [];
  const threshold = request.fuzzy_threshold ?? 0.85;

  // Check sanctions
  if (request.include_sanctions !== false) {
    for (const entry of sanctionsDatabase) {
      const namesToCheck = [entry.name, ...entry.aliases];
      for (const name of namesToCheck) {
        const score = calculateSimilarity(request.entity_name, name);
        if (score >= threshold) {
          sanctionsMatches.push({
            list_source: entry.list as any,
            list_entry_id: entry.id,
            matched_name: name,
            match_score: score,
            match_type: score >= 0.99 ? 'exact' : score >= 0.9 ? 'alias' : 'fuzzy',
            sanctions_programs: entry.programs,
          });
          break; // One match per entry
        }
      }
    }
  }

  // Check PEP
  if (request.include_pep !== false) {
    for (const entry of pepDatabase) {
      const score = calculateSimilarity(request.entity_name, entry.name);
      if (score >= threshold) {
        pepMatches.push({
          pep_id: entry.id,
          matched_name: entry.name,
          match_score: score,
          category: entry.category as any,
          position: entry.position,
          country: entry.country,
          active: entry.active,
        });
      }
    }
  }

  const status = determineScreeningStatus(sanctionsMatches, pepMatches, threshold);
  const riskScore = calculateRiskScore(sanctionsMatches, pepMatches);
  const confidence = sanctionsMatches.length + pepMatches.length > 0
    ? Math.max(...[...sanctionsMatches, ...pepMatches].map(m => m.match_score))
    : 0.95; // High confidence in clear result

  return {
    screening_status: status,
    match_confidence: scoreToConfidence(
      sanctionsMatches.length > 0 
        ? Math.max(...sanctionsMatches.map(m => m.match_score))
        : pepMatches.length > 0
          ? Math.max(...pepMatches.map(m => m.match_score))
          : 0
    ),
    risk_score: riskScore,
    evidence_bundle: {
      sanctions_matches: sanctionsMatches,
      pep_matches: pepMatches,
      adverse_media_count: 0,
      data_sources_checked: ['OFAC_SDN', 'EU_SANCTIONS', 'UN_SANCTIONS', 'PEP_DATABASE'],
      search_parameters_used: {
        entity_name: request.entity_name,
        fuzzy_threshold: threshold,
        include_sanctions: request.include_sanctions,
        include_pep: request.include_pep,
      },
    },
    rationale: generateRationale(status, sanctionsMatches, pepMatches, riskScore),
    recommended_action: determineAction(status, riskScore),
    freshness: createFreshness(),
    confidence,
  };
}
