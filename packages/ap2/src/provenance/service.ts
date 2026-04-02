import type { FreshnessResponse, LineageEdge, LineageNode, SlaTier, VerifyHashResponse } from "./contracts";
import { NotFoundError, BadRequestError } from "./errors";
import type { DatasetRecord } from "./catalog";
import { createDefaultDatasetCatalog } from "./catalog";

export const SLA_MAX_AGE_MS: Record<SlaTier, number> = {
  bronze: 72 * 3_600_000,
  silver: 24 * 3_600_000,
  gold: 6 * 3_600_000,
  platinum: 1 * 3_600_000,
};

export interface LineageCoreResult {
  datasetId: string;
  rootId: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export interface FreshnessCoreResult extends Omit<FreshnessResponse, "attestation"> {}

export interface VerifyHashCoreResult extends Omit<VerifyHashResponse, "attestation"> {}

export class ProvenanceService {
  private readonly datasets: Map<string, DatasetRecord>;
  private readonly now: () => Date;

  constructor(records: DatasetRecord[] = createDefaultDatasetCatalog(), now: () => Date = () => new Date()) {
    this.datasets = new Map(records.map((record) => [record.id, record]));
    this.now = now;
  }

  public getDataset(datasetId: string): DatasetRecord {
    const dataset = this.datasets.get(datasetId);
    if (!dataset) {
      throw new NotFoundError(`Dataset '${datasetId}' was not found`, { datasetId });
    }
    return dataset;
  }

  public getLineage(datasetId: string): LineageCoreResult {
    const nodes: LineageNode[] = [];
    const edges: LineageEdge[] = [];
    const visited = new Set<string>();

    const visit = (currentId: string): void => {
      if (visited.has(currentId)) return;
      visited.add(currentId);

      const dataset = this.getDataset(currentId);
      nodes.push({
        id: dataset.id,
        label: dataset.label,
        kind: "dataset",
        lastUpdatedAt: dataset.lastUpdatedAt,
      });

      for (const parentId of dataset.parents) {
        edges.push({
          from: dataset.id,
          to: parentId,
          relationship: "derived_from",
        });
        visit(parentId);
      }
    };

    visit(datasetId);

    const rootNode = nodes.find((node) => this.getDataset(node.id).parents.length === 0);
    return {
      datasetId,
      rootId: rootNode?.id ?? datasetId,
      nodes,
      edges,
    };
  }

  public getFreshness(datasetId: string, requestedTier?: SlaTier): FreshnessCoreResult {
    const dataset = this.getDataset(datasetId);
    const slaTier = requestedTier ?? dataset.slaTier;
    const maxAgeMs = SLA_MAX_AGE_MS[slaTier];

    const lastUpdatedAtMs = new Date(dataset.lastUpdatedAt).getTime();
    const ageMs = Math.max(0, this.now().getTime() - lastUpdatedAtMs);
    const nextBreachAt = new Date(lastUpdatedAtMs + maxAgeMs).toISOString();

    return {
      datasetId,
      slaTier,
      maxAgeMs,
      ageMs,
      isFresh: ageMs <= maxAgeMs,
      lastUpdatedAt: dataset.lastUpdatedAt,
      nextBreachAt,
    };
  }

  public verifyHash(datasetId: string, providedHash: string, algorithm: string = "sha256"): VerifyHashCoreResult {
    if (algorithm.toLowerCase() !== "sha256") {
      throw new BadRequestError("Only sha256 is supported", { algorithm });
    }

    const dataset = this.getDataset(datasetId);
    const canonicalHash = dataset.canonicalHash;
    const verified = canonicalHash.toLowerCase() === providedHash.toLowerCase();

    return {
      datasetId,
      algorithm: "sha256",
      providedHash,
      canonicalHash,
      verified,
      tamperState: verified ? "untampered" : "tampered",
    };
  }
}