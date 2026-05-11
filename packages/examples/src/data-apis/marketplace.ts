import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import type { Context } from 'hono';
import { z } from 'zod';

type ApiName = 'supplier' | 'demand' | 'provenance' | 'screening' | 'macro';

type RouteDef = {
  method: 'GET' | 'POST';
  path: string;
  handler: (request: Request, now: number) => Response | Promise<Response>;
};

const freshnessSchema = z.object({
  generated_at: z.string(),
  freshness_ms: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
});

const supplierScoreSchema = z.object({
  supplier_id: z.string(),
  category: z.string(),
  region: z.string(),
  supplier_score: z.number().min(0).max(100),
  completion_rate: z.number().min(0).max(1),
  lead_time_p50_p95: z.object({ p50_days: z.number(), p95_days: z.number() }),
  disruption_probability: z.number().min(0).max(1),
  alert_reasons: z.array(z.string()),
  freshness: freshnessSchema,
});

const supplierForecastSchema = z.object({
  supplier_id: z.string(),
  horizon_days: z.number().int().positive(),
  lead_time_p50_p95: z.object({ p50_days: z.number(), p95_days: z.number() }),
  confidence_band: z.object({ low_days: z.number(), high_days: z.number() }),
  freshness: freshnessSchema,
});

const supplierAlertsSchema = z.object({
  supplier_id: z.string(),
  disruption_probability: z.number().min(0).max(1),
  alert_reasons: z.array(z.string()),
  freshness: freshnessSchema,
});

const demandIndexSchema = z.object({
  geo_type: z.enum(['zip', 'city', 'region']),
  geo_code: z.string(),
  category: z.string(),
  demand_index: z.number(),
  confidence_interval: z.object({ low: z.number(), high: z.number() }),
  comparable_geos: z.array(z.string()),
  freshness: freshnessSchema,
});

const demandTrendSchema = z.object({
  geo_code: z.string(),
  category: z.string(),
  velocity: z.number(),
  lookback_window: z.string(),
  seasonality_mode: z.string(),
  freshness: freshnessSchema,
});

const demandAnomaliesSchema = z.object({
  geo_code: z.string(),
  category: z.string(),
  anomaly_flags: z.array(z.object({ code: z.string(), severity: z.number() })),
  freshness: freshnessSchema,
});

const provenanceLineageSchema = z.object({
  dataset_id: z.string(),
  lineage_graph: z.object({
    nodes: z.array(z.object({ id: z.string(), type: z.string() })),
    edges: z.array(z.object({ from: z.string(), to: z.string() })),
  }),
  attestation_refs: z.array(z.string()),
  freshness: freshnessSchema,
});

const provenanceFreshnessSchema = z.object({
  dataset_id: z.string(),
  source_id: z.string(),
  staleness_ms: z.number().int().nonnegative(),
  sla_status: z.enum(['fresh', 'stale']),
  freshness: freshnessSchema,
});

const provenanceVerifySchema = z.object({
  dataset_id: z.string(),
  expected_hash: z.string(),
  verification_status: z.enum(['match', 'mismatch']),
  attestation_refs: z.array(z.string()),
  freshness: freshnessSchema,
});

const screeningCheckSchema = z.object({
  entity_name: z.string(),
  screening_status: z.enum(['clear', 'review', 'blocked']),
  match_confidence: z.number().min(0).max(1),
  jurisdiction_risk: z.number().min(0).max(1),
  evidence_bundle: z.array(z.string()),
  freshness: freshnessSchema,
});

const screeningExposureSchema = z.object({
  entity_name: z.string(),
  exposure_chain: z.array(
    z.object({ entity: z.string(), relationship: z.string() })
  ),
  match_confidence: z.number().min(0).max(1),
  freshness: freshnessSchema,
});

const screeningJurisdictionSchema = z.object({
  jurisdictions: z.array(z.string()),
  jurisdiction_risk: z.number().min(0).max(1),
  rationale: z.array(z.string()),
  freshness: freshnessSchema,
});

const macroEventsSchema = z.object({
  event_types: z.array(z.string()),
  geography: z.string(),
  event_feed: z.array(
    z.object({
      id: z.string(),
      event_type: z.string(),
      urgency_score: z.number(),
    })
  ),
  freshness: freshnessSchema,
});

const macroImpactSchema = z.object({
  sector_set: z.array(z.string()),
  impact_vector: z.record(z.string(), z.number()),
  confidence_band: z.object({ low: z.number(), high: z.number() }),
  freshness: freshnessSchema,
});

const macroScenarioSchema = z.object({
  scenario_score: z.number(),
  sensitivity_breakdown: z.record(z.string(), z.number()),
  freshness: freshnessSchema,
});

