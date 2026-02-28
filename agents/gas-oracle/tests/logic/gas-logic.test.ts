import { describe, it, expect } from 'bun:test';
import {
  estimateFees,
  buildInclusionCurve,
  buildForecast,
  estimateWaitSeconds,
} from '../../src/logic/gas-estimation.js';
import { analyseCongestion } from '../../src/logic/congestion-analysis.js';

const GWEI = 1_000_000_000n;

describe('estimateFees', () => {
  it('urgent urgency gives highest fee', () => {
    const baseFee = 20n * GWEI;
    const urgent = estimateFees(baseFee, 'urgent');
    const low = estimateFees(baseFee, 'low');
    expect(urgent.recommendedMaxFeeWei > low.recommendedMaxFeeWei).toBe(true);
  });

  it('recommendedMaxFee >= baseFee + priorityFee', () => {
    const baseFee = 30n * GWEI;
    const { recommendedMaxFeeWei, priorityFeeWei } = estimateFees(baseFee, 'medium');
    expect(recommendedMaxFeeWei >= baseFee + priorityFeeWei).toBe(true);
  });

  it('priority fee is positive for all urgencies', () => {
    for (const urgency of ['low', 'medium', 'high', 'urgent'] as const) {
      const { priorityFeeWei } = estimateFees(20n * GWEI, urgency);
      expect(priorityFeeWei > 0n).toBe(true);
    }
  });
});

describe('buildInclusionCurve', () => {
  it('returns array of length maxBlocks', () => {
    const curve = buildInclusionCurve('medium', 10);
    expect(curve.length).toBe(10);
  });

  it('probability is monotonically increasing', () => {
    const curve = buildInclusionCurve('medium', 20);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].probability >= curve[i - 1].probability).toBe(true);
    }
  });

  it('first block probability is strictly between 0 and 1', () => {
    const p = buildInclusionCurve('medium', 5)[0].probability;
    expect(p > 0 && p < 1).toBe(true);
  });

  it('urgent curve reaches higher probability faster than low', () => {
    const urgent = buildInclusionCurve('urgent', 5);
    const low = buildInclusionCurve('low', 5);
    expect(urgent[0].probability > low[0].probability).toBe(true);
  });
});

describe('buildForecast', () => {
  it('returns correct number of steps', () => {
    const forecast = buildForecast(20, 60, 5);
    expect(forecast.length).toBe(12);
  });

  it('timestamps are strictly increasing', () => {
    const forecast = buildForecast(20, 60, 5, 1_700_000_000_000);
    for (let i = 1; i < forecast.length; i++) {
      expect(forecast[i].timestamp_ms > forecast[i - 1].timestamp_ms).toBe(true);
    }
  });

  it('confidence_score decreases towards horizon', () => {
    const forecast = buildForecast(20, 60, 5);
    expect(forecast[forecast.length - 1].confidence_score < forecast[0].confidence_score).toBe(true);
  });

  it('base_fee_gwei is always positive', () => {
    const forecast = buildForecast(1, 30, 5);
    for (const point of forecast) {
      expect(point.base_fee_gwei > 0).toBe(true);
    }
  });
});

describe('estimateWaitSeconds', () => {
  it('urgent wait < medium wait < low wait', () => {
    expect(estimateWaitSeconds('urgent') < estimateWaitSeconds('medium')).toBe(true);
    expect(estimateWaitSeconds('medium') < estimateWaitSeconds('low')).toBe(true);
  });
});

describe('analyseCongestion', () => {
  const BLOCK_GAS_LIMIT = 30_000_000n;

  it('returns low state when utilisation is low', () => {
    const result = analyseCongestion({
      gasUsed: 10_000_000n,
      gasLimit: BLOCK_GAS_LIMIT,
      pendingTxCount: 1_000,
      baseFeeWei: 10n * GWEI,
    });
    expect(result.congestion_state).toBe('low');
    expect(result.utilisation_percent).toBeCloseTo(33.33, 1);
  });

  it('returns high when utilisation >= 80%', () => {
    const result = analyseCongestion({
      gasUsed: 25_000_000n,
      gasLimit: BLOCK_GAS_LIMIT,
      pendingTxCount: 5_000,
      baseFeeWei: 50n * GWEI,
    });
    expect(['high', 'critical']).toContain(result.congestion_state);
  });

  it('returns critical with massive mempool', () => {
    const result = analyseCongestion({
      gasUsed: 28_000_000n,
      gasLimit: BLOCK_GAS_LIMIT,
      pendingTxCount: 100_000,
      baseFeeWei: 200n * GWEI,
    });
    expect(result.congestion_state).toBe('critical');
  });

  it('utilisation_percent is clamped to [0, 100]', () => {
    const result = analyseCongestion({
      gasUsed: 35_000_000n,
      gasLimit: BLOCK_GAS_LIMIT,
      pendingTxCount: 0,
      baseFeeWei: 10n * GWEI,
    });
    expect(result.utilisation_percent).toBeLessThanOrEqual(100);
    expect(result.utilisation_percent).toBeGreaterThanOrEqual(0);
  });

  it('confidence_score is between 0 and 1', () => {
    const result = analyseCongestion({
      gasUsed: 15_000_000n,
      gasLimit: BLOCK_GAS_LIMIT,
      pendingTxCount: 0,
      baseFeeWei: 20n * GWEI,
    });
    expect(result.confidence_score).toBeGreaterThanOrEqual(0);
    expect(result.confidence_score).toBeLessThanOrEqual(1);
  });
});
