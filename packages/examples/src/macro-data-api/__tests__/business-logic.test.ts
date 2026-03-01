import { describe, expect, it } from 'bun:test';
import {
  calculateAssumptionCoverage,
  normalizeMacroInput,
  buildImpactVector,
  scoreScenario,
} from '../domain';

describe('macro domain business logic', () => {
  it('normalizes event aliases and casing deterministically', () => {
    const normalized = normalizeMacroInput({
      eventTypes: ['Fed Rate', 'cpi', ' PMI '],
      geography: 'us',
      sectorSet: [' Equities ', 'Energy'],
      horizon: '3M',
    });

    expect(normalized.eventTypes).toEqual(['FED_RATE', 'CPI', 'PMI']);
    expect(normalized.geography).toBe('US');
    expect(normalized.sectorSet).toEqual(['EQUITIES', 'ENERGY']);
    expect(normalized.horizon).toBe('3m');
  });

  it('builds stable vectors for identical input', () => {
    const input = normalizeMacroInput({
      eventTypes: ['CPI', 'FED_RATE'],
      geography: 'US',
      sectorSet: ['EQUITIES', 'BONDS'],
      horizon: '3m',
    });

    const first = buildImpactVector(input);
    const second = buildImpactVector(input);

    expect(first).toEqual(second);
  });

  it('scenario score penalizes inflation shock for equities risk score', () => {
    const base = normalizeMacroInput({
      eventTypes: ['CPI', 'FED_RATE'],
      geography: 'US',
      sectorSet: ['EQUITIES'],
      horizon: '3m',
    });

    const mild = scoreScenario(base, {
      inflationShock: 0.2,
      oilShock: 0.1,
      policySurprise: 0.1,
    });

    const severe = scoreScenario(base, {
      inflationShock: 0.9,
      oilShock: 0.1,
      policySurprise: 0.1,
    });

    expect(severe.total).toBeLessThan(mild.total);
  });

  it('calculates assumption coverage from explicitly provided fields only', () => {
    expect(
      calculateAssumptionCoverage({
        inflationShock: 0.7,
      })
    ).toBe(0.25);

    expect(
      calculateAssumptionCoverage({
        inflationShock: 0.7,
        oilShock: 0.2,
        policySurprise: 0.1,
        demandShock: 0.3,
      })
    ).toBe(1);
  });
});
