import { describe, expect, it } from 'bun:test';

import { apiRoutes, apiSchemas, createDataApiApp } from '../marketplace';

const paymentHeaders = { PAYMENT: 'test-payment' };

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
  it('registers ten paid API surfaces', () => {
    expect(Object.keys(apiRoutes).sort()).toEqual([
      'demand',
      'gas',
      'identity',
      'liquidity',
      'macro',
      'provenance',
      'regulations',
      'risk',
      'screening',
      'supplier',
    ]);
  });

  it('enforces x402 payment on all monetized API surfaces', async () => {
    const cases = [
      ['supplier', '/v1/suppliers/score?supplierId=s1'],
      ['demand', '/v1/demand/index?geoType=city&geoCode=SFO'],
      ['provenance', '/v1/provenance/lineage?datasetId=d1'],
      ['screening', '/v1/screening/exposure-chain?entityName=Acme'],
      ['macro', '/v1/macro/events?eventTypes=rates'],
      ['liquidity', '/v1/liquidity/snapshot?chain=base'],
      ['gas', '/v1/gas/quote?chain=base'],
      ['risk', '/v1/risk/exposure-paths?address=0x1'],
      ['regulations', '/v1/regulations/delta?jurisdiction=US'],
      ['identity', '/v1/identity/reputation?agentAddress=0x1'],
    ] as const;

    for (const [name, path] of cases) {
      const { app } = await createDataApiApp(name);
      const res = await request(app, path);
      expect(res.status).toBe(402);
      expect(res.headers.get('PAYMENT-REQUIRED')).toBeTruthy();
      expect(res.headers.get('x-402-payment-required')).toBeNull();
    }
  });

  it('accepts a non-empty payment credential from any supported payment header', async () => {
    const { app } = await createDataApiApp('supplier');
    const res = await request(app, '/v1/suppliers/score?supplierId=s1', {
      headers: { 'X-PAYMENT': ' ', 'payment-signature': 'test-payment' },
    });
    expect(res.status).toBe(200);
  });

  it('normalizes invalid positive numeric query values before schema validation', async () => {
    const { app } = await createDataApiApp('supplier');
    const res = await paidGet(
      app,
      '/v1/suppliers/lead-time-forecast?supplierId=s1&horizonDays=0'
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.horizon_days).toBe(1);
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

  it('returns valid liquidity intelligence contracts', async () => {
    const { app } = await createDataApiApp('liquidity');
    apiSchemas.liquidity.parse(
      await (await paidGet(app, '/v1/liquidity/snapshot?chain=base')).json()
    );
    apiSchemas.liquidity.parse(
      await (
        await paidGet(app, '/v1/liquidity/slippage?notionalUsd=100000')
      ).json()
    );
    apiSchemas.liquidity.parse(
      await (
        await paidGet(app, '/v1/liquidity/routes?notionalUsd=100000')
      ).json()
    );
  });

  it('returns valid gas oracle contracts', async () => {
    const { app } = await createDataApiApp('gas');
    apiSchemas.gas.parse(await (await paidGet(app, '/v1/gas/quote')).json());
    apiSchemas.gas.parse(
      await (await paidGet(app, '/v1/gas/forecast?horizonMinutes=30')).json()
    );
    apiSchemas.gas.parse(
      await (await paidGet(app, '/v1/gas/congestion?chain=base')).json()
    );
  });

  it('returns valid counterparty risk contracts', async () => {
    const { app } = await createDataApiApp('risk');
    apiSchemas.risk.parse(
      await (
        await paidPost(app, '/v1/risk/score', {
          address: '0x0000000000000000000000000000000000000001',
        })
      ).json()
    );
    apiSchemas.risk.parse(
      await (await paidGet(app, '/v1/risk/exposure-paths?address=0x1')).json()
    );
    apiSchemas.risk.parse(
      await (await paidGet(app, '/v1/risk/entity-profile?address=0x1')).json()
    );
  });

  it('returns valid regulatory delta contracts', async () => {
    const { app } = await createDataApiApp('regulations');
    apiSchemas.regulations.parse(
      await (await paidGet(app, '/v1/regulations/delta?jurisdiction=US')).json()
    );
    apiSchemas.regulations.parse(
      await (
        await paidGet(app, '/v1/regulations/impact?controlFramework=SOC2')
      ).json()
    );
    apiSchemas.regulations.parse(
      await (
        await paidPost(app, '/v1/regulations/map-controls', {
          jurisdiction: 'US',
          controlFramework: 'SOC2',
        })
      ).json()
    );
  });

  it('returns valid identity reputation contracts', async () => {
    const { app } = await createDataApiApp('identity');
    apiSchemas.identity.parse(
      await (
        await paidGet(app, '/v1/identity/reputation?agentAddress=0x1')
      ).json()
    );
    apiSchemas.identity.parse(
      await (await paidGet(app, '/v1/identity/history?agentAddress=0x1')).json()
    );
    apiSchemas.identity.parse(
      await (
        await paidGet(app, '/v1/identity/trust-breakdown?agentAddress=0x1')
      ).json()
    );
  });

  it('returns deterministic responses for identical paid requests', async () => {
    const { app } = await createDataApiApp('macro');
    const first = await (
      await paidGet(app, '/v1/macro/events?eventTypes=rates&geography=global')
    ).json();
    const second = await (
      await paidGet(app, '/v1/macro/events?eventTypes=rates&geography=global')
    ).json();
    expect(second).toEqual(first);
  });

  it('keeps raw in-process response generation under the 500ms budget', async () => {
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
