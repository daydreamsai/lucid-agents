import { describe, expect, test } from 'bun:test';
import { LiquidityService } from '../liquidity-service';
import type { LiquiditySnapshotRequest, SlippageRequest, RoutesRequest } from '../schemas';

describe('LiquidityService', () => {
  const service = new LiquidityService();

  describe('getSnapshot', () => {
    test('should return valid snapshot with pools', async () => {
      const request: LiquiditySnapshotRequest = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      };

      const result = await service.getSnapshot(request);

      expect(result.pools).toBeArray();
      expect(result.pools.length).toBeGreaterThan(0);
      expect(result.freshness_ms).toBeNumber();
      expect(result.freshness_ms).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeString();
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
    });

    test('should filter by venue when venueFilter provided', async () => {
      const request: LiquiditySnapshotRequest = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        venueFilter: ['uniswap-v3'],
      };

      const result = await service.getSnapshot(request);

      expect(result.pools.every(p => p.venue === 'uniswap-v3')).toBe(true);
    });

    test('should include depth buckets for each pool', async () => {
      const request: LiquiditySnapshotRequest = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      };

      const result = await service.getSnapshot(request);

      result.pools.forEach(pool => {
        expect(pool.depthBuckets).toBeArray();
        expect(pool.depthBuckets.length).toBeGreaterThan(0);
        pool.depthBuckets.forEach(bucket => {
          expect(bucket.notionalUsd).toBeNumber();
          expect(bucket.notionalUsd).toBeGreaterThan(0);
          expect(bucket.liquidityUsd).toBeNumber();
          expect(bucket.liquidityUsd).toBeGreaterThanOrEqual(0);
        });
      });
    });

    test('should reject stale data', async () => {
      const request: LiquiditySnapshotRequest = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      };

      const result = await service.getSnapshot(request);

      // Freshness should be under 60 seconds (60000ms)
      expect(result.freshness_ms).toBeLessThan(60000);
    });
  });

  describe('getSlippage', () => {
    test('should return slippage curve', async () => {
      const request: SlippageRequest = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        notionalUsd: 10000,
      };

      const result = await service.getSlippage(request);

      expect(result.slippage_bps_curve).toBeArray();
      expect(result.slippage_bps_curve.length).toBeGreaterThan(0);
      expect(result.confidence_score).toBeNumber();
      expect(result.confidence_score).toBeGreaterThanOrEqual(0);
      expect(result.confidence_score).toBeLessThanOrEqual(1);
      expect(result.freshness_ms).toBeNumber();
      expect(result.timestamp).toBeString();
    });

    test('should have ascending notional values in curve', async () => {
      const request: SlippageRequest = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        notionalUsd: 50000,
      };

      const result = await service.getSlippage(request);

      for (let i = 1; i < result.slippage_bps_curve.length; i++) {
        expect(result.slippage_bps_curve[i].notionalUsd).toBeGreaterThan(
          result.slippage_bps_curve[i - 1].notionalUsd
        );
      }
    });

    test('should have increasing slippage with size', async () => {
      const request: SlippageRequest = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        notionalUsd: 100000,
      };

      const result = await service.getSlippage(request);

      // Generally slippage should increase with trade size
      const firstSlippage = result.slippage_bps_curve[0].slippageBps;
      const lastSlippage = result.slippage_bps_curve[result.slippage_bps_curve.length - 1].slippageBps;
      expect(lastSlippage).toBeGreaterThanOrEqual(firstSlippage);
    });
  });

  describe('getRoutes', () => {
    test('should return best route and alternatives', async () => {
      const request: RoutesRequest = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        notionalUsd: 25000,
      };

      const result = await service.getRoutes(request);

      expect(result.best_route).toBeDefined();
      expect(result.best_route.path).toBeArray();
      expect(result.best_route.path.length).toBeGreaterThan(0);
      expect(result.best_route.estimatedSlippageBps).toBeNumber();
      expect(result.best_route.estimatedGasUsd).toBeNumber();
      expect(result.best_route.totalCostBps).toBeNumber();
      expect(result.best_route.confidence_score).toBeNumber();
      expect(result.alternatives).toBeArray();
      expect(result.freshness_ms).toBeNumber();
      expect(result.timestamp).toBeString();
    });

    test('should rank routes by total cost', async () => {
      const request: RoutesRequest = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        notionalUsd: 50000,
      };

      const result = await service.getRoutes(request);

      // Best route should have lowest or equal total cost
      result.alternatives.forEach(alt => {
        expect(result.best_route.totalCostBps).toBeLessThanOrEqual(alt.totalCostBps);
      });
    });

    test('should include confidence scores', async () => {
      const request: RoutesRequest = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        notionalUsd: 10000,
      };

      const result = await service.getRoutes(request);

      expect(result.best_route.confidence_score).toBeGreaterThanOrEqual(0);
      expect(result.best_route.confidence_score).toBeLessThanOrEqual(1);

      result.alternatives.forEach(alt => {
        expect(alt.confidence_score).toBeGreaterThanOrEqual(0);
        expect(alt.confidence_score).toBeLessThanOrEqual(1);
      });
    });
  });
});
