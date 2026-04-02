import type { SlaTier } from "./contracts";
import { sha256Hex, stableStringify } from "./crypto";

export interface DatasetRecord {
  id: string;
  label: string;
  parents: string[];
  slaTier: SlaTier;
  lastUpdatedAt: string;
  payload: Record<string, unknown>;
  canonicalHash: string;
}

function withCanonicalHash(dataset: Omit<DatasetRecord, "canonicalHash">): DatasetRecord {
  return {
    ...dataset,
    canonicalHash: sha256Hex(stableStringify(dataset.payload)),
  };
}

function minusMinutes(base: Date, minutes: number): string {
  return new Date(base.getTime() - minutes * 60_000).toISOString();
}

function minusHours(base: Date, hours: number): string {
  return new Date(base.getTime() - hours * 3_600_000).toISOString();
}

export function createDefaultDatasetCatalog(referenceNow: Date = new Date()): DatasetRecord[] {
  return [
    withCanonicalHash({
      id: "raw-orders",
      label: "Raw Orders",
      parents: [],
      slaTier: "gold",
      lastUpdatedAt: minusMinutes(referenceNow, 90),
      payload: {
        source: "orders_ingest",
        partitionDate: "2026-03-01",
        rows: 125020,
      },
    }),
    withCanonicalHash({
      id: "orders-normalized",
      label: "Orders Normalized",
      parents: ["raw-orders"],
      slaTier: "gold",
      lastUpdatedAt: minusMinutes(referenceNow, 50),
      payload: {
        transform: "normalize_v4",
        rows: 124981,
        schemaVersion: 8,
      },
    }),
    withCanonicalHash({
      id: "orders-features",
      label: "Orders Feature Matrix",
      parents: ["orders-normalized"],
      slaTier: "platinum",
      lastUpdatedAt: minusMinutes(referenceNow, 20),
      payload: {
        featureSet: "buyer-intent",
        rows: 124981,
        windowHours: 24,
      },
    }),
    withCanonicalHash({
      id: "orders-archive",
      label: "Orders Archive",
      parents: ["raw-orders"],
      slaTier: "silver",
      lastUpdatedAt: minusHours(referenceNow, 120),
      payload: {
        archivePolicy: "cold-storage-rolling",
        compressedGb: 312,
      },
    }),
    withCanonicalHash({
      id: "tamper-demo",
      label: "Tamper Demo Dataset",
      parents: ["orders-normalized"],
      slaTier: "bronze",
      lastUpdatedAt: minusMinutes(referenceNow, 5),
      payload: {
        snapshot: "2026-03-02T12:00:00.000Z",
        records: 9987,
        checksumStrategy: "canonical-json-sha256",
      },
    }),
  ];
}