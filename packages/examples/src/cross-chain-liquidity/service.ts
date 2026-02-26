import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';

import { aggregatePoolDepth, calculateConfidence, checkFreshness, estimateSlippage, filterPoolsByVenue, findBestRoutes,generateSlippageCurve, isChainSupported, selectBestVenue } from './logic';
import { LiquiditySnapshotInputSchema, type LiquiditySnapshotOutput, LiquiditySnapshotOutputSchema, type PoolInfo,RouteInputSchema, type RouteOutput, RouteOutputSchema, SlippageInputSchema, type SlippageOutput, SlippageOutputSchema } from './schemas';

async function fetchPoolData(_chain: string, _baseToken: string, _quoteToken: string): Promise<{ pools: PoolInfo[]; fetchedAt: number }> {
  return {
    pools: [
      { venue: 'uniswap_v3', poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8', fee: 0.003, tvlUsd: 150000000, volume24hUsd: 75000000, depthBuckets: [{ notionalUsd: 10000, availableLiquidity: 9950, priceImpactBps: 5 }, { notionalUsd: 50000, availableLiquidity: 49500, priceImpactBps: 15 }, { notionalUsd: 100000, availableLiquidity: 98000, priceImpactBps: 30 }, { notionalUsd: 500000, availableLiquidity: 480000, priceImpactBps: 80 }] },
      { venue: 'curve', poolAddress: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7', fee: 0.0004, tvlUsd: 200000000, volume24hUsd: 50000000, depthBuckets: [{ notionalUsd: 10000, availableLiquidity: 9990, priceImpactBps: 1 }, { notionalUsd: 50000, availableLiquidity: 49900, priceImpactBps: 5 }, { notionalUsd: 100000, availableLiquidity: 99500, priceImpactBps: 10 }, { notionalUsd: 500000, availableLiquidity: 495000, priceImpactBps: 25 }] },
      { venue: 'balancer', poolAddress: '0x5c6Ee304399DBdB9C8Ef030aB642B10820DB8F56', fee: 0.002, tvlUsd: 80000000, volume24hUsd: 20000000, depthBuckets: [{ notionalUsd: 10000, availableLiquidity: 9900, priceImpactBps: 10 }, { notionalUsd: 50000, availableLiquidity: 48500, priceImpactBps: 30 }, { notionalUsd: 100000, availableLiquidity: 95000, priceImpactBps: 50 }] },
    ],
    fetchedAt: Date.now(),
  };
}

const agent = await createAgent({ name: 'cross-chain-liquidity', version: '1.0.0', description: 'Paid API for cross-chain liquidity snapshots, slippage estimation, and route quality' })
  .use(http())
  .use(payments({ config: { payTo: process.env.PAYMENT_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', network: process.env.PAYMENT_NETWORK || 'eip155:84532', facilitatorUrl: process.env.FACILITATOR_URL || 'https://facilitator.daydreams.systems' } }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

addEntrypoint({
  key: 'liquidity-snapshot', description: 'Get liquidity depth snapshot for a token pair', price: '0.10',
  input: LiquiditySnapshotInputSchema, output: LiquiditySnapshotOutputSchema,
  handler: async ctx => {
    const { chain, baseToken, quoteToken, venueFilter } = ctx.input;
    if (!isChainSupported(chain)) throw new Error(`Unsupported chain: ${chain}`);
    const { pools: rawPools, fetchedAt } = await fetchPoolData(chain, baseToken, quoteToken);
    const pools = filterPoolsByVenue(rawPools, venueFilter);
    const freshness = checkFreshness(fetchedAt);
    if (freshness.isStale) throw new Error(`Data stale: ${freshness.ageMs}ms`);
    return { output: { chain, baseToken, quoteToken, pools, freshnessMs: freshness.ageMs, confidenceScore: calculateConfidence(pools.length, freshness.ageMs), timestamp: Date.now() } as LiquiditySnapshotOutput };
  },
});

addEntrypoint({
  key: 'liquidity-slippage', description: 'Estimate slippage for a given trade size', price: '0.05',
  input: SlippageInputSchema, output: SlippageOutputSchema,
  handler: async ctx => {
    const { chain, baseToken, quoteToken, notionalUsd, venueFilter } = ctx.input;
    if (!isChainSupported(chain)) throw new Error(`Unsupported chain: ${chain}`);
    const { pools: rawPools, fetchedAt } = await fetchPoolData(chain, baseToken, quoteToken);
    const pools = filterPoolsByVenue(rawPools, venueFilter);
    const freshness = checkFreshness(fetchedAt);
    if (freshness.isStale) throw new Error('Data stale');
    if (pools.length === 0) throw new Error('No pools found');
    const agg = aggregatePoolDepth(pools);
    const bestVenue = selectBestVenue(pools, notionalUsd);
    if (!bestVenue) throw new Error('No venue');
    return { output: { chain, baseToken, quoteToken, notionalUsd, estimatedSlippageBps: estimateSlippage(notionalUsd, agg), slippageBpsCurve: generateSlippageCurve(agg, notionalUsd * 2), bestVenue, freshnessMs: freshness.ageMs, confidenceScore: calculateConfidence(pools.length, freshness.ageMs), timestamp: Date.now() } as SlippageOutput };
  },
});

addEntrypoint({
  key: 'liquidity-routes', description: 'Find best execution routes', price: '0.15',
  input: RouteInputSchema, output: RouteOutputSchema,
  handler: async ctx => {
    const { chain, baseToken, quoteToken, notionalUsd, venueFilter } = ctx.input;
    if (!isChainSupported(chain)) throw new Error(`Unsupported chain: ${chain}`);
    const { pools: rawPools, fetchedAt } = await fetchPoolData(chain, baseToken, quoteToken);
    const pools = filterPoolsByVenue(rawPools, venueFilter);
    const freshness = checkFreshness(fetchedAt);
    if (freshness.isStale) throw new Error('Data stale');
    if (pools.length === 0) throw new Error('No pools found');
    const routes = findBestRoutes(pools, baseToken, quoteToken, notionalUsd, 5);
    if (routes.length === 0) throw new Error('No routes');
    return { output: { chain, baseToken, quoteToken, notionalUsd, bestRoute: routes[0], alternativeRoutes: routes.slice(1), freshnessMs: freshness.ageMs, confidenceScore: calculateConfidence(pools.length, freshness.ageMs), timestamp: Date.now() } as RouteOutput };
  },
});

const port = Number(process.env.PORT ?? 3000);
const server = Bun.serve({ port, fetch: app.fetch });
console.log(`Cross-Chain Liquidity Service @ http://${server.hostname}:${server.port}`);
export { agent,app };
