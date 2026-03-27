import type {
  LiquiditySnapshotRequest,
  LiquiditySnapshotResponse,
  SlippageRequest,
  SlippageResponse,
  RoutesRequest,
  RoutesResponse,
} from './schemas';

/**
 * Core business logic for liquidity data transforms and ranking
 */
export class LiquidityService {
  private readonly FRESHNESS_THRESHOLD_MS = 60000; // 60 seconds

  /**
   * Get liquidity snapshot for a token pair
   */
  async getSnapshot(request: LiquiditySnapshotRequest): Promise<LiquiditySnapshotResponse> {
    const timestamp = new Date().toISOString();
    const freshness_ms = Math.floor(Math.random() * 10000); // Mock: 0-10s

    // Mock pool data - in production this would fetch from DEX APIs
    const allPools = [
      {
        venue: 'uniswap-v3' as const,
        address: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640',
        baseToken: request.baseToken,
        quoteToken: request.quoteToken,
        tvlUsd: 150000000,
        depthBuckets: [
          { notionalUsd: 1000, liquidityUsd: 50000 },
          { notionalUsd: 10000, liquidityUsd: 500000 },
          { notionalUsd: 100000, liquidityUsd: 3000000 },
        ],
      },
      {
        venue: 'curve' as const,
        address: '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
        baseToken: request.baseToken,
        quoteToken: request.quoteToken,
        tvlUsd: 80000000,
        depthBuckets: [
          { notionalUsd: 1000, liquidityUsd: 40000 },
          { notionalUsd: 10000, liquidityUsd: 400000 },
          { notionalUsd: 100000, liquidityUsd: 2500000 },
        ],
      },
      {
        venue: 'sushiswap' as const,
        address: '0x397ff1542f962076d0bfe58ea045ffa2d347aca0',
        baseToken: request.baseToken,
        quoteToken: request.quoteToken,
        tvlUsd: 25000000,
        depthBuckets: [
          { notionalUsd: 1000, liquidityUsd: 20000 },
          { notionalUsd: 10000, liquidityUsd: 200000 },
          { notionalUsd: 100000, liquidityUsd: 1000000 },
        ],
      },
    ];

    // Filter by venue if specified
    const pools = request.venueFilter
      ? allPools.filter(p => request.venueFilter!.includes(p.venue))
      : allPools;

    // Reject stale data
    if (freshness_ms > this.FRESHNESS_THRESHOLD_MS) {
      throw new Error(`Data too stale: ${freshness_ms}ms > ${this.FRESHNESS_THRESHOLD_MS}ms`);
    }

    return {
      pools,
      freshness_ms,
      timestamp,
    };
  }

  /**
   * Calculate slippage curve for a token pair
   */
  async getSlippage(request: SlippageRequest): Promise<SlippageResponse> {
    const timestamp = new Date().toISOString();
    const freshness_ms = Math.floor(Math.random() * 10000);

    // Mock slippage calculation - in production would use pool depth data
    const baseSlippage = 5; // 5 bps base
    const slippage_bps_curve = [
      { notionalUsd: 1000, slippageBps: baseSlippage },
      { notionalUsd: 5000, slippageBps: baseSlippage * 2 },
      { notionalUsd: 10000, slippageBps: baseSlippage * 3 },
      { notionalUsd: 50000, slippageBps: baseSlippage * 6 },
      { notionalUsd: 100000, slippageBps: baseSlippage * 10 },
      { notionalUsd: 500000, slippageBps: baseSlippage * 20 },
    ].filter(point => point.notionalUsd <= request.notionalUsd * 2);

    // Ensure we have at least the requested notional
    if (slippage_bps_curve.length === 0 || slippage_bps_curve[slippage_bps_curve.length - 1].notionalUsd < request.notionalUsd) {
      slippage_bps_curve.push({
        notionalUsd: request.notionalUsd,
        slippageBps: baseSlippage * Math.ceil(request.notionalUsd / 10000),
      });
    }

    // Confidence decreases with larger trades
    const confidence_score = Math.max(0.7, 1 - request.notionalUsd / 1000000);

    return {
      slippage_bps_curve,
      confidence_score,
      freshness_ms,
      timestamp,
    };
  }

  /**
   * Find best execution routes
   */
  async getRoutes(request: RoutesRequest): Promise<RoutesResponse> {
    const timestamp = new Date().toISOString();
    const freshness_ms = Math.floor(Math.random() * 10000);

    // Mock route calculation - in production would use routing algorithms
    const routes = [
      {
        path: ['uniswap-v3' as const],
        estimatedSlippageBps: 25,
        estimatedGasUsd: 15,
        totalCostBps: 40,
        confidence_score: 0.95,
      },
      {
        path: ['curve' as const],
        estimatedSlippageBps: 30,
        estimatedGasUsd: 12,
        totalCostBps: 42,
        confidence_score: 0.92,
      },
      {
        path: ['uniswap-v3' as const, 'curve' as const],
        estimatedSlippageBps: 45,
        estimatedGasUsd: 25,
        totalCostBps: 70,
        confidence_score: 0.88,
      },
      {
        path: ['sushiswap' as const],
        estimatedSlippageBps: 60,
        estimatedGasUsd: 14,
        totalCostBps: 74,
        confidence_score: 0.85,
      },
    ];

    // Filter by venue if specified
    const filteredRoutes = request.venueFilter
      ? routes.filter(r => r.path.every(venue => request.venueFilter!.includes(venue)))
      : routes;

    // Sort by total cost (ascending)
    const sortedRoutes = [...filteredRoutes].sort((a, b) => a.totalCostBps - b.totalCostBps);

    if (sortedRoutes.length === 0) {
      throw new Error('No routes found for the given filters');
    }

    const best_route = sortedRoutes[0];
    const alternatives = sortedRoutes.slice(1);

    return {
      best_route,
      alternatives,
      freshness_ms,
      timestamp,
    };
  }
}
