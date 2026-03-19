import { describe, test, expect } from 'bun:test';
import { QuoteRequestSchema, QuoteResponseSchema } from '../../src/schemas/quote';
import { ForecastRequestSchema, ForecastResponseSchema } from '../../src/schemas/forecast';
import { CongestionRequestSchema, CongestionResponseSchema } from '../../src/schemas/congestion';
import { FreshnessMetadataSchema, ConfidenceSchema } from '../../src/schemas/common';
import { ErrorResponseSchema } from '../../src/schemas/error';

describe('QuoteRequestSchema', () => {
  test('1.1 accepts valid input with snake_case fields', () => {
    const result = QuoteRequestSchema.safeParse({
      chain: 'ethereum',
      urgency: 'high',
      tx_type: 'swap',
      recent_failure_tolerance: 0.03,
    });
    expect(result.success).toBe(true);
  });

  test('1.2 rejects missing chain', () => {
    const result = QuoteRequestSchema.safeParse({ urgency: 'low' });
    expect(result.success).toBe(false);
  });

  test('1.3 applies defaults (urgency=medium, tx_type=transfer)', () => {
    const result = QuoteRequestSchema.parse({ chain: 'base' });
    expect(result.urgency).toBe('medium');
    expect(result.tx_type).toBe('transfer');
    expect(result.recent_failure_tolerance).toBe(0.05);
  });
});

describe('QuoteResponseSchema', () => {
  const validResponse = {
    recommended_max_fee: '60000000000',
    priority_fee: '3000000000',
    estimated_cost_usd: 2.85,
    urgency: 'high',
    chain: 'ethereum',
    freshness: {
      fetched_at: '2026-02-28T00:00:00.000Z',
      block_number: 19500000,
      block_age_ms: 3200,
      stale: false,
      data_source: 'cached',
    },
    confidence: { score: 0.87, factors: ['sample_size:high'] },
  };

  test('1.4 validates complete response shape', () => {
    expect(QuoteResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  test('1.5 rejects missing freshness', () => {
    const { freshness, ...without } = validResponse;
    expect(QuoteResponseSchema.safeParse(without).success).toBe(false);
  });
});

describe('ForecastRequestSchema', () => {
  test('1.6 accepts valid input with target_blocks', () => {
    const result = ForecastRequestSchema.safeParse({ chain: 'base', target_blocks: 5 });
    expect(result.success).toBe(true);
  });

  test('1.7 rejects target_blocks > 200', () => {
    const result = ForecastRequestSchema.safeParse({ chain: 'base', target_blocks: 201 });
    expect(result.success).toBe(false);
  });
});

describe('ForecastResponseSchema', () => {
  test('1.8 validates inclusion_probability_curve non-empty', () => {
    const result = ForecastResponseSchema.safeParse({
      chain: 'base',
      inclusion_probability_curve: [],
      forecast_horizon_blocks: 5,
      trend: 'stable',
      freshness: {
        fetched_at: '2026-02-28T00:00:00.000Z',
        block_number: 25000000,
        block_age_ms: 800,
        stale: false,
        data_source: 'live',
      },
      confidence: { score: 0.92, factors: [] },
    });
    expect(result.success).toBe(false); // min(1) requires at least 1 element
  });
});

describe('CongestionRequestSchema', () => {
  test('1.9 accepts valid input', () => {
    expect(CongestionRequestSchema.safeParse({ chain: 'polygon' }).success).toBe(true);
  });
});

describe('CongestionResponseSchema', () => {
  test('1.10 validates all fields including mempool_visibility', () => {
    const result = CongestionResponseSchema.safeParse({
      chain: 'ethereum',
      congestion_state: 'moderate',
      gas_utilization_pct: 62.5,
      pending_tx_count: 18500,
      base_fee: '30000000000',
      base_fee_trend: 'stable',
      recommended_action: 'proceed',
      mempool_visibility: 'partial',
      freshness: {
        fetched_at: '2026-02-28T00:00:00.000Z',
        block_number: 19500000,
        block_age_ms: 5000,
        stale: false,
        data_source: 'cached',
      },
      confidence: { score: 0.85, factors: [] },
    });
    expect(result.success).toBe(true);
  });
});

describe('FreshnessMetadataSchema', () => {
  test('1.11 rejects non-ISO datetime', () => {
    const result = FreshnessMetadataSchema.safeParse({
      fetched_at: 'not-a-date',
      block_number: 1,
      block_age_ms: 0,
      stale: false,
      data_source: 'live',
    });
    expect(result.success).toBe(false);
  });
});

describe('ConfidenceSchema', () => {
  test('1.12 rejects score > 1', () => {
    expect(ConfidenceSchema.safeParse({ score: 1.5, factors: [] }).success).toBe(false);
  });
});

describe('ErrorResponseSchema', () => {
  test('1.13 accepts valid error response', () => {
    const result = ErrorResponseSchema.safeParse({
      code: 400,
      message: 'Bad request',
      request_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  test('1.14 rejects missing request_id', () => {
    const result = ErrorResponseSchema.safeParse({
      code: 400,
      message: 'Bad request',
    });
    expect(result.success).toBe(false);
  });

  test('1.15 rejects non-uuid request_id', () => {
    const result = ErrorResponseSchema.safeParse({
      code: 400,
      message: 'Bad request',
      request_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});
