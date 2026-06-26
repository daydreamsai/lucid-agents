import { describe, expect,it } from 'bun:test';

import { aggregatePoolDepth, buildDirectRoute, calculateConfidence, checkFreshness, DEFAULT_CONFIG,estimateSlippage, filterPoolsByVenue, findBestRoutes, generateSlippageCurve, isChainSupported, rankRoutes, scoreRoute, selectBestVenue } from './logic';
import type { DepthBucket,PoolInfo, Route } from './schemas';

const mockHop = () => ({ venue: 'uniswap_v3' as const, poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8' as const, tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const, tokenOut: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const, fee: 0.003, estimatedOutput: 99000 });
const mockRouteBase = () => ({ hops: [mockHop()], totalSlippageBps: 20, totalFeeBps: 30, estimatedOutput: 99000, gasEstimate: 150000 });
const mockPool = (venue: string, depthBuckets: DepthBucket[] = []): PoolInfo => ({ venue: venue as any, poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8', fee: 0.003, tvlUsd: 100000000, volume24hUsd: 50000000, depthBuckets });

describe('Data Freshness & Quality', () => {
  it('marks fresh data correctly', () => { expect(checkFreshness(Date.now() - 1000).isStale).toBe(false); });
  it('marks stale data correctly', () => { expect(checkFreshness(Date.now() - 10000).isStale).toBe(true); });
  it('respects custom threshold', () => {
    const ts = Date.now() - 3000;
    expect(checkFreshness(ts, { ...DEFAULT_CONFIG, maxStalenessMs: 2000 }).isStale).toBe(true);
    expect(checkFreshness(ts, { ...DEFAULT_CONFIG, maxStalenessMs: 5000 }).isStale).toBe(false);
  });
  it('confidence increases with pools', () => { expect(calculateConfidence(5, 1000)).toBeGreaterThan(calculateConfidence(1, 1000)); });
  it('confidence decreases with staleness', () => { expect(calculateConfidence(3, 1000)).toBeGreaterThan(calculateConfidence(3, 4000)); });
  it('confidence clamped 0-1', () => { const c = calculateConfidence(10, 100); expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(1); });
  it('chain support works', () => { expect(isChainSupported('eip155:1')).toBe(true); expect(isChainSupported('eip155:999999')).toBe(false); });
});

describe('Slippage Calculation', () => {
  const buckets: DepthBucket[] = [{ notionalUsd: 10000, availableLiquidity: 9950, priceImpactBps: 5 }, { notionalUsd: 50000, availableLiquidity: 49000, priceImpactBps: 20 }, { notionalUsd: 100000, availableLiquidity: 97000, priceImpactBps: 50 }];
  it('returns 0 for empty', () => { expect(estimateSlippage(10000, [])).toBe(0); });
  it('exact match', () => { expect(estimateSlippage(10000, buckets)).toBe(5); expect(estimateSlippage(50000, buckets)).toBe(20); });
  it('intermediate', () => { expect(estimateSlippage(25000, buckets)).toBe(20); });
  it('extrapolates', () => { expect(estimateSlippage(200000, buckets)).toBeGreaterThan(50); });
  it('curve has 5 points', () => { expect(generateSlippageCurve(buckets, 100000).length).toBe(5); });
  it('curve monotonic', () => { const c = generateSlippageCurve(buckets, 100000); for (let i = 1; i < c.length; i++) expect(c[i].slippageBps).toBeGreaterThanOrEqual(c[i-1].slippageBps); });
});

describe('Route Scoring & Ranking', () => {
  it('lower slippage = higher score', () => { expect(scoreRoute({ ...mockRouteBase(), totalSlippageBps: 10 })).toBeGreaterThan(scoreRoute({ ...mockRouteBase(), totalSlippageBps: 100 })); });
  it('lower fees = higher score', () => { expect(scoreRoute({ ...mockRouteBase(), totalFeeBps: 10 })).toBeGreaterThan(scoreRoute({ ...mockRouteBase(), totalFeeBps: 50 })); });
  it('fewer hops = higher score', () => { expect(scoreRoute(mockRouteBase())).toBeGreaterThan(scoreRoute({ ...mockRouteBase(), hops: [mockHop(), mockHop(), mockHop()] })); });
  it('score clamped 0-100', () => { const s = scoreRoute({ ...mockRouteBase(), totalSlippageBps: 1000, totalFeeBps: 200, gasEstimate: 1000000 }); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(100); });
  it('rankRoutes sorts desc', () => { const r = rankRoutes([{ ...mockRouteBase(), score: 50 }, { ...mockRouteBase(), score: 90 }, { ...mockRouteBase(), score: 70 }]); expect(r[0].score).toBe(90); expect(r[2].score).toBe(50); });
  it('rankRoutes no mutate', () => { const r: Route[] = [{ ...mockRouteBase(), score: 50 }, { ...mockRouteBase(), score: 90 }]; const o = [...r]; rankRoutes(r); expect(r).toEqual(o); });
  it('selectBestVenue null for empty', () => { expect(selectBestVenue([], 10000)).toBeNull(); });
  it('selectBestVenue picks lowest slip', () => { expect(selectBestVenue([mockPool('uniswap_v3', [{ notionalUsd: 10000, availableLiquidity: 9900, priceImpactBps: 20 }]), mockPool('curve', [{ notionalUsd: 10000, availableLiquidity: 9950, priceImpactBps: 5 }])], 10000)).toBe('curve'); });
});

describe('Pool Aggregation', () => {
  it('empty for no pools', () => { expect(aggregatePoolDepth([])).toEqual([]); });
  it('aggregates liquidity', () => { const a = aggregatePoolDepth([mockPool('uniswap_v3', [{ notionalUsd: 10000, availableLiquidity: 5000, priceImpactBps: 10 }]), mockPool('curve', [{ notionalUsd: 10000, availableLiquidity: 5000, priceImpactBps: 10 }])]); expect(a.length).toBe(1); expect(a[0].availableLiquidity).toBe(10000); });
  it('filter returns all when no filter', () => { const p = [mockPool('uniswap_v3'), mockPool('curve')]; expect(filterPoolsByVenue(p)).toEqual(p); });
  it('filter works', () => { expect(filterPoolsByVenue([mockPool('uniswap_v3'), mockPool('curve'), mockPool('balancer')], ['uniswap_v3', 'curve']).length).toBe(2); });
});

describe('Route Building', () => {
  it('buildDirectRoute creates valid route', () => { const r = buildDirectRoute(mockPool('uniswap_v3', [{ notionalUsd: 10000, availableLiquidity: 9900, priceImpactBps: 10 }]), '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 10000); expect(r.hops.length).toBe(1); expect(r.score).toBeGreaterThan(0); });
  it('findBestRoutes sorted', () => { const r = findBestRoutes([mockPool('uniswap_v3', [{ notionalUsd: 10000, availableLiquidity: 9900, priceImpactBps: 20 }]), mockPool('curve', [{ notionalUsd: 10000, availableLiquidity: 9950, priceImpactBps: 5 }])], '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 10000); expect(r[0].score).toBeGreaterThanOrEqual(r[1].score); });
  it('findBestRoutes limits', () => { expect(findBestRoutes([mockPool('uniswap_v3'), mockPool('curve'), mockPool('balancer'), mockPool('sushiswap')], '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 10000, 2).length).toBe(2); });
});
