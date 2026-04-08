import type { DepthBucket, PoolInfo, Route, RouteHop, SlippageCurvePoint,Venue } from './schemas';

export interface LiquidityServiceConfig {
  maxStalenessMs: number;
  minConfidenceScore: number;
  supportedChains: string[];
}

export const DEFAULT_CONFIG: LiquidityServiceConfig = {
  maxStalenessMs: 5000,
  minConfidenceScore: 0.5,
  supportedChains: ['eip155:1', 'eip155:137', 'eip155:42161', 'eip155:10', 'eip155:8453'],
};

export interface FreshnessResult { isStale: boolean; ageMs: number; threshold: number; }

export function checkFreshness(dataTimestamp: number, config: LiquidityServiceConfig = DEFAULT_CONFIG): FreshnessResult {
  const ageMs = Date.now() - dataTimestamp;
  return { isStale: ageMs > config.maxStalenessMs, ageMs, threshold: config.maxStalenessMs };
}

export function calculateConfidence(poolCount: number, freshnessMs: number, config: LiquidityServiceConfig = DEFAULT_CONFIG): number {
  const poolConfidence = Math.min(poolCount / 5, 1) * 0.5;
  const freshnessPenalty = Math.min(freshnessMs / config.maxStalenessMs, 1) * 0.3;
  return Math.max(0, Math.min(1, 0.5 + poolConfidence - freshnessPenalty));
}

export function isChainSupported(chain: string, config: LiquidityServiceConfig = DEFAULT_CONFIG): boolean {
  return config.supportedChains.includes(chain);
}

export function estimateSlippage(notionalUsd: number, depthBuckets: DepthBucket[]): number {
  if (depthBuckets.length === 0) return 0;
  const sorted = [...depthBuckets].sort((a, b) => a.notionalUsd - b.notionalUsd);
  for (const bucket of sorted) if (bucket.notionalUsd >= notionalUsd) return bucket.priceImpactBps;
  const last = sorted[sorted.length - 1];
  return Math.round(last.priceImpactBps * (notionalUsd / last.notionalUsd));
}

export function generateSlippageCurve(depthBuckets: DepthBucket[], maxNotional: number): SlippageCurvePoint[] {
  return [0.1, 0.25, 0.5, 0.75, 1.0].map(step => ({
    notionalUsd: maxNotional * step,
    slippageBps: estimateSlippage(maxNotional * step, depthBuckets),
  }));
}

export const DEFAULT_SCORE_FACTORS = { slippageWeight: 0.4, feeWeight: 0.3, gasWeight: 0.2, hopPenalty: 5 };

export function scoreRoute(route: Omit<Route, 'score'>, factors = DEFAULT_SCORE_FACTORS): number {
  let score = 100;
  score -= Math.min(route.totalSlippageBps / 500, 1) * 100 * factors.slippageWeight;
  score -= Math.min(route.totalFeeBps / 100, 1) * 100 * factors.feeWeight;
  score -= Math.min(route.gasEstimate / 500000, 1) * 100 * factors.gasWeight;
  score -= (route.hops.length - 1) * factors.hopPenalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function rankRoutes(routes: Route[]): Route[] {
  return [...routes].sort((a, b) => b.score - a.score);
}

export function selectBestVenue(pools: PoolInfo[], notionalUsd: number): Venue | null {
  if (pools.length === 0) return null;
  let best: Venue | null = null, lowest = Infinity;
  for (const pool of pools) {
    const slip = estimateSlippage(notionalUsd, pool.depthBuckets);
    if (slip < lowest) { lowest = slip; best = pool.venue; }
  }
  return best;
}

export function aggregatePoolDepth(pools: PoolInfo[]): DepthBucket[] {
  if (pools.length === 0) return [];
  const levels = new Set<number>();
  pools.forEach(p => p.depthBuckets.forEach(b => levels.add(b.notionalUsd)));
  return Array.from(levels).sort((a, b) => a - b).map(notional => {
    let totalLiq = 0, weightedImpact = 0, totalWeight = 0;
    pools.forEach(p => {
      const b = p.depthBuckets.find(x => x.notionalUsd === notional);
      if (b) { totalLiq += b.availableLiquidity; weightedImpact += b.priceImpactBps * b.availableLiquidity; totalWeight += b.availableLiquidity; }
    });
    return { notionalUsd: notional, availableLiquidity: totalLiq, priceImpactBps: totalWeight > 0 ? Math.round(weightedImpact / totalWeight) : 0 };
  });
}

export function filterPoolsByVenue(pools: PoolInfo[], venues?: Venue[]): PoolInfo[] {
  return (!venues || venues.length === 0) ? pools : pools.filter(p => venues.includes(p.venue));
}

export function buildDirectRoute(pool: PoolInfo, baseToken: string, quoteToken: string, notionalUsd: number): Route {
  const slippage = estimateSlippage(notionalUsd, pool.depthBuckets);
  const feeBps = Math.round(pool.fee * 10000);
  const estimatedOutput = notionalUsd * (1 - slippage / 10000) * (1 - pool.fee);
  const hop: RouteHop = { venue: pool.venue, poolAddress: pool.poolAddress, tokenIn: baseToken as `0x${string}`, tokenOut: quoteToken as `0x${string}`, fee: pool.fee, estimatedOutput };
  const base = { hops: [hop], totalSlippageBps: slippage, totalFeeBps: feeBps, estimatedOutput, gasEstimate: 150000 };
  return { ...base, score: scoreRoute(base) };
}

export function findBestRoutes(pools: PoolInfo[], baseToken: string, quoteToken: string, notionalUsd: number, maxRoutes = 3): Route[] {
  return rankRoutes(pools.map(p => buildDirectRoute(p, baseToken, quoteToken, notionalUsd))).slice(0, maxRoutes);
}
