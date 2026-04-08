import type { ScreeningCheckRequest, ScreeningCheckResponse, ExposureChainRequest, ExposureChainResponse, JurisdictionRiskRequest, JurisdictionRiskResponse, Freshness, Match, ExposureNode } from './schema';

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash = hash & hash; }
  return Math.abs(hash);
}

export function generateFreshness(stalenessMs: number = 0): Freshness {
  return { generated_at: new Date().toISOString(), staleness_ms: stalenessMs, sla_status: stalenessMs < 300000 ? 'fresh' : stalenessMs < 3600000 ? 'stale' : 'expired' };
}

const HIGH_RISK_JURISDICTIONS = ['KP', 'IR', 'SY', 'CU', 'RU', 'BY'];
const SANCTIONS_LISTS = ['OFAC SDN', 'EU Sanctions', 'UN Consolidated', 'UK Sanctions'];
const LIST_TYPES: Match['list_type'][] = ['sanctions', 'pep', 'watchlist', 'adverse_media'];

export function screenEntity(request: ScreeningCheckRequest): ScreeningCheckResponse {
  const hash = simpleHash(request.entityName);
  const hasMatch = hash % 10 < 3; // 30% match rate for demo
  const matchConfidence = hasMatch ? 60 + (hash % 40) : 0;
  
  const matches: Match[] = [];
  if (hasMatch) {
    const numMatches = 1 + (hash % 3);
    for (let i = 0; i < numMatches; i++) {
      matches.push({
        list_name: SANCTIONS_LISTS[(hash + i) % SANCTIONS_LISTS.length],
        list_type: LIST_TYPES[(hash + i) % LIST_TYPES.length],
        match_score: 70 + ((hash + i) % 30),
        matched_name: request.entityName + (i > 0 ? ` (variant ${i})` : ''),
        matched_fields: ['name', i % 2 === 0 ? 'dob' : 'address'].slice(0, 1 + (i % 2)),
        source_url: `https://sanctions.daydreams.systems/list/${SANCTIONS_LISTS[(hash + i) % SANCTIONS_LISTS.length].toLowerCase().replace(/ /g, '-')}`,
      });
    }
  }

  return {
    screening_status: !hasMatch ? 'clear' : matchConfidence > 85 ? 'confirmed_match' : 'potential_match',
    match_confidence: matchConfidence,
    matches,
    evidence_bundle: hasMatch ? [`https://evidence.daydreams.systems/screening/${hash}/report`] : [],
    freshness: generateFreshness(0),
    confidence: 0.90 + (hash % 8) / 100,
  };
}

export function getExposureChain(request: ExposureChainRequest): ExposureChainResponse {
  const hash = simpleHash(request.entityName);
  const depth = request.ownershipDepth || 3;
  const entityTypes: ExposureNode['entity_type'][] = ['individual', 'company', 'trust', 'government'];
  const jurisdictions = ['US', 'UK', 'DE', 'CH', 'SG', 'KY', 'BVI', 'RU', 'CN'];
  
  const chain: ExposureNode[] = [];
  let highRiskCount = 0;
  const sanctionedJurisdictions: string[] = [];

  for (let i = 0; i < depth + 2; i++) {
    const nodeHash = simpleHash(request.entityName + i);
    const jurisdiction = jurisdictions[(nodeHash) % jurisdictions.length];
    const isHighRisk = HIGH_RISK_JURISDICTIONS.includes(jurisdiction);
    if (isHighRisk) {
      highRiskCount++;
      if (!sanctionedJurisdictions.includes(jurisdiction)) sanctionedJurisdictions.push(jurisdiction);
    }

    const riskFlags: string[] = [];
    if (isHighRisk) riskFlags.push('high_risk_jurisdiction');
    if (nodeHash % 10 < 2) riskFlags.push('pep_connection');
    if (nodeHash % 15 < 2) riskFlags.push('adverse_media');

    chain.push({
      entity_name: i === 0 ? request.entityName : `Entity ${String.fromCharCode(65 + i)}`,
      entity_type: entityTypes[(nodeHash) % entityTypes.length],
      ownership_percent: i === 0 ? 100 : 10 + (nodeHash % 90),
      risk_flags: riskFlags,
      jurisdiction,
    });
  }

  const totalRisk = Math.min(100, highRiskCount * 25 + (hash % 30));

  return {
    exposure_chain: chain,
    total_risk_score: totalRisk,
    high_risk_entities: highRiskCount,
    sanctioned_jurisdictions: sanctionedJurisdictions,
    evidence_bundle: [`https://evidence.daydreams.systems/exposure/${hash}/chain`],
    freshness: generateFreshness(0),
    confidence: 0.85 + (hash % 12) / 100,
  };
}

export function assessJurisdictionRisk(request: JurisdictionRiskRequest): JurisdictionRiskResponse {
  const hash = simpleHash(request.jurisdictions.join(',') + (request.entityName || ''));
  const riskLevels: JurisdictionRiskResponse['jurisdiction_risk'][0]['risk_level'][] = ['low', 'medium', 'high', 'very_high', 'prohibited'];
  const fatfStatuses: JurisdictionRiskResponse['jurisdiction_risk'][0]['fatf_status'][] = ['compliant', 'grey_list', 'black_list', 'unknown'];

  const jurisdictionRisk = request.jurisdictions.map((j, i) => {
    const jHash = simpleHash(j);
    const isHighRisk = HIGH_RISK_JURISDICTIONS.includes(j);
    const riskScore = isHighRisk ? 80 + (jHash % 20) : 10 + (jHash % 50);
    const riskLevel = isHighRisk ? (riskScore > 90 ? 'prohibited' : 'very_high') : riskLevels[Math.floor(riskScore / 25)];

    return {
      jurisdiction: j,
      risk_level: riskLevel,
      risk_score: riskScore,
      sanctions_programs: isHighRisk ? ['OFAC', 'EU', 'UN'] : jHash % 3 === 0 ? ['Sectoral'] : [],
      fatf_status: isHighRisk ? 'black_list' as const : fatfStatuses[(jHash) % fatfStatuses.length],
    };
  });

  const maxRisk = Math.max(...jurisdictionRisk.map(j => j.risk_score));
  const overallRisk = riskLevels[Math.min(4, Math.floor(maxRisk / 25))];

  return {
    jurisdiction_risk: jurisdictionRisk,
    overall_risk: overallRisk,
    freshness: generateFreshness(0),
    confidence: 0.92 + (hash % 6) / 100,
  };
}
