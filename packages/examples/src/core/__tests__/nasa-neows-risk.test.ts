import { describe, expect, it, mock } from 'bun:test';

import {
  buildRiskAssessment,
  calculateThreatScore,
  createNeoRiskReport,
  extractThreatsFromFeed,
  getNeoRiskReport,
  rankThreats,
} from '../nasa-neows-risk';

describe('calculateThreatScore', () => {
  it('increases when size/velocity/proximity increase', () => {
    const low = calculateThreatScore({
      estimatedDiameterMeters: 75,
      relativeVelocityKph: 12000,
      missDistanceKm: 12000000,
      isPotentiallyHazardous: false,
    });

    const high = calculateThreatScore({
      estimatedDiameterMeters: 980,
      relativeVelocityKph: 92000,
      missDistanceKm: 90000,
      isPotentiallyHazardous: true,
    });

    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(100);
    expect(low).toBeGreaterThanOrEqual(0);
  });
});

describe('extractThreatsFromFeed / rankThreats', () => {
  const feed = {
    near_earth_objects: {
      '2026-03-05': [
        {
          id: 'A',
          name: 'Asteroid A',
          nasa_jpl_url: 'https://example.com/a',
          is_potentially_hazardous_asteroid: false,
          estimated_diameter: {
            meters: { estimated_diameter_max: 140 },
          },
          close_approach_data: [
            {
              close_approach_date: '2026-03-05',
              relative_velocity: { kilometers_per_hour: '22000' },
              miss_distance: { kilometers: '2800000' },
            },
          ],
        },
      ],
      '2026-03-06': [
        {
          id: 'B',
          name: 'Asteroid B',
          nasa_jpl_url: 'https://example.com/b',
          is_potentially_hazardous_asteroid: true,
          estimated_diameter: {
            meters: { estimated_diameter_max: 600 },
          },
          close_approach_data: [
            {
              close_approach_date: '2026-03-06',
              relative_velocity: { kilometers_per_hour: '68000' },
              miss_distance: { kilometers: '350000' },
            },
          ],
        },
      ],
      '2026-03-07': [
        {
          id: 'C',
          name: 'Asteroid C',
          nasa_jpl_url: 'https://example.com/c',
          is_potentially_hazardous_asteroid: false,
          estimated_diameter: {
            meters: { estimated_diameter_max: 420 },
          },
          close_approach_data: [
            {
              close_approach_date: '2026-03-07',
              relative_velocity: { kilometers_per_hour: '41000' },
              miss_distance: { kilometers: '900000' },
            },
          ],
        },
      ],
    },
  };

  it('extracts and ranks asteroid threats by descending threat score', () => {
    const threats = extractThreatsFromFeed(feed);
    expect(threats).toHaveLength(3);

    const ranked = rankThreats(threats, 3);
    expect(ranked[0]?.id).toBe('B');
    expect(ranked[0]?.threatScore).toBeGreaterThan(ranked[1]?.threatScore ?? 0);
  });

  it('creates a risk report with capped topN', () => {
    const threats = extractThreatsFromFeed(feed);
    const report = createNeoRiskReport({
      windowStart: '2026-03-05',
      windowEnd: '2026-03-11',
      threats,
      topN: 2,
    });

    expect(report.windowStart).toBe('2026-03-05');
    expect(report.windowEnd).toBe('2026-03-11');
    expect(report.objectCount).toBe(3);
    expect(report.topThreats).toHaveLength(2);
  });
});

describe('buildRiskAssessment', () => {
  it('returns low risk for empty result sets', () => {
    const assessment = buildRiskAssessment([]);
    expect(assessment.level).toBe('low');
    expect(assessment.trackedCount).toBe(0);
  });

  it('returns high risk when highest score exceeds high threshold', () => {
    const assessment = buildRiskAssessment([
      {
        id: 'X',
        name: 'X',
        nasaJplUrl: '',
        isPotentiallyHazardous: true,
        approachDate: '2026-03-05',
        estimatedDiameterMeters: 900,
        relativeVelocityKph: 80000,
        missDistanceKm: 120000,
        threatScore: 78,
      },
    ]);
    expect(assessment.level).toBe('high');
  });
});

describe('getNeoRiskReport', () => {
  it('queries next 7-day window and returns ranked report', async () => {
    const fetchMock = mock(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      expect(parsed.origin + parsed.pathname).toBe(
        'https://api.nasa.gov/neo/rest/v1/feed'
      );
      expect(parsed.searchParams.get('start_date')).toBe('2026-03-05');
      expect(parsed.searchParams.get('end_date')).toBe('2026-03-11');
      expect(parsed.searchParams.get('api_key')).toBe('TEST_KEY');

      return new Response(
        JSON.stringify({
          near_earth_objects: {
            '2026-03-05': [
              {
                id: 'N1',
                name: 'Neo 1',
                nasa_jpl_url: 'https://example.com/n1',
                is_potentially_hazardous_asteroid: true,
                estimated_diameter: {
                  meters: { estimated_diameter_max: 510 },
                },
                close_approach_data: [
                  {
                    close_approach_date: '2026-03-05',
                    relative_velocity: { kilometers_per_hour: '57000' },
                    miss_distance: { kilometers: '500000' },
                  },
                ],
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    });

    const report = await getNeoRiskReport({
      apiKey: 'TEST_KEY',
      topN: 5,
      now: new Date('2026-03-05T12:00:00Z'),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(report.windowStart).toBe('2026-03-05');
    expect(report.windowEnd).toBe('2026-03-11');
    expect(report.objectCount).toBe(1);
    expect(report.topThreats[0]?.id).toBe('N1');
  });
});
