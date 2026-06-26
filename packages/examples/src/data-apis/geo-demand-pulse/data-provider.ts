/**
 * Geo Demand Pulse Index - Data Provider
 */
import type { GeoType, LookbackWindow } from './schemas';
import type { RawDataPoint } from './transforms';

export interface DataProvider {
  getDemandData(params: {
    geoType: GeoType;
    geoCode: string;
    category?: string;
    lookbackWindow: LookbackWindow;
  }): Promise<RawDataPoint[]>;

  getComparableGeos(params: {
    geoType: GeoType;
    geoCode: string;
    category?: string;
  }): Promise<Array<{ geoCode: string; demandIndex: number }>>;

  getDataTimestamp(): Date;
}

export class MockDataProvider implements DataProvider {
  private dataTimestamp: Date;

  constructor(dataTimestamp?: Date) {
    this.dataTimestamp = dataTimestamp || new Date();
  }

  async getDemandData(params: {
    geoType: GeoType;
    geoCode: string;
    category?: string;
    lookbackWindow: LookbackWindow;
  }): Promise<RawDataPoint[]> {
    const { geoCode, category, lookbackWindow } = params;
    const seed = this.hashCode(geoCode + (category || ''));
    const days = this.lookbackToDays(lookbackWindow);
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    const dataPoints: RawDataPoint[] = [];
    const baseValue = 80 + (seed % 40);

    for (let i = days; i >= 0; i--) {
      const timestamp = now - i * msPerDay;
      const dayOfWeek = new Date(timestamp).getDay();
      const monthOfYear = new Date(timestamp).getMonth();
      const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.85 : 1.0;
      const seasonalFactor = this.getSeasonalMultiplier(monthOfYear);
      const trendFactor = 1 + ((days - i) / days) * 0.1 * ((seed % 3) - 1);
      const noise = (this.seededRandom(seed + i) - 0.5) * 20;
      const value = baseValue * weekendFactor * seasonalFactor * trendFactor + noise;
      dataPoints.push({ timestamp, value: Math.max(0, Math.round(value * 100) / 100) });
    }

    return dataPoints;
  }

  async getComparableGeos(params: {
    geoType: GeoType;
    geoCode: string;
    category?: string;
  }): Promise<Array<{ geoCode: string; demandIndex: number }>> {
    const { geoType, geoCode } = params;
    const seed = this.hashCode(geoCode);
    const comparables: Array<{ geoCode: string; demandIndex: number }> = [];
    const prefixes: Record<GeoType, string> = {
      zip: '9', city: 'CITY-', county: 'COUNTY-', state: 'ST-', metro: 'MSA-',
    };

    for (let i = 0; i < 5; i++) {
      const compSeed = seed + i + 1;
      const compCode = `${prefixes[geoType]}${(compSeed % 10000).toString().padStart(4, '0')}`;
      const baseDemand = 80 + (compSeed % 40);
      const variation = (this.seededRandom(compSeed) - 0.5) * 30;
      comparables.push({ geoCode: compCode, demandIndex: Math.round((baseDemand + variation) * 100) / 100 });
    }

    return comparables;
  }

  getDataTimestamp(): Date {
    return this.dataTimestamp;
  }

  private lookbackToDays(window: LookbackWindow): number {
    switch (window) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      case '365d': return 365;
    }
  }

  private getSeasonalMultiplier(month: number): number {
    const factors = [0.85, 0.90, 0.95, 1.0, 1.0, 0.95, 0.90, 0.95, 1.0, 1.05, 1.15, 1.30];
    return factors[month] || 1.0;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
}

let defaultProvider: DataProvider | null = null;

export function getDataProvider(): DataProvider {
  if (!defaultProvider) {
    defaultProvider = new MockDataProvider();
  }
  return defaultProvider;
}

export function setDataProvider(provider: DataProvider): void {
  defaultProvider = provider;
}
