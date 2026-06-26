import type { LineageRequest, LineageResponse, FreshnessRequest, FreshnessResponse, VerifyHashRequest, VerifyHashResponse, FreshnessMeta } from './schema';

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash = hash & hash; }
  return Math.abs(hash);
}

export function generateFreshness(stalenessMs: number = 0): FreshnessMeta {
  return { generated_at: new Date().toISOString(), staleness_ms: stalenessMs, sla_status: stalenessMs < 300000 ? 'fresh' : stalenessMs < 3600000 ? 'stale' : 'expired' };
}

export function getLineage(request: LineageRequest): LineageResponse {
  const hash = simpleHash(request.datasetId + (request.sourceId || ''));
  const depth = request.depth || 3;
  const nodeTypes = ['source', 'transform', 'aggregation', 'output'] as const;
  const relationships = ['derived_from', 'transformed_from', 'aggregated_from', 'copied_from'] as const;
  const nodes: LineageResponse['lineage_graph']['nodes'] = [];
  const edges: LineageResponse['lineage_graph']['edges'] = [];
  const now = Date.now();

  nodes.push({ id: `node_${request.datasetId}_0`, type: 'output', name: `Dataset ${request.datasetId}`, timestamp: new Date(now).toISOString(), hash: `0x${hash.toString(16).padStart(64, '0')}` });

  for (let d = 1; d <= depth; d++) {
    const nodesAtDepth = Math.min(d, 3);
    for (let n = 0; n < nodesAtDepth; n++) {
      const nodeId = `node_${request.datasetId}_${d}_${n}`;
      const nodeHash = simpleHash(nodeId);
      nodes.push({ id: nodeId, type: nodeTypes[(nodeHash + d) % nodeTypes.length], name: `Source ${d}-${n}`, timestamp: new Date(now - d * 86400000).toISOString(), hash: `0x${nodeHash.toString(16).padStart(64, '0')}` });
      const parentIdx = d === 1 ? 0 : Math.min(nodes.length - nodesAtDepth - 1, nodes.length - 2);
      edges.push({ from: nodeId, to: nodes[parentIdx].id, relationship: relationships[(nodeHash + n) % relationships.length] });
    }
  }
  return { lineage_graph: { nodes, edges, root_id: nodes[0].id }, depth_reached: depth, freshness: generateFreshness(0), confidence: 0.88 + (hash % 10) / 100 };
}

export function checkFreshness(request: FreshnessRequest): FreshnessResponse {
  const hash = simpleHash(request.datasetId + (request.sourceId || '') + 'freshness');
  const stalenessMs = hash % 600000;
  const updateFrequency = 300000 + (hash % 300000);
  const now = Date.now();
  let slaStatus: FreshnessResponse['sla_status'] = 'fresh';
  if (request.maxStalenessMs && stalenessMs > request.maxStalenessMs) slaStatus = stalenessMs > request.maxStalenessMs * 2 ? 'expired' : 'stale';
  else if (stalenessMs > 300000) slaStatus = stalenessMs > 3600000 ? 'expired' : 'stale';

  return { staleness_ms: stalenessMs, sla_status: slaStatus, last_updated: new Date(now - stalenessMs).toISOString(), update_frequency_ms: updateFrequency, next_expected_update: new Date(now - stalenessMs + updateFrequency).toISOString(), attestation_refs: [`https://attestations.daydreams.systems/freshness/${request.datasetId}/latest`, `https://attestations.daydreams.systems/freshness/${request.datasetId}/history`], freshness: generateFreshness(0), confidence: 0.92 + (hash % 6) / 100 };
}

export function verifyHash(request: VerifyHashRequest): VerifyHashResponse {
  const hash = simpleHash(request.datasetId + (request.sourceId || '') + 'verify');
  const datasetExists = hash % 10 > 1;
  const actualHash = datasetExists ? `0x${hash.toString(16).padStart(64, '0')}` : null;
  const status = !datasetExists ? 'not_found' : actualHash === request.expectedHash ? 'verified' : 'mismatch';

  return { verification_status: status, expected_hash: request.expectedHash, actual_hash: actualHash, dataset_exists: datasetExists, last_verified: datasetExists ? new Date().toISOString() : undefined, attestation_refs: datasetExists ? [`https://attestations.daydreams.systems/hash/${request.datasetId}/verify`] : [], freshness: generateFreshness(0), confidence: datasetExists ? 0.95 + (hash % 4) / 100 : 0.5 };
}
