import { type LineageRequest, type LineageResponse, type FreshnessRequest, type FreshnessResponse, type VerifyHashRequest, type VerifyHashResponse, type AttestationRef, LineageRequestSchema, FreshnessRequestSchema, VerifyHashRequestSchema } from './schemas';
import { calculateStaleness, createFreshnessMetadata, evaluateSlaStatus, computeConfidence, verifyHash, buildLineageGraph, type DatasetRecord, type LineageSource } from './business-logic';

export interface ProvenanceDataStore {
  getDataset(datasetId: string): Promise<DatasetRecord | undefined>;
  getLineageSources(datasetId: string): Promise<LineageSource[]>;
  getAttestations(datasetId: string): Promise<AttestationRef[]>;
  getSourceReliability(sourceId: string): Promise<number>;
}

export interface PaymentRequirement { amount: string; currency: string; }

export interface ProvenanceRuntimeConfig {
  dataStore: ProvenanceDataStore;
  defaultSlaThresholdMs: number;
  pricing?: { lineage?: PaymentRequirement; freshness?: PaymentRequirement; verifyHash?: PaymentRequirement; };
  a2aClient?: { invoke(agentUrl: string, entrypoint: string, input: unknown): Promise<{ output: unknown }>; };
}

export interface ProvenanceError { code: string; message: string; details?: Record<string, unknown>; }
export interface ProvenanceHandlers {
  lineage(request: LineageRequest): Promise<LineageResponse>;
  freshness(request: FreshnessRequest): Promise<FreshnessResponse>;
  verifyHash(request: VerifyHashRequest): Promise<VerifyHashResponse>;
}
export interface ProvenanceRuntime {
  handlers: ProvenanceHandlers;
  getPaymentRequirement(endpoint: 'lineage' | 'freshness' | 'verifyHash'): PaymentRequirement | undefined;
}

function createError(code: string, message: string, details?: Record<string, unknown>): ProvenanceError {
  const error = new Error(message) as Error & ProvenanceError;
  error.code = code; error.details = details;
  return error;
}

export function createProvenanceRuntime(config: ProvenanceRuntimeConfig): ProvenanceRuntime {
  const { dataStore, defaultSlaThresholdMs, pricing } = config;

  async function handleLineage(request: LineageRequest): Promise<LineageResponse> {
    const parsed = LineageRequestSchema.safeParse(request);
    if (!parsed.success) throw createError('validation_error', 'Invalid request', { issues: parsed.error.issues });
    const { datasetId, maxDepth } = parsed.data;
    try {
      const [sources, attestations, dataset] = await Promise.all([dataStore.getLineageSources(datasetId), dataStore.getAttestations(datasetId), dataStore.getDataset(datasetId)]);
      const lineageGraph = buildLineageGraph(datasetId, sources, maxDepth);
      const sourceReliability = dataset?.sourceId ? await dataStore.getSourceReliability(dataset.sourceId) : 0.5;
      const dataTimestamp = dataset?.timestamp ?? Date.now();
      const confidence = computeConfidence({ stalenessMs: Date.now() - dataTimestamp, maxStalenessMs: defaultSlaThresholdMs, attestationCount: attestations.length, sourceReliability });
      return { datasetId, lineageGraph, attestationRefs: attestations, freshness: createFreshnessMetadata(dataTimestamp, confidence) };
    } catch (error) { if ((error as ProvenanceError).code) throw error; throw createError('internal_error', 'Failed to fetch lineage', { originalError: (error as Error).message }); }
  }

  async function handleFreshness(request: FreshnessRequest): Promise<FreshnessResponse> {
    const parsed = FreshnessRequestSchema.safeParse(request);
    if (!parsed.success) throw createError('validation_error', 'Invalid request', { issues: parsed.error.issues });
    const { datasetId, maxStalenessMs } = parsed.data;
    try {
      const dataset = await dataStore.getDataset(datasetId);
      if (!dataset) throw createError('dataset_not_found', `Dataset ${datasetId} not found`, { datasetId });
      const attestations = await dataStore.getAttestations(datasetId);
      const sourceReliability = dataset.sourceId ? await dataStore.getSourceReliability(dataset.sourceId) : 0.5;
      const now = Date.now();
      const { stalenessMs } = calculateStaleness(dataset.timestamp, now);
      const slaThreshold = maxStalenessMs ?? defaultSlaThresholdMs;
      const slaStatus = evaluateSlaStatus(stalenessMs, slaThreshold);
      const confidence = computeConfidence({ stalenessMs, maxStalenessMs: slaThreshold, attestationCount: attestations.length, sourceReliability });
      return { datasetId, sourceId: dataset.sourceId, stalenessMs, slaStatus, slaThresholdMs: slaThreshold, lastUpdated: dataset.timestamp, confidence, freshness: createFreshnessMetadata(dataset.timestamp, confidence, now) };
    } catch (error) { if ((error as ProvenanceError).code) throw error; throw createError('internal_error', 'Failed to check freshness', { originalError: (error as Error).message }); }
  }

  async function handleVerifyHash(request: VerifyHashRequest): Promise<VerifyHashResponse> {
    const parsed = VerifyHashRequestSchema.safeParse(request);
    if (!parsed.success) throw createError('validation_error', 'Invalid request', { issues: parsed.error.issues });
    const { datasetId, expectedHash } = parsed.data;
    try {
      const [dataset, attestations] = await Promise.all([dataStore.getDataset(datasetId), dataStore.getAttestations(datasetId)]);
      if (!dataset) throw createError('dataset_not_found', `Dataset ${datasetId} not found`, { datasetId });
      const verificationResult = await verifyHash(expectedHash, dataset.hash);
      const now = Date.now();
      const confidence = verificationResult.status === 'verified' ? 1.0 : verificationResult.status === 'failed' ? 0.0 : 0.5;
      return { datasetId, expectedHash, actualHash: verificationResult.actualHash, verificationStatus: verificationResult.status, attestationRefs: attestations, verifiedAt: now, confidence, freshness: createFreshnessMetadata(dataset.timestamp, confidence, now) };
    } catch (error) { if ((error as ProvenanceError).code) throw error; throw createError('internal_error', 'Failed to verify hash', { originalError: (error as Error).message }); }
  }

  return { handlers: { lineage: handleLineage, freshness: handleFreshness, verifyHash: handleVerifyHash }, getPaymentRequirement: (endpoint) => pricing?.[endpoint] };
}
