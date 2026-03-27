import { describe, it, expect } from 'bun:test';
import {
  GasQuoteQuerySchema,
  GasForecastQuerySchema,
  CongestionQuerySchema,
  GasQuoteResponseSchema,
  GasForecastResponseSchema,
  CongestionResponseSchema,
  UrgencyEnum,
  CongestionStateEnum,
} from '../../src/schemas/index.js';

describe('GasQuoteQuerySchema', () => {
  it('accepts a minimal valid query', () => {
    const result = GasQuoteQuerySchema.safeParse({ chain: 'ethereum' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.urgency).toBe('medium');
    }
  });

  it('accepts all urgency levels', () => {
    for (const urgency of ['low', 'medium', 'high', 'urgent'] as const) {
      const result = GasQuoteQuerySchema.safeParse({ chain: 'ethereum', urgency });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown urgency', () => {
    const result = GasQuoteQuerySchema.safeParse({ chain: 'ethereum', urgency: 'turbo' });
    expect(result.success).toBe(false);
  });

  it('rejects missing chain', () => {
    const result = GasQuoteQuerySchema.safeParse({ urgency: 'low' });
    expect(result.success).toBe(false);
  });

  it('accepts optional targetBlocks and txType', () => {
    const result = GasQuoteQuerySchema.safeParse({
      chain: 'ethereum',
      urgency: 'high',
      targetBlocks: '5',
      txType: 'eip1559',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetBlocks).toBe(5);
      expect(result.data.txType).toBe('eip1559');
    }
  });
});

describe('GasForecastQuerySchema', () => {
  it('accepts a minimal valid query with defaults', () => {
    const result = GasForecastQuerySchema.safeParse({ chain: 'polygon' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.horizonMinutes).toBe(60);
      expect(result.data.granularity).toBe(5);
    }
  });

  it('rejects horizonMinutes > 1440', () => {
    const result = GasForecastQuerySchema.safeParse({ chain: 'ethereum', horizonMinutes: 1500 });
    expect(result.success).toBe(false);
  });
});

describe('CongestionQuerySchema', () => {
  it('accepts a valid chain', () => {
    const result = CongestionQuerySchema.safeParse({ chain: 'base' });
    expect(result.success).toBe(true);
  });

  it('rejects empty chain', () => {
    const result = CongestionQuerySchema.safeParse({ chain: '' });
    expect(result.success).toBe(false);
  });
});

describe('GasQuoteResponseSchema', () => {
  it('validates a well-formed response', () => {
    const response = {
      chain: 'ethereum',
      urgency: 'medium',
      recommended_max_fee: '30000000000',
      priority_fee: '1500000000',
      base_fee: '25000000000',
      inclusion_probability_curve: [
        { blocks: 1, probability: 0.55 },
        { blocks: 3, probability: 0.85 },
      ],
      confidence_score: 0.92,
      freshness_ms: 120,
    };
    const result = GasQuoteResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('rejects confidence_score outside [0,1]', () => {
    const result = GasQuoteResponseSchema.safeParse({
      chain: 'ethereum',
      urgency: 'low',
      recommended_max_fee: '1',
      priority_fee: '1',
      base_fee: '1',
      inclusion_probability_curve: [],
      confidence_score: 1.5,
      freshness_ms: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('UrgencyEnum', () => {
  it('has exactly four values', () => {
    expect(UrgencyEnum.options).toEqual(['low', 'medium', 'high', 'urgent']);
  });
});

describe('CongestionStateEnum', () => {
  it('has exactly four values', () => {
    expect(CongestionStateEnum.options).toEqual(['low', 'moderate', 'high', 'critical']);
  });
});