export const apiSchemas = {
  supplierScore: supplierScoreSchema,
  supplierForecast: supplierForecastSchema,
  supplierAlerts: supplierAlertsSchema,
  demandIndex: demandIndexSchema,
  demandTrend: demandTrendSchema,
  demandAnomalies: demandAnomaliesSchema,
  provenanceLineage: provenanceLineageSchema,
  provenanceFreshness: provenanceFreshnessSchema,
  provenanceVerify: provenanceVerifySchema,
  screeningCheck: screeningCheckSchema,
  screeningExposure: screeningExposureSchema,
  screeningJurisdiction: screeningJurisdictionSchema,
  macroEvents: macroEventsSchema,
  macroImpact: macroImpactSchema,
  macroScenario: macroScenarioSchema,
};

function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function score(input: string, min: number, max: number): number {
  const ratio = hash(input) / 0xffffffff;
  return Number((min + ratio * (max - min)).toFixed(4));
}

function freshness(now: number, seed: string) {
  return {
    generated_at: new Date(now).toISOString(),
    freshness_ms: hash(seed) % 120000,
    confidence: score(`${seed}:confidence`, 0.72, 0.98),
  };
}

function json(schema: z.ZodType, body: unknown, status = 200): Response {
  return Response.json(schema.parse(body), { status });
}

