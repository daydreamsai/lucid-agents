import { z } from 'zod';

export const ChainIdSchema = z.string().regex(/^eip155:\d+$/, {
  message: 'Chain ID must be in CAIP-2 format (e.g., eip155:1)',
});

export const TokenAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, {
  message: 'Token address must be a valid EVM address',
});

export const VenueSchema = z.enum([
  'uniswap_v3',
  'uniswap_v2',
  'sushiswap',
  'curve',
  'balancer',
  'pancakeswap',
]);

export const ConfidenceScoreSchema = z.number().min(0).max(1);

export const LiquiditySnapshotInputSchema = z.object({
  chain: ChainIdSchema,
  baseToken: TokenAddressSchema,
  quoteToken: TokenAddressSchema,
  venueFilter: z.array(VenueSchema).optional(),
  timestamp: z.number().int().positive().optional(),
});

export const DepthBucketSchema = z.object({
  notionalUsd: z.number().positive(),
  availableLiquidity: z.number().nonnegative(),
  priceImpactBps: z.number().nonnegative(),
});

export const PoolInfoSchema = z.object({
  venue: VenueSchema,
  poolAddress: TokenAddressSchema,
  fee: z.number().nonnegative(),
  tvlUsd: z.number().nonnegative(),
  volume24hUsd: z.number().nonnegative(),
  depthBuckets: z.array(DepthBucketSchema),
});

export const LiquiditySnapshotOutputSchema = z.object({
  chain: ChainIdSchema,
  baseToken: TokenAddressSchema,
  quoteToken: TokenAddressSchema,
  pools: z.array(PoolInfoSchema),
  freshnessMs: z.number().int().nonnegative(),
  confidenceScore: ConfidenceScoreSchema,
  timestamp: z.number().int().positive(),
});

export const SlippageInputSchema = z.object({
  chain: ChainIdSchema,
  baseToken: TokenAddressSchema,
  quoteToken: TokenAddressSchema,
  notionalUsd: z.number().positive(),
  venueFilter: z.array(VenueSchema).optional(),
});

export const SlippageCurvePointSchema = z.object({
  notionalUsd: z.number().positive(),
  slippageBps: z.number().nonnegative(),
});

export const SlippageOutputSchema = z.object({
  chain: ChainIdSchema,
  baseToken: TokenAddressSchema,
  quoteToken: TokenAddressSchema,
  notionalUsd: z.number().positive(),
  estimatedSlippageBps: z.number().nonnegative(),
  slippageBpsCurve: z.array(SlippageCurvePointSchema),
  bestVenue: VenueSchema,
  freshnessMs: z.number().int().nonnegative(),
  confidenceScore: ConfidenceScoreSchema,
  timestamp: z.number().int().positive(),
});

export const RouteInputSchema = z.object({
  chain: ChainIdSchema,
  baseToken: TokenAddressSchema,
  quoteToken: TokenAddressSchema,
  notionalUsd: z.number().positive(),
  venueFilter: z.array(VenueSchema).optional(),
  maxHops: z.number().int().min(1).max(4).optional().default(3),
});

export const RouteHopSchema = z.object({
  venue: VenueSchema,
  poolAddress: TokenAddressSchema,
  tokenIn: TokenAddressSchema,
  tokenOut: TokenAddressSchema,
  fee: z.number().nonnegative(),
  estimatedOutput: z.number().positive(),
});

export const RouteSchema = z.object({
  hops: z.array(RouteHopSchema).min(1),
  totalSlippageBps: z.number().nonnegative(),
  totalFeeBps: z.number().nonnegative(),
  estimatedOutput: z.number().positive(),
  gasEstimate: z.number().int().nonnegative(),
  score: z.number().min(0).max(100),
});

export const RouteOutputSchema = z.object({
  chain: ChainIdSchema,
  baseToken: TokenAddressSchema,
  quoteToken: TokenAddressSchema,
  notionalUsd: z.number().positive(),
  bestRoute: RouteSchema,
  alternativeRoutes: z.array(RouteSchema),
  freshnessMs: z.number().int().nonnegative(),
  confidenceScore: ConfidenceScoreSchema,
  timestamp: z.number().int().positive(),
});

export const ErrorCodeSchema = z.enum([
  'invalid_input',
  'unsupported_chain',
  'unsupported_token',
  'no_liquidity',
  'stale_data',
  'upstream_error',
  'payment_required',
  'internal_error',
]);

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
  timestamp: z.number().int().positive(),
});

export type ChainId = z.infer<typeof ChainIdSchema>;
export type TokenAddress = z.infer<typeof TokenAddressSchema>;
export type Venue = z.infer<typeof VenueSchema>;
export type ConfidenceScore = z.infer<typeof ConfidenceScoreSchema>;
export type LiquiditySnapshotInput = z.infer<typeof LiquiditySnapshotInputSchema>;
export type LiquiditySnapshotOutput = z.infer<typeof LiquiditySnapshotOutputSchema>;
export type DepthBucket = z.infer<typeof DepthBucketSchema>;
export type PoolInfo = z.infer<typeof PoolInfoSchema>;
export type SlippageInput = z.infer<typeof SlippageInputSchema>;
export type SlippageOutput = z.infer<typeof SlippageOutputSchema>;
export type SlippageCurvePoint = z.infer<typeof SlippageCurvePointSchema>;
export type RouteInput = z.infer<typeof RouteInputSchema>;
export type RouteOutput = z.infer<typeof RouteOutputSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type RouteHop = z.infer<typeof RouteHopSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
