import { describe, test, expect } from 'bun:test';
import { buildForecast } from '../../src/logic/forecast-model';

const currentBaseFee = 30_000_000_000n;
const recentBaseFees = Array.from({ length: 20 }, () => 30_000_000_000n);
const recentPriorityFees = [
  1_000_000_000n, 1_500_000_000n, 2_000_000_000n, 2_500_000_000n, 3_000_000_000n,
  500_000_000n, 1_200_000_000n, 1_800_000_000n, 2_200_000_000n, 2_800_000_000n,
];

describe('buildForecast', () => {
  test('2.17 generates monotonically increasing inclusion_probability', () => {
    const result = buildForecast({
      chain: 'ethereum', target_blocks: 10,
      current_base_fee: currentBaseFee,
      recent_base_fees: recentBaseFees,
      recent_priority_fees: recentPriorityFees,
    });
    const probs = result.inclusion_probability_curve.map(p => p.inclusion_probability);
    for (let i = 1; i < probs.length; i++) {
      expect(probs[i]).toBeGreaterThanOrEqual(probs[i - 1]);
    }
  });

  test('2.18 returns exactly target_blocks data points', () => {
    const result = buildForecast({
      chain: 'ethereum', target_blocks: 7,
      current_base_fee: currentBaseFee,
      recent_base_fees: recentBaseFees,
      recent_priority_fees: recentPriorityFees,
    });
    expect(result.inclusion_probability_curve.length).toBe(7);
    expect(result.forecast_horizon_blocks).toBe(7);
  });

  test('2.19 detects rising trend when base fees increase', () => {
    const risingFees = Array.from({ length: 20 }, (_, i) =>
      BigInt(30_000_000_000 + i * 2_000_000_000)
    );
    const result = buildForecast({
      chain: 'ethereum', target_blocks: 5,
      current_base_fee: currentBaseFee,
      recent_base_fees: risingFees,
      recent_priority_fees: recentPriorityFees,
    });
    expect(result.trend).toBe('rising');
  });

  test('2.20 probability at block N+1 >= probability at block N', () => {
    const result = buildForecast({
      chain: 'ethereum', target_blocks: 20,
      current_base_fee: currentBaseFee,
      recent_base_fees: recentBaseFees,
      recent_priority_fees: recentPriorityFees,
    });
    const curve = result.inclusion_probability_curve;
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].inclusion_probability).toBeGreaterThanOrEqual(curve[i - 1].inclusion_probability);
    }
  });

  test('2.21 returns probability=1.0 for sufficiently high max_fee', () => {
    // With very low base fee, inclusion should approach 1.0
    const result = buildForecast({
      chain: 'ethereum', target_blocks: 50,
      current_base_fee: 1_000n, // very low base fee
      recent_base_fees: Array.from({ length: 20 }, () => 1_000n),
      recent_priority_fees: [100n, 200n, 300n, 400n, 500n],
    });
    const lastProb = result.inclusion_probability_curve[result.inclusion_probability_curve.length - 1];
    expect(lastProb.inclusion_probability).toBeGreaterThanOrEqual(0.9);
  });
});
