import { describe, expect, it } from 'bun:test';
import { createMacroApiApp } from '../api';

describe('latency budget', () => {
  it('keeps cached path p95 <= 500ms under test workload', async () => {
    const { app } = await createMacroApiApp({
      paywall: { enabled: false },
      now: () => new Date('2026-02-15T12:00:00.000Z'),
    });

    const url =
      'http://agent/v1/macro/impact-vectors?eventTypes=cpi,fed_rate&geography=US&sectorSet=equities,bonds&horizon=3m';

    // Warm cache
    await app.request(url);

    const durations: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const start = performance.now();
      const res = await app.request(url);
      if (res.status !== 200) {
        throw new Error(`unexpected status ${res.status}`);
      }
      await res.json();
      durations.push(performance.now() - start);
    }

    durations.sort((a, b) => a - b);
    const p95Index = Math.ceil(durations.length * 0.95) - 1;
    const p95 = durations[p95Index];

    expect(p95).toBeLessThanOrEqual(500);
  });
});
