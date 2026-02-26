import type { ProvenanceDataStore, PaymentRequirement } from './runtime';
import { createProvenanceRuntime } from './runtime';
import { LineageRequestSchema, LineageResponseSchema, FreshnessRequestSchema, FreshnessResponseSchema, VerifyHashRequestSchema, VerifyHashResponseSchema } from './schemas';

export interface ProvenanceExtensionConfig {
  dataStore: ProvenanceDataStore;
  defaultSlaThresholdMs: number;
  pricing?: { lineage?: PaymentRequirement; freshness?: PaymentRequirement; verifyHash?: PaymentRequirement; };
  a2aClient?: { invoke(agentUrl: string, entrypoint: string, input: unknown): Promise<{ output: unknown }>; };
}

export interface EntrypointPayments { price: string; currency: string; }
export interface EntrypointDef {
  key: string;
  description: string;
  input: unknown;
  output: unknown;
  payments?: EntrypointPayments;
  handler: (ctx: { input: unknown; signal: AbortSignal }) => Promise<{ output: unknown }>;
}

export interface ProvenanceExtension {
  name: string;
  getEntrypoints(): EntrypointDef[];
  getRuntime(): ReturnType<typeof createProvenanceRuntime>;
}

export function createProvenanceExtension(config: ProvenanceExtensionConfig): ProvenanceExtension {
  const runtime = createProvenanceRuntime({ dataStore: config.dataStore, defaultSlaThresholdMs: config.defaultSlaThresholdMs, pricing: config.pricing, a2aClient: config.a2aClient });

  const entrypoints: EntrypointDef[] = [
    { key: 'provenance/lineage', description: 'Get data lineage graph', input: LineageRequestSchema, output: LineageResponseSchema,
      payments: config.pricing?.lineage ? { price: config.pricing.lineage.amount, currency: config.pricing.lineage.currency } : undefined,
      handler: async ({ input }) => ({ output: await runtime.handlers.lineage(input as any) }) },
    { key: 'provenance/freshness', description: 'Check data freshness and SLA', input: FreshnessRequestSchema, output: FreshnessResponseSchema,
      payments: config.pricing?.freshness ? { price: config.pricing.freshness.amount, currency: config.pricing.freshness.currency } : undefined,
      handler: async ({ input }) => ({ output: await runtime.handlers.freshness(input as any) }) },
    { key: 'provenance/verify-hash', description: 'Verify dataset hash integrity', input: VerifyHashRequestSchema, output: VerifyHashResponseSchema,
      payments: config.pricing?.verifyHash ? { price: config.pricing.verifyHash.amount, currency: config.pricing.verifyHash.currency } : undefined,
      handler: async ({ input }) => ({ output: await runtime.handlers.verifyHash(input as any) }) },
  ];

  return { name: 'provenance', getEntrypoints: () => entrypoints, getRuntime: () => runtime };
}

export function provenance(config: ProvenanceExtensionConfig) {
  const extension = createProvenanceExtension(config);
  return {
    name: extension.name,
    install(agent: { addEntrypoint: (def: EntrypointDef) => void }) {
      for (const entrypoint of extension.getEntrypoints()) agent.addEntrypoint(entrypoint);
    },
  };
}
