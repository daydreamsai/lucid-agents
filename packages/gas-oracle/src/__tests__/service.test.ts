import { describe, test, expect, beforeEach } from 'bun:test';
import { GasOracleService } from '../service';
import { MockGasDataProvider } from '../provider';
import type { GasQuoteRequest, GasForecastRequest, GasCongestionRequest } from '../schemas';

describe('Gas Oracle Service - Integration Tests', () => {
  let service: GasOracleService;
  let provider: MockGasDataProvider;

  beforeEach(() => {
    provider = new MockGasDataProvider();
    service = new GasOracleService(provider);
  });

  describe('getQuote', () => {
    test('should return valid quote response', async () => {
      const request: GasQuoteRequest = {
        chain: 'ethereum',
        urgency: 'medium',
        txType: 'transfer',
        recentFailureTolerance: 0.05,
      };

      const response = await service.getQuote(request);

      expect(response.recommended_max_fee).toBeDefined();
      expect(response.priority_fee).toBeDefined();
      expect(response.inclusion_probability_curve).toHaveLength(5);
      expect(response.congestion_state).toMatch(/^(low|moderate|high|severe)$/);
      expect(response.confidence_score).toBeGreaterThan(0);
      expect(response.confidence_score).toBeLessThanOrEqual(1);
      expect(response.freshness_ms).toBeGreaterThanOrEqual(0);
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('should adjust fees based on urgency', async () => {
      const lowRequest: GasQuoteRequest = {
        chain: 'ethereum',
        urgency: 'low',
        txType: 'transfer',
        recentFailureTolerance: 0.05,
      };

      const highRequest: GasQuoteRequest = {
        chain: 'ethereum',
        urgency: 'high',
        txType: 'transfer',
        recentFailureTolerance: 0.05,
      };

      const lowResponse = await service.getQuote(lowRequest);
      const highResponse = await service.getQuote(highRequest);

      const lowFee = BigInt(lowResponse.priority_fee);
      const highFee = BigInt(highResponse.priority_fee);

      expect(highFee).toBeGreaterThan(lowFee);
    });

    test('should reflect congestion in response', async () => {
      provider.setMockData('pendingTx:ethereum', 25000);
      provider.setMockData('utilization:ethereum', 0.95);

      const request: GasQuoteRequest = {
        chain: 'ethereum',
        urgency: 'medium',
        txType: 'transfer',
        recentFailureTolerance: 0.05,
      };

      const response = await service.getQuote(request);

      expect(response.congestion_state).toBe('severe');
    });

    test('should generate monotonic inclusion probability curve', async () => {
      const request: GasQuoteRequest = {
        chain: 'ethereum',
        urgency: 'medium',
        txType: 'transfer',
        recentFailureTolerance: 0.05,
      };

      const response = await service.getQuote(request);

      for (let i = 1; i < response.inclusion_probability_curve.length; i++) {
        const prev = response.inclusion_probability_curve[i - 1];
        const curr = response.inclusion_probability_curve[i];
        expect(curr.probability).toBeGreaterThanOrEqual(prev.probability);
      }
    });
  });

  describe('getForecast', () => {
    test('should return valid forecast response', async () => {
      const request: GasForecastRequest = {
        chain: 'ethereum',
        targetBlocks: 10,
      };

      const response = await service.getForecast(request);

      expect(response.chain).toBe('ethereum');
      expect(response.current_block).toBeGreaterThan(0);
      expect(response.forecast).toHaveLength(10);
      expect(response.freshness_ms).toBeGreaterThanOrEqual(0);
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('should forecast increasing fees under high utilization', async () => {
      provider.setMockData('utilization:ethereum', 0.85);

      const request: GasForecastRequest = {
        chain: 'ethereum',
        targetBlocks: 5,
      };

      const response = await service.getForecast(request);

      const firstFee = BigInt(response.forecast[0].estimated_base_fee);
      const lastFee = BigInt(response.forecast[4].estimated_base_fee);

      expect(lastFee).toBeGreaterThan(firstFee);
    });

    test('should forecast decreasing fees under low utilization', async () => {
      provider.setMockData('utilization:ethereum', 0.2);

      const request: GasForecastRequest = {
        chain: 'ethereum',
        targetBlocks: 5,
      };

      const response = await service.getForecast(request);

      const firstFee = BigInt(response.forecast[0].estimated_base_fee);
      const lastFee = BigInt(response.forecast[4].estimated_base_fee);

      expect(lastFee).toBeLessThan(firstFee);
    });

    test('should decrease confidence with block distance', async () => {
      const request: GasForecastRequest = {
        chain: 'ethereum',
        targetBlocks: 10,
      };

      const response = await service.getForecast(request);

      for (let i = 1; i < response.forecast.length; i++) {
        const prev = response.forecast[i - 1];
        const curr = response.forecast[i];
        expect(curr.confidence).toBeLessThanOrEqual(prev.confidence);
      }
    });

    test('should respect targetBlocks parameter', async () => {
      const request3: GasForecastRequest = {
        chain: 'ethereum',
        targetBlocks: 3,
      };

      const request20: GasForecastRequest = {
        chain: 'ethereum',
        targetBlocks: 20,
      };

      const response3 = await service.getForecast(request3);
      const response20 = await service.getForecast(request20);

      expect(response3.forecast).toHaveLength(3);
      expect(response20.forecast).toHaveLength(20);
    });
  });

  describe('getCongestion', () => {
    test('should return valid congestion response', async () => {
      const request: GasCongestionRequest = {
        chain: 'ethereum',
      };

      const response = await service.getCongestion(request);

      expect(response.chain).toBe('ethereum');
      expect(response.congestion_state).toMatch(/^(low|moderate|high|severe)$/);
      expect(response.pending_tx_count).toBeGreaterThanOrEqual(0);
      expect(response.avg_block_utilization).toBeGreaterThanOrEqual(0);
      expect(response.avg_block_utilization).toBeLessThanOrEqual(1);
      expect(response.base_fee_trend).toMatch(/^(rising|stable|falling)$/);
      expect(response.freshness_ms).toBeGreaterThanOrEqual(0);
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('should detect severe congestion', async () => {
      provider.setMockData('pendingTx:ethereum', 25000);
      provider.setMockData('utilization:ethereum', 0.95);

      const request: GasCongestionRequest = {
        chain: 'ethereum',
      };

      const response = await service.getCongestion(request);

      expect(response.congestion_state).toBe('severe');
      expect(response.pending_tx_count).toBe(25000);
      expect(response.avg_block_utilization).toBe(0.95);
    });

    test('should detect low congestion', async () => {
      provider.setMockData('pendingTx:ethereum', 2000);
      provider.setMockData('utilization:ethereum', 0.3);

      const request: GasCongestionRequest = {
        chain: 'ethereum',
      };

      const response = await service.getCongestion(request);

      expect(response.congestion_state).toBe('low');
    });

    test('should track base fee trend across calls', async () => {
      provider.setMockData('baseFee:ethereum', BigInt(30e9));

      const request: GasCongestionRequest = {
        chain: 'ethereum',
      };

      // First call - no previous data
      const response1 = await service.getCongestion(request);
      expect(response1.base_fee_trend).toBe('stable');

      // Increase base fee
      provider.setMockData('baseFee:ethereum', BigInt(35e9));

      // Second call - should detect rising trend
      const response2 = await service.getCongestion(request);
      expect(response2.base_fee_trend).toBe('rising');

      // Decrease base fee
      provider.setMockData('baseFee:ethereum', BigInt(28e9));

      // Third call - should detect falling trend
      const response3 = await service.getCongestion(request);
      expect(response3.base_fee_trend).toBe('falling');
    });
  });
});
