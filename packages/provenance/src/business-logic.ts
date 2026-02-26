import type { SlaStatus, VerificationStatus, LineageGraph, LineageNode, LineageEdge, FreshnessMetadata } from './schemas';

export interface DatasetRecord {
  id: string;
  hash?: string;
  timestamp: number;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface LineageSource {
  id: string;
  name: string;
  type: 'source' | 'transform' | 'aggregation' | 'output';
  timestamp: number;
  children?: string[];
  parents?: string[];
  metadata?: Record<string, unknown>;
}

export interface ConfidenceParams {
  stalenessMs: number;
  maxStalenessMs?: number;
  attestationCount: number;
  sourceReliability: number;
}

export interface HashVerificationResult {
  status: VerificationStatus;
  match: boolean;
  expectedHash: string;
  actualHash?: string;
}

export interface StalenessResult {
  stalenessMs: number;
  queriedAt: number;
  dataTimestamp: number;
}

export function calculateStaleness(dataTimestamp: number, currentTime: number = Date.now()): StalenessResult {
  const stalenessMs = Math.max(0, currentTime - dataTimestamp);
  return { stalenessMs, queriedAt: currentTime, dataTimestamp };
}

export function createFreshnessMetadata(dataTimestamp: number, confidence: number, currentTime: number = Date.now()): FreshnessMetadata {
  const { stalenessMs, queriedAt } = calculateStaleness(dataTimestamp, currentTime);
  return { queriedAt, dataTimestamp, stalenessMs, confidence };
}

const SLA_WARNING_THRESHOLD = 0.8;

export function evaluateSlaStatus(stalenessMs: number, slaThresholdMs: number | undefined): SlaStatus {
  if (slaThresholdMs === undefined) return 'met';
  if (stalenessMs > slaThresholdMs) return 'breached';
  if (stalenessMs > slaThresholdMs * SLA_WARNING_THRESHOLD) return 'warning';
  return 'met';
}

export function computeConfidence(params: ConfidenceParams): number {
  const { stalenessMs, maxStalenessMs = 60000, attestationCount, sourceReliability } = params;
  const freshnessRatio = Math.min(1, stalenessMs / maxStalenessMs);
  const freshnessFactor = Math.exp(-2 * freshnessRatio);
  const attestationFactor = Math.min(1, 0.5 + 0.5 * Math.log10(attestationCount + 1));
  const confidence = 0.4 * freshnessFactor + 0.3 * attestationFactor + 0.3 * sourceReliability;
  return Math.max(0, Math.min(1, confidence));
}

export async function verifyHash(expectedHash: string, actualHash: string | undefined): Promise<HashVerificationResult> {
  if (actualHash === undefined) return { status: 'pending', match: false, expectedHash };
  const match = expectedHash.toLowerCase() === actualHash.toLowerCase();
  return { status: match ? 'verified' : 'failed', match, expectedHash, actualHash };
}

export async function computeHash(data: string | Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function buildLineageGraph(rootId: string, sources: LineageSource[], maxDepth: number): LineageGraph {
  const sourceMap = new Map(sources.map(s => [s.id, s]));
  const root = sourceMap.get(rootId);
  if (!root) return { nodes: [], edges: [], root: rootId, depth: 0 };

  const visitedNodes = new Set<string>();
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];
  let maxReachedDepth = 0;

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visitedNodes.has(id) || depth > maxDepth) continue;
    const source = sourceMap.get(id);
    if (!source) continue;

    visitedNodes.add(id);
    maxReachedDepth = Math.max(maxReachedDepth, depth);
    nodes.push({ id: source.id, type: source.type, name: source.name, timestamp: source.timestamp, metadata: source.metadata });

    if (source.parents && depth < maxDepth) {
      for (const parentId of source.parents) {
        edges.push({ from: parentId, to: id, relationship: 'derived_from' });
        queue.push({ id: parentId, depth: depth + 1 });
      }
    }
  }
  return { nodes, edges, root: rootId, depth: maxReachedDepth };
}

export function propagateConfidence(targetId: string, nodeConfidences: Map<string, number>, edges: Array<{ from: string; to: string; relationship: string }>): number {
  const targetConfidence = nodeConfidences.get(targetId);
  if (targetConfidence === undefined) return 0;

  const parents = new Map<string, string[]>();
  for (const edge of edges) {
    const existing = parents.get(edge.to) || [];
    existing.push(edge.from);
    parents.set(edge.to, existing);
  }

  const DECAY_PER_HOP = 0.95;
  const visited = new Set<string>();

  function calculatePropagated(nodeId: string): number {
    if (visited.has(nodeId)) return nodeConfidences.get(nodeId) || 0;
    visited.add(nodeId);
    const nodeConf = nodeConfidences.get(nodeId) || 0;
    const nodeParents = parents.get(nodeId) || [];
    if (nodeParents.length === 0) return nodeConf;
    const parentConfidences = nodeParents.map(p => calculatePropagated(p) * DECAY_PER_HOP);
    const avgParentConf = parentConfidences.reduce((a, b) => a + b, 0) / parentConfidences.length;
    return Math.min(nodeConf, avgParentConf);
  }
  return calculatePropagated(targetId);
}
