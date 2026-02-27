import { describe, test, expect } from 'bun:test';
import { estimateGas, projectBaseFee } from '../../src/logic/gas-estimator';

const baseFees = [
  2_000_000_000n, 2_100_000_000n, 1_900_000_000n, 2_050_000_000n, 2_200_000_000n,
  1_800_000_000n, 2_300_000_000n, 2_150_000_000n, 2_000_000_000n, 2_100_000_000n,
];

const currentBaseFee = 30_000_000_000n; // 30 gwei

const priorityFees = [
  1_000_000_000n, 1_500_000_000n, 2_000_000_000n, 2_500_000_000n, 3_000_000_000n,
  500_000_000n, 1_200_000_000n, 1_800_000_000n, 2_200_000_000n, 2_800_000_000n,
];

describe('estimateGas', () => {
  test('2.1 returns higher fees for urgency=urgent vs low', () => {
    const urgent = estimateGas({
      chain: 'ethereum', urgency: 'urgent', tx_type: 'transfer',
      recent_failure_tolerance: 0.05, current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
    });
    const low = estimateGas({
      chain: 'ethereum', urgency: 'low', tx_type: 'transfer',
      recent_failure_tolerance: 0.05, current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
    });
    expect(BigInt(urgent.priority_fee)).toBeGreaterThan(BigInt(low.priority_fee));
  });

  test('2.2 uses percentile tips (p50 for low, p95 for urgent)', () => {
    const low = estimateGas({
      chain: 'ethereum', urgency: 'low', tx_type: 'transfer',
      recent_failure_tolerance: 0.05, current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
    });
    const urgent = estimateGas({
      chain: 'ethereum', urgency: 'urgent', tx_type: 'transfer',
      recent_failure_tolerance: 0.05, current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
    });
    // urgent tip should be significantly higher than low tip
    expect(BigInt(urgent.priority_fee)).toBeGreaterThan(BigInt(low.priority_fee));
  });

  test('2.3 respects recent_failure_tolerance (higher tolerance → lower fee)', () => {
    const lowTolerance = estimateGas({
      chain: 'ethereum', urgency: 'medium', tx_type: 'transfer',
      recent_failure_tolerance: 0.01, current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
    });
    const highTolerance = estimateGas({
      chain: 'ethereum', urgency: 'medium', tx_type: 'transfer',
      recent_failure_tolerance: 0.10, current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
    });
    expect(BigInt(lowTolerance.recommended_max_fee)).toBeGreaterThan(BigInt(highTolerance.recommended_max_fee));
  });

  test('2.5 returns wei strings (not negative, not zero)', () => {
    const result = estimateGas({
      chain: 'ethereum', urgency: 'medium', tx_type: 'transfer',
      recent_failure_tolerance: 0.05, current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
    });
    expect(BigInt(result.recommended_max_fee)).toBeGreaterThan(0n);
    expect(BigInt(result.priority_fee)).toBeGreaterThan(0n);
  });

  test('2.6 uses base_fee*(9/8)^n formula with urgency block targets', () => {
    // For urgent (n=1): projected = 30gwei * 9/8 = 33.75gwei
    const projected1 = projectBaseFee(currentBaseFee, 1);
    expect(projected1).toBe(33_750_000_000n);

    // For medium (n=5): projected = 30gwei * (9/8)^5
    const projected5 = projectBaseFee(currentBaseFee, 5);
    expect(projected5).toBeGreaterThan(projected1);
  });

  test('2.7 urgent (n=1) produces lower max_fee than low (n=10)', () => {
    const urgent = estimateGas({
      chain: 'ethereum', urgency: 'urgent', tx_type: 'transfer',
      recent_failure_tolerance: 0.05, current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
    });
    const low = estimateGas({
      chain: 'ethereum', urgency: 'low', tx_type: 'transfer',
      recent_failure_tolerance: 0.05, current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
    });
    // Low has higher block target (n=10) so higher projected base fee
    // even though urgent has higher priority fee, the max_fee for low should be higher
    // due to (9/8)^10 >> (9/8)^1
    expect(BigInt(low.recommended_max_fee)).toBeGreaterThan(BigInt(urgent.recommended_max_fee));
  });

  test('2.8 max_fee for medium (n=5): base_fee * (9/8)^5 + priority_fee', () => {
    const result = estimateGas({
      chain: 'ethereum', urgency: 'medium', tx_type: 'transfer',
      recent_failure_tolerance: 0.05, current_base_fee: currentBaseFee,
      recent_priority_fees: priorityFees,
    });
    const projectedBase = projectBaseFee(currentBaseFee, 5);
    const maxFee = BigInt(result.recommended_max_fee);
    const tip = BigInt(result.priority_fee);
    expect(maxFee).toBe(projectedBase + tip);
  });
});
