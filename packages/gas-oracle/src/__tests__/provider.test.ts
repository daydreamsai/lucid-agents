import { describe, test, expect, beforeEach } from 'bun:test';
import { MockGasDataProvider, ViemGasDataProvider } from '../provider';

describe('Gas Data Provider - Unit Tests', () => {
  describe('MockGasDataProvider', () => {
    let provider: MockGasDataProvider;

    beforeEach(() => {
      provider = new MockGasDataProvider();
    });

    test('should return default values when no mock data set', async () => {
      const baseFee = await provider.getCurrentBaseFee('ethereum');
      const priorityFee = await provider.getPriorityFee('ethereum');
      const pendingTx = await provider.getPendingTxCount('ethereum');
      const utilization = await provider.getBlockUtilization('ethereum');
      const currentBlock = await provider.getCurrentBlock('ethereum');

      expect(baseFee).toBe(BigInt(30e9));
      expect(priorityFee).toBe(BigInt(2e9));
      expect(pendingTx).toBe(5000);
      expect(utilization).toBe(0.6);
      expect(currentBlock).toBe(18000000);
    });

    test('should return mocked values when set', async () => {
      provider.setMockData('baseFee:ethereum', BigInt(50e9));
      provider.setMockData('priorityFee:ethereum', BigInt(5e9));
      provider.setMockData('pendingTx:ethereum', 15000);
      provider.setMockData('utilization:ethereum', 0.85);
      provider.setMockData('currentBlock:ethereum', 19000000);

      const baseFee = await provider.getCurrentBaseFee('ethereum');
      const priorityFee = await provider.getPriorityFee('ethereum');
      const pendingTx = await provider.getPendingTxCount('ethereum');
      const utilization = await provider.getBlockUtilization('ethereum');
      const currentBlock = await provider.getCurrentBlock('ethereum');

      expect(baseFee).toBe(BigInt(50e9));
      expect(priorityFee).toBe(BigInt(5e9));
      expect(pendingTx).toBe(15000);
      expect(utilization).toBe(0.85);
      expect(currentBlock).toBe(19000000);
    });

    test('should support different chains independently', async () => {
      provider.setMockData('baseFee:ethereum', BigInt(50e9));
      provider.setMockData('baseFee:base', BigInt(1e9));

      const ethBaseFee = await provider.getCurrentBaseFee('ethereum');
      const baseBaseFee = await provider.getCurrentBaseFee('base');

      expect(ethBaseFee).toBe(BigInt(50e9));
      expect(baseBaseFee).toBe(BigInt(1e9));
    });
  });

  describe('ViemGasDataProvider', () => {
    test('should initialize with default RPC endpoints', () => {
      const provider = new ViemGasDataProvider();
      expect(provider).toBeDefined();
    });

    test('should initialize with custom RPC endpoints', () => {
      const provider = new ViemGasDataProvider({
        ethereum: 'https://custom-rpc.example.com',
      });
      expect(provider).toBeDefined();
    });

    test('should cache data within TTL', async () => {
      const provider = new ViemGasDataProvider();
      
      // First call - should fetch
      const baseFee1 = await provider.getCurrentBaseFee('ethereum');
      const freshness1 = provider.getCacheFreshness('ethereum', 'baseFee');
      
      // Second call immediately - should use cache
      const baseFee2 = await provider.getCurrentBaseFee('ethereum');
      const freshness2 = provider.getCacheFreshness('ethereum', 'baseFee');
      
      expect(baseFee1).toBe(baseFee2);
      expect(freshness2).toBeLessThanOrEqual(freshness1 + 100); // Allow small time delta
    });

    test('should report cache freshness correctly', async () => {
      const provider = new ViemGasDataProvider();
      
      // Before any fetch
      const freshnessBeforeFetch = provider.getCacheFreshness('ethereum', 'baseFee');
      expect(freshnessBeforeFetch).toBe(Infinity);
      
      // After fetch
      await provider.getCurrentBaseFee('ethereum');
      const freshnessAfterFetch = provider.getCacheFreshness('ethereum', 'baseFee');
      expect(freshnessAfterFetch).toBeLessThan(1000); // Should be very fresh
    });
  });
});
