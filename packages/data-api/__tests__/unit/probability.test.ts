import { describe, test, expect } from 'bun:test';
import { inclusionProbability, buildInclusionCurve } from '../../src/logic/probability';

const currentBaseFee = 30_000_000_000n;
const priorityFees = [
  1_000_000_000n, 1_500_000_000n, 2_000_000_000n, 2_500_000_000n, 3_000_000_000n,
];

describe('buildInclusionCurve', () => {
  test('2.22 returns sorted by target_block ascending', () => {
    const curve = buildInclusionCurve(
      50_000_000_000n, 2_000_000_000n, currentBaseFee, priorityFees, 5,
    );
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].target_block).toBeGreaterThan(curve[i - 1].target_block);
    }
  });

  test('2.23 probability is monotonically non-decreasing', () => {
    const curve = buildInclusionCurve(
      50_000_000_000n, 2_000_000_000n, currentBaseFee, priorityFees, 10,
    );
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].inclusion_probability).toBeGreaterThanOrEqual(curve[i - 1].inclusion_probability);
    }
  });

  test('2.24 at max_fee=0 → probability near 0', () => {
    const prob = inclusionProbability({
      max_fee: 0n,
      current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
      target_block: 1,
    });
    expect(prob).toBe(0);
  });

  test('2.25 higher fee → higher probability', () => {
    const lowFeeProb = inclusionProbability({
      max_fee: 35_000_000_000n,
      current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
      target_block: 1,
    });
    const highFeeProb = inclusionProbability({
      max_fee: 100_000_000_000n,
      current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
      target_block: 1,
    });
    expect(highFeeProb).toBeGreaterThan(lowFeeProb);
  });

  test('2.26 probability ≈ 0 when max_fee < projected_base_fee + min_tip', () => {
    // For block 1, projected = 30gwei * 9/8 = 33.75gwei
    // max_fee of 33gwei < projected → should be 0
    const prob = inclusionProbability({
      max_fee: 33_000_000_000n,
      current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
      target_block: 1,
    });
    expect(prob).toBe(0);
  });

  test('2.27 near-zero denominator guard: no NaN/Infinity when base_fee ≈ 0', () => {
    const prob = inclusionProbability({
      max_fee: 1_000_000n,
      current_base_fee: 0n,
      recent_priority_fees: [0n, 0n, 0n],
      target_block: 1,
    });
    expect(Number.isFinite(prob)).toBe(true);
    expect(prob).toBeGreaterThan(0);
  });

  test('2.28 sigmoid uses max_fee vs projected base fee', () => {
    // At block 5, projected base = currentBase * (9/8)^5 ≈ 56.8gwei
    // max_fee = 60gwei → small effective tip → moderate probability
    const prob = inclusionProbability({
      max_fee: 60_000_000_000n,
      current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
      target_block: 5,
    });
    expect(prob).toBeGreaterThan(0);
    expect(prob).toBeLessThan(1);
  });
});
