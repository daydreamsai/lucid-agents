import type { ChainFeeSnapshot } from "./types.js";

export interface GasSnapshotSource {
  get(chain: string): Promise<ChainFeeSnapshot | null>;
}

export class InMemoryGasSnapshotSource implements GasSnapshotSource {
  private readonly snapshots = new Map<string, ChainFeeSnapshot>();

  set(snapshot: ChainFeeSnapshot): void {
    this.snapshots.set(snapshot.chain.toLowerCase(), snapshot);
  }

  async get(chain: string): Promise<ChainFeeSnapshot | null> {
    return this.snapshots.get(chain.toLowerCase()) ?? null;
  }
}