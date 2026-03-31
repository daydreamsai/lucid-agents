export type TradeSide = "buy" | "sell";

export interface PriceLevel {
  price: number;
  quantity: number;
}

export interface VenueOrderBook {
  venueId: string;
  chainId: number;
  baseToken: string;
  quoteToken: string;
  updatedAt: number;
  midPrice: number;
  feeBps: number;
  gasUsd: number;
  latencyMs: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
}

export interface PairMarket {
  chainId: number;
  baseToken: string;
  quoteToken: string;
  asOf: number;
  venues: VenueOrderBook[];
}

export interface SnapshotQuery {
  chainId: number;
  baseToken: string;
  quoteToken: string;
  maxAgeSec?: number;
}

export interface SlippageQuery extends SnapshotQuery {
  side: TradeSide;
  sizesUsd: number[];
}

export interface RoutesQuery extends SnapshotQuery {
  side: TradeSide;
  sizeUsd: number;
  maxRoutes?: number;
}

export interface DepthBucket {
  bps: number;
  buyUsd: number;
  sellUsd: number;
  totalUsd: number;
}

export interface SnapshotVenueView {
  venueId: string;
  updatedAt: number;
  midPrice: number;
  spreadBps: number;
  feeBps: number;
  gasUsd: number;
  latencyMs: number;
  depthUsdByBps: DepthBucket[];
}

export interface LiquiditySnapshotResponse {
  pair: {
    chainId: number;
    baseToken: string;
    quoteToken: string;
  };
  asOf: number;
  freshnessSec: number;
  bucketsBps: number[];
  venues: SnapshotVenueView[];
  aggregateDepthUsdByBps: DepthBucket[];
}

export interface SlippagePoint {
  sizeUsd: number;
  expectedOut: number;
  avgExecutionPrice: number;
  slippageBps: number;
  fillRate: number;
}

export interface LiquiditySlippageResponse {
  pair: {
    chainId: number;
    baseToken: string;
    quoteToken: string;
  };
  side: TradeSide;
  asOf: number;
  freshnessSec: number;
  sizesUsd: number[];
  venues: Array<{
    venueId: string;
    points: SlippagePoint[];
  }>;
  blended: {
    venueId: string;
    points: SlippagePoint[];
  };
}

export interface RouteAllocation {
  venueId: string;
  weight: number;
}

export interface RouteCandidate {
  rank: number;
  routeId: string;
  allocations: RouteAllocation[];
  expectedOut: number;
  slippageBps: number;
  gasUsd: number;
  fillRate: number;
  latencyMs: number;
  qualityScore: number;
}

export interface LiquidityRoutesResponse {
  pair: {
    chainId: number;
    baseToken: string;
    quoteToken: string;
  };
  side: TradeSide;
  sizeUsd: number;
  asOf: number;
  freshnessSec: number;
  routes: RouteCandidate[];
}