import { describe, expect, test, beforeEach } from 'bun:test';
import { DatasetIdSchema, HashSchema, ConfidenceSchema, SlaStatusSchema, VerificationStatusSchema, LineageNodeSchema, LineageEdgeSchema, LineageGraphSchema, AttestationRefSchema, LineageRequestSchema, FreshnessRequestSchema, VerifyHashRequestSchema, LineageResponseSchema, FreshnessResponseSchema, VerifyHashResponseSchema, ErrorResponseSchema } from '../schemas';
import { calculateStaleness, evaluateSlaStatus, computeConfidence, verifyHash, buildLineageGraph, propagateConfidence, createFreshnessMetadata } from '../business-logic';
import { createProvenanceRuntime, type ProvenanceDataStore } from '../runtime';
import { createProvenanceExtension } from '../extension';

// Mock data store
function createMockDataStore(): ProvenanceDataStore {
  const now = Date.now();
  return {
    async getDataset(datasetId: string) {
      if (datasetId === 'ds-not-found') return undefined;
      return { id: datasetId, hash: '0x' + 'a'.repeat(64), timestamp: now - 5000, sourceId: 'src-primary' };
    },
    async getLineageSources(datasetId: string) {
      if (datasetId === 'ds-not-found') return [];
      return [
        { id: datasetId, name: 'Output Dataset', type: 'output' as const, timestamp: now - 5000, parents: ['transform-1'] },
        { id: 'transform-1', name: 'Data Transform', type: 'transform' as const, timestamp: now - 10000, parents: ['source-1'] },
        { id: 'source-1', name: 'Primary Source', type: 'source' as const, timestamp: now - 15000 },
      ];
    },
    async getAttestations(datasetId: string) {
      if (datasetId === 'ds-not-found') return [];
      return [{ id: 'att-1', type: 'onchain' as const, issuer: '0x1234567890abcdef1234567890abcdef12345678', timestamp: now - 1000, chainId: 'eip155:8453' }];
    },
    async getSourceReliability() { return 0.95; },
  };
}

describe('Schema Contract Tests', () => {
  test('DatasetIdSchema accepts valid identifiers', () => {
    expect(DatasetIdSchema.parse('dataset-123')).toBe('dataset-123');
    expect(() => DatasetIdSchema.parse('')).toThrow();
  });

  test('HashSchema accepts valid SHA-256 hashes', () => {
    const validHash = '0x' + 'a'.repeat(64);
    expect(HashSchema.parse(validHash)).toBe(validHash);
    expect(() => HashSchema.parse('invalid')).toThrow();
  });

  test('ConfidenceSchema accepts values between 0 and 1', () => {
    expect(ConfidenceSchema.parse(0)).toBe(0);
    expect(ConfidenceSchema.parse(0.5)).toBe(0.5);
    expect(ConfidenceSchema.parse(1)).toBe(1);
    expect(() => ConfidenceSchema.parse(-0.1)).toThrow();
    expect(() => ConfidenceSchema.parse(1.1)).toThrow();
  });

  test('SlaStatusSchema accepts valid statuses', () => {
    expect(SlaStatusSchema.parse('met')).toBe('met');
    expect(SlaStatusSchema.parse('warning')).toBe('warning');
    expect(SlaStatusSchema.parse('breached')).toBe('breached');
  });

  test('LineageNodeSchema validates node structure', () => {
    const validNode = { id: 'node-1', type: 'source', name: 'Raw Data Source', timestamp: Date.now() };
    expect(LineageNodeSchema.parse(validNode)).toMatchObject(validNode);
  });

  test('LineageGraphSchema validates complete graph', () => {
    const validGraph = {
      nodes: [{ id: 'root', type: 'output', name: 'Dataset', timestamp: Date.now() }],
      edges: [], root: 'root', depth: 0,
    };
    expect(LineageGraphSchema.parse(validGraph)).toMatchObject(validGraph);
  });

  test('Request schemas with defaults', () => {
    const parsed = LineageRequestSchema.parse({ datasetId: 'ds-123' });
    expect(parsed.maxDepth).toBe(3);
    expect(parsed.includeMetadata).toBe(false);
  });

  test('Response schemas validate complete responses', () => {
    const now = Date.now();
    const freshness = { queriedAt: now, dataTimestamp: now - 5000, stalenessMs: 5000, confidence: 0.99 };
    const lineageResponse = { datasetId: 'ds-123', lineageGraph: { nodes: [], edges: [], root: 'ds-123', depth: 0 }, attestationRefs: [], freshness };
    expect(LineageResponseSchema.parse(lineageResponse)).toMatchObject(lineageResponse);
  });
});

