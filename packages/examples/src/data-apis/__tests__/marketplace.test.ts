import { describe, expect, it } from 'bun:test';

import { apiRoutes, apiSchemas, createDataApiApp } from '../marketplace';

const paymentHeaders = { 'X-402-Payment': 'test-payment' };

async function request(
  app: { fetch: (request: Request) => Response | Promise<Response> },
  path: string,
  init?: RequestInit
) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

async function paidGet(
  app: { fetch: (request: Request) => Response | Promise<Response> },
  path: string
) {
  return request(app, path, { headers: paymentHeaders });
}

async function paidPost(
  app: { fetch: (request: Request) => Response | Promise<Response> },
  path: string,
  body: unknown
) {
  return request(app, path, {
    method: 'POST',
    headers: { ...paymentHeaders, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('TaskMarket data API examples', () => {
  it('registers five paid API surfaces', () => {
    expect(Object.keys(apiRoutes).sort()).toEqual([
      'demand',
      'macro',
      'provenance',
      'screening',
      'supplier',
    ]);
  });

  it('enforces x402 payment on monetized supplier endpoints', async () => {
    const { app } = await createDataApiApp('supplier');
    const res = await request(app, '/v1/suppliers/score?supplierId=s1');
    expect(res.status).toBe(402);
    expect(res.headers.get('x-402-payment-required')).toBe('true');
  });

  it('returns valid supplier intelligence contracts', async () => {
    const { app } = await createDataApiApp('supplier');
    apiSchemas.supplierScore.parse(
      await (
        await paidGet(
          app,
          '/v1/suppliers/score?supplierId=s1&category=chips&region=na'
        )
      ).json()
    );
    apiSchemas.supplierForecast.parse(
      await (
        await paidGet(
          app,
          '/v1/suppliers/lead-time-forecast?supplierId=s1&horizonDays=45'
        )
      ).json()
    );
    apiSchemas.supplierAlerts.parse(
      await (
        await paidGet(app, '/v1/suppliers/disruption-alerts?supplierId=s1')
      ).json()
    );
  });

  it('returns valid demand pulse contracts', async () => {
    const { app } = await createDataApiApp('demand');
    apiSchemas.demandIndex.parse(
      await (
        await paidGet(
          app,
          '/v1/demand/index?geoType=city&geoCode=SFO&category=apparel'
        )
      ).json()
    );
    apiSchemas.demandTrend.parse(
      await (
        await paidGet(
          app,
          '/v1/demand/trend?geoCode=SFO&category=apparel&lookbackWindow=30d'
        )
      ).json()
    );
    apiSchemas.demandAnomalies.parse(
      await (
        await paidGet(app, '/v1/demand/anomalies?geoCode=SFO&category=apparel')
      ).json()
    );
  });

  it('returns valid provenance verification contracts', async () => {
    const { app } = await createDataApiApp('provenance');
    apiSchemas.provenanceLineage.parse(
      await (
        await paidGet(app, '/v1/provenance/lineage?datasetId=d1&sourceId=s1')
      ).json()
    );
    apiSchemas.provenanceFreshness.parse(
      await (
        await paidGet(
          app,
          '/v1/provenance/freshness?datasetId=d1&sourceId=s1&maxStalenessMs=500000'
        )
      ).json()
    );
    apiSchemas.provenanceVerify.parse(
      await (
        await paidPost(app, '/v1/provenance/verify-hash', {
          datasetId: 'd1',
          expectedHash: 'sha256:abc',
        })
      ).json()
    );
  });

  it('returns valid screening intelligence contracts', async () => {
    const { app } = await createDataApiApp('screening');
    apiSchemas.screeningCheck.parse(
      await (
        await paidPost(app, '/v1/screening/check', {
          entityName: 'Acme Trading LLC',
        })
      ).json()
    );
    apiSchemas.screeningExposure.parse(
      await (
        await paidGet(
          app,
          '/v1/screening/exposure-chain?entityName=Acme%20Trading%20LLC'
        )
      ).json()
    );
    apiSchemas.screeningJurisdiction.parse(
      await (
        await paidGet(
          app,
          '/v1/screening/jurisdiction-risk?jurisdictions=US,CA'
        )
      ).json()
    );
  });

  it('returns valid macro impact contracts', async () => {
    const { app } = await createDataApiApp('macro');
    apiSchemas.macroEvents.parse(
      await (
        await paidGet(
          app,
          '/v1/macro/events?eventTypes=rates,energy&geography=global'
        )
      ).json()
    );
    apiSchemas.macroImpact.parse(
      await (
        await paidGet(
          app,
          '/v1/macro/impact-vectors?sectorSet=energy,retail&horizon=30d'
        )
      ).json()
    );
    apiSchemas.macroScenario.parse(
      await (
        await paidPost(app, '/v1/macro/scenario-score', {
          geography: 'global',
          horizon: '30d',
        })
      ).json()
    );
  });

  it('keeps cached-path responses under the 500ms budget in-process', async () => {
    const { app } = await createDataApiApp('macro');
    const started = performance.now();
    for (let index = 0; index < 50; index += 1) {
      const res = await paidGet(
        app,
        `/v1/macro/events?eventTypes=rates&geography=global-${index}`
      );
      expect(res.status).toBe(200);
    }
    const elapsed = performance.now() - started;
    expect(elapsed / 50).toBeLessThan(500);
  });
});
