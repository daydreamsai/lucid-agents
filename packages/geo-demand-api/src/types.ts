export type DemandKind = "zip" | "city";

export interface DemandPoint {
  at: string;
  demand: number;
}

export interface DemandSeries {
  key: string;
  kind: DemandKind;
  zip?: string;
  city?: string;
  state?: string;
  points: DemandPoint[];
  updatedAt: Date;
}

export interface DemandRepository {
  getSeriesByKey(key: string): Promise<DemandSeries | undefined>;
  getAllSeries(): Promise<DemandSeries[]>;
  getUpdatedAt(): Promise<Date>;
}

export interface LocationQuery {
  zip?: string;
  city?: string;
  state?: string;
}

export interface DemandLocation {
  kind: DemandKind;
  key: string;
  zip?: string;
  city?: string;
  state?: string;
}

export interface DemandIndexResult {
  location: DemandLocation;
  index: number;
  percentile: number;
  sampleSize: number;
  asOf: string;
}

export type TrendDirection = "up" | "flat" | "down";

export interface DemandTrendResult {
  location: DemandLocation;
  velocity: number;
  direction: TrendDirection;
  currentIndex: number;
  previousIndex: number;
  asOf: string;
}

export interface AnomalyFlags {
  spike: boolean;
  drop: boolean;
  volatility: boolean;
  seasonalityBreak: boolean;
}

export interface DemandAnomaliesResult {
  location: DemandLocation;
  flags: AnomalyFlags;
  score: number;
  details: string[];
  asOf: string;
}

export interface PaymentReceipt {
  transactionId: string;
  chargedUsd: number;
  buyerId: string | null;
}