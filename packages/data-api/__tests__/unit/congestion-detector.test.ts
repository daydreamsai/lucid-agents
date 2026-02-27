import { describe, test, expect } from 'bun:test';
import { classifyCongestion, computeBaseFeeTrend, CHAIN_CONGESTION_THRESHOLDS } from '../../src/logic/congestion-detector';

const makeBlock = (utilPct: number) => ({
  gas_used: BigInt(Math.round(30_000_000 * utilPct / 100)),
  gas_limit: 30_000_000n,
  base_fee: 30_000_000_000n,
  tx_count: 150,
});

const stableBaseFees = Array.from({ length: 20 }, () => 30_000_000_000n);

describe('classifyCongestion', () => {
  test('2.9 returns low when utilization < chain threshold', () => {
    const result = classifyCongestion(makeBlock(30), stableBaseFees, 'ethereum', 'partial');
    expect(result.congestion_state).toBe('low');
  });

  test('2.10 returns extreme when utilization > chain extreme threshold', () => {
    const result = classifyCongestion(makeBlock(98), stableBaseFees, 'ethereum', 'partial');
    expect(result.congestion_state).toBe('extreme');
  });

  test('2.11 recommends wait during high congestion', () => {
    const result = classifyCongestion(makeBlock(85), stableBaseFees, 'ethereum', 'partial');
    expect(result.congestion_state).toBe('high');
    expect(result.recommended_action).toBe('wait');
  });

  test('2.12 detects base_fee trend from rolling EMA', () => {
    // Rising: last few blocks have higher fees
    const risingFees = Array.from({ length: 20 }, (_, i) =>
      BigInt(30_000_000_000 + i * 2_000_000_000)
    );
    const trend = computeBaseFeeTrend(risingFees);
    expect(trend).toBe('rising');
  });

  test('2.13 returns proceed during low congestion', () => {
    const result = classifyCongestion(makeBlock(30), stableBaseFees, 'ethereum', 'partial');
    expect(result.recommended_action).toBe('proceed');
  });

  test('2.14 uses chain-specific thresholds (ethereum vs base)', () => {
    // 45% utilization: low for ethereum (threshold 50), moderate for base (threshold 40)
    const eth = classifyCongestion(makeBlock(45), stableBaseFees, 'ethereum', 'partial');
    const base = classifyCongestion(makeBlock(45), stableBaseFees, 'base', 'none');
    expect(eth.congestion_state).toBe('low');
    expect(base.congestion_state).toBe('moderate');
  });

  test('2.15 reports mempool_visibility based on provider capability', () => {
    const partial = classifyCongestion(makeBlock(30), stableBaseFees, 'ethereum', 'partial');
    const none = classifyCongestion(makeBlock(30), stableBaseFees, 'base', 'none');
    expect(partial.mempool_visibility).toBe('partial');
    expect(none.mempool_visibility).toBe('none');
  });

  test('2.16 rolling window EMA smooths spike outliers', () => {
    // Mostly stable with one huge spike — should still be stable
    const fees = Array.from({ length: 20 }, () => 30_000_000_000n);
    fees[5] = 100_000_000_000n; // single early spike, smoothed by remaining 14 blocks
    const trend = computeBaseFeeTrend(fees);
    // EMA smooths the spike; current block equals EMA baseline → stable or falling
    expect(['stable', 'falling']).toContain(trend);
  });
});
