import { DemandRepository, DemandSeries } from "../types";

export class InMemoryDemandRepository implements DemandRepository {
  private readonly byKey: Map<string, DemandSeries>;

  public constructor(series: DemandSeries[]) {
    this.byKey = new Map(series.map((item) => [item.key, item]));
  }

  public async getSeriesByKey(key: string): Promise<DemandSeries | undefined> {
    return this.byKey.get(key);
  }

  public async getAllSeries(): Promise<DemandSeries[]> {
    return [...this.byKey.values()];
  }

  public async getUpdatedAt(): Promise<Date> {
    const all = [...this.byKey.values()];
    if (all.length === 0) {
      return new Date(0);
    }

    let latest = all[0].updatedAt.getTime();
    for (const series of all) {
      const ts = series.updatedAt.getTime();
      if (ts > latest) {
        latest = ts;
      }
    }

    return new Date(latest);
  }
}