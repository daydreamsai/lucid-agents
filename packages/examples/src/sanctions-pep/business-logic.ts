/**
 * Business Logic Module
 *
 * Core data transforms, scoring, and ranking behavior for sanctions and PEP screening.
 */

// Mock data structures
export interface SanctionsListEntry {
  name: string;
  aliases: string[];
  list: string;
  addedDate: string;
}

export interface PEPEntry {
  name: string;
  position: string;
  country: string;
  riskLevel: 'high' | 'medium' | 'low';
}

export interface OwnershipRecord {
  parent: string;
  child: string;
  ownershipPct: number;
  level: number;
}

/**
 * Calculate match confidence between an entity name and a sanctions list entry
 * @param entityName - The entity name to check
 * @param listEntry - The sanctions list entry to match against
 * @returns Confidence score between 0 and 1
 */
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

/**
 * Calculate string similarity using Levenshtein distance
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity score between 0 and 1
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  // Simplified similarity calculation
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Edit distance
 */
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

/**
 * Determine screening status based on match confidence
 * @param matches - Array of matches with confidence scores
 * @returns Screening status: 'clear', 'flagged', or 'blocked'
 */
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

/**
 * Calculate aggregate risk from exposure chain
 * @param exposureChain - Array of exposure chain items
 * @returns Risk level: 'high', 'medium', or 'low'
 */
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

/**
 * Build ownership chain from entity records
 * @param entityName - Starting entity name
 * @param records - Ownership records
 * @param maxDepth - Maximum depth to traverse
 * @returns Array of ownership records forming the chain
 */
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

/**
 * Calculate freshness metadata for data
 * @param lastUpdated - Last update timestamp
 * @returns Freshness metadata with age and next refresh time
 */
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
