/*
 * NASA NeoWs asteroid risk agent.
 *
 * Queries NASA's Near Earth Object Web Service (NeoWs) feed for the next 7 days,
 * computes a threat score based on object size, velocity, and miss distance,
 * ranks objects by score, and returns a risk assessment summary.
 *
 * Run with:
 *   bun run packages/examples/src/core/nasa-neows-agent.ts
 *
 * Environment variables:
 *   NASA_API_KEY  - NASA API key (defaults to DEMO_KEY)
 *   PORT          - HTTP port (defaults to 8788)
 */

import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { z } from 'zod';

import { getNeoRiskReport } from './nasa-neows-risk';

const agent = await createAgent({
  name: 'nasa-neo-risk-agent',
  version: '1.0.0',
  description:
    'Assesses near-earth asteroid risk over the next 7 days using NASA NeoWs.',
})
  .use(http())
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

addEntrypoint({
  key: 'asteroid-risk',
  description:
    'Fetch next-7-day NEO data from NASA, score threats, rank results, and return risk assessment.',
  input: z.object({
    topN: z.number().int().min(1).max(50).optional().default(10),
  }),
  output: z.object({
    windowStart: z.string(),
    windowEnd: z.string(),
    generatedAt: z.string(),
    objectCount: z.number(),
    topThreats: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        nasaJplUrl: z.string(),
        isPotentiallyHazardous: z.boolean(),
        approachDate: z.string(),
        estimatedDiameterMeters: z.number(),
        relativeVelocityKph: z.number(),
        missDistanceKm: z.number(),
        threatScore: z.number(),
      })
    ),
    assessment: z.object({
      level: z.enum(['low', 'guarded', 'elevated', 'high']),
      summary: z.string(),
      highestThreatScore: z.number(),
      highThreatCount: z.number(),
      trackedCount: z.number(),
    }),
  }),
  async handler({ input }) {
    const apiKey = process.env.NASA_API_KEY ?? 'DEMO_KEY';
    const report = await getNeoRiskReport({
      apiKey,
      topN: input.topN,
    });

    return {
      output: report,
      usage: { total_tokens: report.objectCount },
    };
  },
});

const port = Number(process.env.PORT ?? 8788);
const origin = `http://localhost:${port}`;

if (typeof Bun !== 'undefined') {
  Bun.serve({
    port,
    fetch: app.fetch,
  });
  console.log(`[examples] NASA Neo risk agent running at ${origin}`);
  console.log(
    `[examples] Try: curl -X POST ${origin}/entrypoints/asteroid-risk/invoke -H "content-type: application/json" -d '{"input":{"topN":5}}'`
  );
}
