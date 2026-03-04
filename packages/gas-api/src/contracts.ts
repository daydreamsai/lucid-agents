import { z } from "zod";
import { LATENCY_TARGETS } from "./types.js";

export const latencyTargetSchema = z.enum(LATENCY_TARGETS);

export const quoteQuerySchema = z.object({
  chain: z.string().min(1),
  latency: latencyTargetSchema.optional().default("standard")
});

export const forecastQuerySchema = z.object({
  chain: z.string().min(1),
  horizons: z.string().optional(),
  targets: z.string().optional()
});

export const congestionQuerySchema = z.object({
  chain: z.string().min(1)
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string()
  })
});

export const gasQuoteResponseSchema = z.object({
  chain: z.string(),
  latencyTarget: latencyTargetSchema,
  asOf: z.number().int(),
  blockNumber: z.number().int(),
  baseFeePerGasGwei: z.number().nonnegative(),
  maxPriorityFeePerGasGwei: z.number().nonnegative(),
  maxFeePerGasGwei: z.number().nonnegative(),
  inclusionProbability: z.number().min(0).max(1),
  expectedInclusionSeconds: z.number().nonnegative()
});

export const gasForecastItemSchema = z.object({
  chain: z.string(),
  blocksAhead: z.number().int().positive(),
  latencyTarget: latencyTargetSchema,
  baseFeePerGasGwei: z.number().nonnegative(),
  maxPriorityFeePerGasGwei: z.number().nonnegative(),
  maxFeePerGasGwei: z.number().nonnegative(),
  inclusionProbability: z.number().min(0).max(1),
  expectedInclusionSeconds: z.number().nonnegative()
});

export const gasForecastResponseSchema = z.object({
  chain: z.string(),
  asOf: z.number().int(),
  blockNumber: z.number().int(),
  items: z.array(gasForecastItemSchema).min(1)
});

export const gasCongestionResponseSchema = z.object({
  chain: z.string(),
  asOf: z.number().int(),
  blockNumber: z.number().int(),
  score: z.number().int().min(0).max(100),
  level: z.enum(["low", "moderate", "high", "extreme"]),
  pendingTx: z.number().int().nonnegative(),
  gasUsedRatio: z.number().nonnegative(),
  baseFeeTrend: z.number()
});