function error(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

function requiresPayment(request: Request): Response | null {
  if (
    request.headers.get('X-402-Payment') ??
    request.headers.get('payment-signature')
  ) {
    return null;
  }
  return Response.json(
    {
      error: {
        code: 'payment_required',
        message: 'A valid x402 payment is required for this endpoint.',
      },
    },
    {
      status: 402,
      headers: {
        'x-402-payment-required': 'true',
        'x-402-price': process.env.DATA_API_PRICE_USD ?? '0.01',
        'x-402-currency': 'USDC',
      },
    }
  );
}

function url(request: Request): URL {
  return new URL(request.url);
}

function queryString(request: Request, key: string, fallback: string): string {
  return url(request).searchParams.get(key) ?? fallback;
}

function queryNumber(request: Request, key: string, fallback: number): number {
  const raw = url(request).searchParams.get(key);
  const parsed = raw ? Number(raw) : fallback;
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function bodyJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function route(
  method: 'GET' | 'POST',
  path: string,
  handler: RouteDef['handler']
): RouteDef {
  return { method, path, handler };
}

export const apiRoutes: Record<ApiName, RouteDef[]> = {
  supplier: [
    route('GET', '/v1/suppliers/score', (request, now) => {
      const supplierId = queryString(request, 'supplierId', 'supplier-acme');
      const category = queryString(request, 'category', 'components');
      const region = queryString(request, 'region', 'na');
      const seed = `${supplierId}:${category}:${region}`;
      return json(apiSchemas.supplierScore, {
        supplier_id: supplierId,
        category,
        region,
        supplier_score: score(seed, 62, 94),
        completion_rate: score(`${seed}:completion`, 0.82, 0.99),
        lead_time_p50_p95: {
          p50_days: score(`${seed}:p50`, 4, 18),
          p95_days: score(`${seed}:p95`, 16, 42),
        },
        disruption_probability: score(`${seed}:risk`, 0.03, 0.34),
        alert_reasons: ['lead_time_drift', 'regional_capacity_signal'],
        freshness: freshness(now, seed),
      });
    }),
    route('GET', '/v1/suppliers/lead-time-forecast', (request, now) => {
      const supplierId = queryString(request, 'supplierId', 'supplier-acme');
      const horizonDays = queryNumber(request, 'horizonDays', 30);
      const seed = `${supplierId}:${horizonDays}:forecast`;
      return json(apiSchemas.supplierForecast, {
        supplier_id: supplierId,
        horizon_days: horizonDays,
        lead_time_p50_p95: {
          p50_days: score(`${seed}:p50`, 5, 20),
          p95_days: score(`${seed}:p95`, 18, 45),
        },
        confidence_band: {
          low_days: score(`${seed}:low`, 3, 12),
          high_days: score(`${seed}:high`, 22, 55),
        },
        freshness: freshness(now, seed),
      });
    }),
    route('GET', '/v1/suppliers/disruption-alerts', (request, now) => {
      const supplierId = queryString(request, 'supplierId', 'supplier-acme');
      const seed = `${supplierId}:alerts`;
      return json(apiSchemas.supplierAlerts, {
        supplier_id: supplierId,
        disruption_probability: score(seed, 0.04, 0.41),
        alert_reasons: ['weather_delay_watch', 'fill_rate_variance'],
        freshness: freshness(now, seed),
      });
    }),
  ],
  demand: [
    route('GET', '/v1/demand/index', (request, now) => {
      const geoType = queryString(request, 'geoType', 'city');
      if (!['zip', 'city', 'region'].includes(geoType))
        return error(
          'invalid_geo_type',
          'geoType must be zip, city, or region.',
          400
        );
      const geoCode = queryString(request, 'geoCode', 'SFO');
      const category = queryString(request, 'category', 'apparel');
      const seed = `${geoType}:${geoCode}:${category}`;
      const index = score(seed, 42, 118);
      return json(apiSchemas.demandIndex, {
        geo_type: geoType,
        geo_code: geoCode,
        category,
        demand_index: index,
        confidence_interval: {
          low: Number((index - 6.5).toFixed(2)),
          high: Number((index + 7.25).toFixed(2)),
        },
        comparable_geos: [`${geoCode}-peer-1`, `${geoCode}-peer-2`],
        freshness: freshness(now, seed),
      });
    }),
    route('GET', '/v1/demand/trend', (request, now) => {
      const geoCode = queryString(request, 'geoCode', 'SFO');
      const category = queryString(request, 'category', 'apparel');
      const lookbackWindow = queryString(request, 'lookbackWindow', '30d');
      const seasonalityMode = queryString(request, 'seasonalityMode', 'weekly');
      const seed = `${geoCode}:${category}:${lookbackWindow}:${seasonalityMode}`;
      return json(apiSchemas.demandTrend, {
        geo_code: geoCode,
        category,
        velocity: score(seed, -0.18, 0.32),
        lookback_window: lookbackWindow,
        seasonality_mode: seasonalityMode,
        freshness: freshness(now, seed),
      });
    }),
    route('GET', '/v1/demand/anomalies', (request, now) => {
      const geoCode = queryString(request, 'geoCode', 'SFO');
      const category = queryString(request, 'category', 'apparel');
      const seed = `${geoCode}:${category}:anomalies`;
      return json(apiSchemas.demandAnomalies, {
        geo_code: geoCode,
        category,
        anomaly_flags: [
          {
            code: 'velocity_spike',
            severity: score(`${seed}:spike`, 0.1, 0.9),
          },
          {
            code: 'peer_divergence',
            severity: score(`${seed}:peer`, 0.1, 0.8),
          },
        ],
        freshness: freshness(now, seed),
      });
    }),
  ],
  provenance: [
    route('GET', '/v1/provenance/lineage', (request, now) => {
      const datasetId = queryString(request, 'datasetId', 'dataset-prices');
      const sourceId = queryString(request, 'sourceId', 'source-primary');
      const seed = `${datasetId}:${sourceId}:lineage`;
      return json(apiSchemas.provenanceLineage, {
        dataset_id: datasetId,
        lineage_graph: {
          nodes: [
            { id: sourceId, type: 'source' },
            { id: datasetId, type: 'dataset' },
            { id: `${datasetId}-attestation`, type: 'attestation' },
          ],
          edges: [
            { from: sourceId, to: datasetId },
            { from: datasetId, to: `${datasetId}-attestation` },
          ],
        },
        attestation_refs: [`urn:lucid:attestation:${hash(seed)}`],
        freshness: freshness(now, seed),
      });
    }),
    route('GET', '/v1/provenance/freshness', (request, now) => {
      const datasetId = queryString(request, 'datasetId', 'dataset-prices');
      const sourceId = queryString(request, 'sourceId', 'source-primary');
      const maxStalenessMs = queryNumber(request, 'maxStalenessMs', 300000);
      const seed = `${datasetId}:${sourceId}:freshness`;
      const stalenessMs = hash(seed) % 600000;
      return json(apiSchemas.provenanceFreshness, {
        dataset_id: datasetId,
        source_id: sourceId,
        staleness_ms: stalenessMs,
        sla_status: stalenessMs <= maxStalenessMs ? 'fresh' : 'stale',
        freshness: freshness(now, seed),
      });
    }),
    route('POST', '/v1/provenance/verify-hash', async (request, now) => {
      const body = await bodyJson(request);
      const datasetId = String(body.datasetId ?? 'dataset-prices');
      const expectedHash = String(body.expectedHash ?? 'hash-unknown');
      const seed = `${datasetId}:${expectedHash}:verify`;
      return json(apiSchemas.provenanceVerify, {
        dataset_id: datasetId,
        expected_hash: expectedHash,
        verification_status: expectedHash.startsWith('sha256:')
          ? 'match'
          : 'mismatch',
        attestation_refs: [`urn:lucid:hash-check:${hash(seed)}`],
        freshness: freshness(now, seed),
      });
    }),
  ],
  screening: [
    route('POST', '/v1/screening/check', async (request, now) => {
      const body = await bodyJson(request);
      const entityName = String(body.entityName ?? 'Acme Trading LLC');
      const seed = `${entityName}:screening`;
      const risk = score(seed, 0.02, 0.62);
      return json(apiSchemas.screeningCheck, {
        entity_name: entityName,
        screening_status: risk > 0.55 ? 'review' : 'clear',
        match_confidence: score(`${seed}:match`, 0.71, 0.99),
        jurisdiction_risk: risk,
        evidence_bundle: [`urn:lucid:evidence:${hash(seed)}`],
        freshness: freshness(now, seed),
      });
    }),
    route('GET', '/v1/screening/exposure-chain', (request, now) => {
      const entityName = queryString(request, 'entityName', 'Acme Trading LLC');
      const seed = `${entityName}:exposure`;
      return json(apiSchemas.screeningExposure, {
        entity_name: entityName,
        exposure_chain: [
          { entity: entityName, relationship: 'beneficial_owner' },
          { entity: `${entityName} Holdings`, relationship: 'affiliate' },
        ],
        match_confidence: score(seed, 0.68, 0.96),
        freshness: freshness(now, seed),
      });
    }),
    route('GET', '/v1/screening/jurisdiction-risk', (request, now) => {
      const jurisdictions = queryString(request, 'jurisdictions', 'US,CA')
        .split(',')
        .filter(Boolean);
      const seed = `${jurisdictions.join(':')}:jurisdiction`;
      return json(apiSchemas.screeningJurisdiction, {
        jurisdictions,
        jurisdiction_risk: score(seed, 0.05, 0.7),
        rationale: ['pep_exposure_index', 'sanctions_update_frequency'],
        freshness: freshness(now, seed),
      });
    }),
  ],
  macro: [
    route('GET', '/v1/macro/events', (request, now) => {
      const eventTypes = queryString(request, 'eventTypes', 'rates,energy')
        .split(',')
        .filter(Boolean);
      const geography = queryString(request, 'geography', 'global');
      const seed = `${eventTypes.join(':')}:${geography}`;
      return json(apiSchemas.macroEvents, {
        event_types: eventTypes,
        geography,
        event_feed: eventTypes.map(eventType => ({
          id: `${eventType}-${hash(`${seed}:${eventType}`)}`,
          event_type: eventType,
          urgency_score: score(`${seed}:${eventType}:urgency`, 0.1, 0.95),
        })),
        freshness: freshness(now, seed),
      });
    }),
    route('GET', '/v1/macro/impact-vectors', (request, now) => {
      const sectorSet = queryString(request, 'sectorSet', 'energy,retail')
        .split(',')
        .filter(Boolean);
      const horizon = queryString(request, 'horizon', '30d');
      const seed = `${sectorSet.join(':')}:${horizon}`;
      return json(apiSchemas.macroImpact, {
        sector_set: sectorSet,
        impact_vector: Object.fromEntries(
          sectorSet.map(sector => [
            sector,
            score(`${seed}:${sector}`, -0.7, 0.7),
          ])
        ),
        confidence_band: {
          low: score(`${seed}:low`, 0.42, 0.65),
          high: score(`${seed}:high`, 0.74, 0.95),
        },
        freshness: freshness(now, seed),
      });
    }),
    route('POST', '/v1/macro/scenario-score', async (request, now) => {
      const body = await bodyJson(request);
      const geography = String(body.geography ?? 'global');
      const horizon = String(body.horizon ?? '30d');
      const seed = `${geography}:${horizon}:scenario`;
      return json(apiSchemas.macroScenario, {
        scenario_score: score(seed, -1, 1),
        sensitivity_breakdown: {
          rates: score(`${seed}:rates`, -0.8, 0.8),
          energy: score(`${seed}:energy`, -0.8, 0.8),
          supply_chain: score(`${seed}:supply`, -0.8, 0.8),
        },
        freshness: freshness(now, seed),
      });
    }),
  ],
};

export async function createDataApiApp(name: ApiName) {
  const agent = await createAgent({
    name: `${name}-data-api`,
    version: '1.0.0',
    description: `Paid ${name} data API for agent consumers`,
  })
    .use(http())
    .use(
      payments({
        config: paymentsFromEnv({
          storage: { type: 'in-memory' },
        }),
      })
    )
    .build();

  return createAgentApp(agent, {
    afterMount(app) {
      for (const item of apiRoutes[name]) {
        const handler = async (c: Context) => {
          const paymentError = requiresPayment(c.req.raw);
          if (paymentError) return paymentError;
          return item.handler(c.req.raw, Date.now());
        };
        if (item.method === 'GET') app.get(item.path, handler);
        if (item.method === 'POST') app.post(item.path, handler);
      }
    },
  });
}

export async function createAllDataApiApps() {
  return {
    supplier: await createDataApiApp('supplier'),
    demand: await createDataApiApp('demand'),
    provenance: await createDataApiApp('provenance'),
    screening: await createDataApiApp('screening'),
    macro: await createDataApiApp('macro'),
  };
}