describe('Business Logic Tests', () => {
  test('calculates staleness correctly', () => {
    const now = Date.now();
    const result = calculateStaleness(now - 5000, now);
    expect(result.stalenessMs).toBe(5000);
  });

  test('handles future timestamps gracefully', () => {
    const now = Date.now();
    const result = calculateStaleness(now + 1000, now);
    expect(result.stalenessMs).toBe(0);
  });

  test('SLA status evaluation', () => {
    expect(evaluateSlaStatus(5000, 60000)).toBe('met');
    expect(evaluateSlaStatus(50000, 60000)).toBe('warning');
    expect(evaluateSlaStatus(60001, 60000)).toBe('breached');
    expect(evaluateSlaStatus(999999, undefined)).toBe('met');
  });

  test('confidence computation', () => {
    const high = computeConfidence({ stalenessMs: 1000, maxStalenessMs: 60000, attestationCount: 3, sourceReliability: 0.95 });
    const low = computeConfidence({ stalenessMs: 55000, maxStalenessMs: 60000, attestationCount: 0, sourceReliability: 0.3 });
    expect(high).toBeGreaterThan(low);
    expect(high).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(1);
  });

  test('hash verification', async () => {
    const hash = '0x' + 'a'.repeat(64);
    expect((await verifyHash(hash, hash)).status).toBe('verified');
    expect((await verifyHash(hash, '0x' + 'b'.repeat(64))).status).toBe('failed');
    expect((await verifyHash(hash, undefined)).status).toBe('pending');
  });

  test('lineage graph building', () => {
    const sources = [
      { id: 'output-1', name: 'Final', type: 'output' as const, timestamp: Date.now(), parents: ['source-1'] },
      { id: 'source-1', name: 'Source', type: 'source' as const, timestamp: Date.now() - 1000 },
    ];
    const graph = buildLineageGraph('output-1', sources, 3);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });

  test('confidence propagation', () => {
    const nodeConfidences = new Map([['A', 0.95], ['B', 0.50], ['C', 0.95]]);
    const edges = [{ from: 'A', to: 'B', relationship: 'derived_from' }, { from: 'B', to: 'C', relationship: 'derived_from' }];
    const propagated = propagateConfidence('C', nodeConfidences, edges);
    expect(propagated).toBeLessThan(0.6);
  });
});

describe('Integration Tests', () => {
  let runtime: ReturnType<typeof createProvenanceRuntime>;
  beforeEach(() => {
    runtime = createProvenanceRuntime({
      dataStore: createMockDataStore(),
      defaultSlaThresholdMs: 60000,
      pricing: { lineage: { amount: '0.001', currency: 'USDC' }, freshness: { amount: '0.0005', currency: 'USDC' }, verifyHash: { amount: '0.002', currency: 'USDC' } },
    });
  });

  test('lineage endpoint returns graph', async () => {
    const response = await runtime.handlers.lineage({ datasetId: 'ds-123', maxDepth: 3, includeMetadata: false });
    expect(response.datasetId).toBe('ds-123');
    expect(response.lineageGraph.nodes.length).toBeGreaterThan(0);
  });

  test('freshness endpoint returns SLA status', async () => {
    const response = await runtime.handlers.freshness({ datasetId: 'ds-123' });
    expect(response.slaStatus).toMatch(/^(met|warning|breached)$/);
    expect(response.confidence).toBeGreaterThan(0);
  });

  test('verify-hash endpoint returns verification', async () => {
    const response = await runtime.handlers.verifyHash({ datasetId: 'ds-123', expectedHash: '0x' + 'a'.repeat(64) });
    expect(response.verificationStatus).toBe('verified');
  });

  test('payment requirements configured', () => {
    expect(runtime.getPaymentRequirement('lineage')).toEqual({ amount: '0.001', currency: 'USDC' });
    expect(runtime.getPaymentRequirement('freshness')).toEqual({ amount: '0.0005', currency: 'USDC' });
  });

  test('error handling for missing dataset', async () => {
    await expect(runtime.handlers.freshness({ datasetId: 'ds-not-found' })).rejects.toMatchObject({ code: 'dataset_not_found' });
  });
});

describe('Extension Tests', () => {
  test('extension exposes entrypoints with payments', () => {
    const extension = createProvenanceExtension({
      dataStore: createMockDataStore(),
      defaultSlaThresholdMs: 60000,
      pricing: { lineage: { amount: '0.001', currency: 'USDC' } },
    });
    const entrypoints = extension.getEntrypoints();
    expect(entrypoints).toHaveLength(3);
    expect(entrypoints.find(e => e.key === 'provenance/lineage')?.payments?.price).toBe('0.001');
  });
});
