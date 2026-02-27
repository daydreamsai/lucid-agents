import { z } from 'zod';

// Supported chains
export const ChainSchema = z.enum([
  'ethereum',
  'arbitrum',
  'optimism',
  'polygon',
  'base',
  'bsc',
]);

// Ethereum address validation
export const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

// Venue names
export const VenueSchema = z.enum([
  'uniswap-v2',
  'uniswap-v3',
  'sushiswap',
  'curve',
  'balancer',
  'pancakeswap',
]);

// Liquidity Snapshot Request
export const LiquiditySnapshotRequestSchema = z.object({
  chain: ChainSchema,
  baseToken: AddressSchema,
  quoteToken: AddressSchema,
  venueFilter: z.array(VenueSchema).optional(),
  timestamp: z.string().datetime().optional(),
});

export type LiquiditySnapshotRequest = z.infer<typeof LiquiditySnapshotRequestSchema>;

// Depth bucket
export const DepthBucketSchema = z.object({
  notionalUsd: z.number().positive(),
  liquidityUsd: z.number().nonnegative(),
});

// Pool info
export const PoolInfoSchema = z.object({
  venue: VenueSchema,
  address: AddressSchema,
  baseToken: AddressSchema,
  quoteToken: AddressSchema,
  tvlUsd: z.number().nonnegative(),
  depthBuckets: z.array(DepthBucketSchema),
});

// Liquidity Snapshot Response
export const LiquiditySnapshotResponseSchema = z.object({
  pools: z.array(PoolInfoSchema),
  freshness_ms: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});

export type LiquiditySnapshotResponse = z.infer<typeof LiquiditySnapshotResponseSchema>;

// Slippage Request
export const SlippageRequestSchema = z.object({
  chain: ChainSchema,
  baseToken: AddressSchema,
  quoteToken: AddressSchema,
  notionalUsd: z.number().positive(),
  venueFilter: z.array(VenueSchema).optional(),
});

export type SlippageRequest = z.infer<typeof SlippageRequestSchema>;

// Slippage curve point
export const SlippagePointSchema = z.object({
  notionalUsd: z.number().positive(),
  slippageBps: z.number().nonnegative(),
});

// Slippage Response
export const SlippageResponseSchema = z.object({
  slippage_bps_curve: z.array(SlippagePointSchema),
  confidence_score: z.number().min(0).max(1),
  freshness_ms: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});

export type SlippageResponse = z.infer<typeof SlippageResponseSchema>;

// Routes Request
export const RoutesRequestSchema = z.object({
  chain: ChainSchema,
  baseToken: AddressSchema,
  quoteToken: AddressSchema,
  notionalUsd: z.number().positive(),
  venueFilter: z.array(VenueSchema).optional(),
});

export type RoutesRequest = z.infer<typeof RoutesRequestSchema>;

// Route info
export const RouteInfoSchema = z.object({
  path: z.array(VenueSchema).nonempty(),
  estimatedSlippageBps: z.number().nonnegative(),
  estimatedGasUsd: z.number().nonnegative(),
  totalCostBps: z.number().nonnegative(),
  confidence_score: z.number().min(0).max(1),
});

// Routes Response
export const RoutesResponseSchema = z.object({
  best_route: RouteInfoSchema,
  alternatives: z.array(RouteInfoSchema),
  freshness_ms: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});

export type RoutesResponse = z.infer<typeof RoutesResponseSchema>;
