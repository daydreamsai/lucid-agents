import type { AgentMeta, EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import { renderLandingPage } from '../landing-page';

const meta: AgentMeta = {
  name: 'Coverage <Agent>',
  version: '1.2.3',
  description: 'Exercises the generated landing page',
  image: 'https://example.com/agent.png',
  url: 'https://docs.example.com',
  type: 'article',
};

const payments = {
  facilitatorUrl: 'https://facilitator.example.com',
  network: 'eip155:84532',
  payTo: '0x0000000000000000000000000000000000000001',
} satisfies PaymentsConfig;

const render = async (
  entrypoints: EntrypointDef[],
  options: {
    activePayments?: PaymentsConfig;
    resolvePrice?: (
      entrypoint: EntrypointDef,
      which: 'invoke' | 'stream'
    ) => string | null;
    pageMeta?: AgentMeta;
  } = {}
): Promise<string> =>
  String(
    await renderLandingPage({
      meta: options.pageMeta ?? meta,
      origin: 'https://agent.example.com',
      entrypoints,
      activePayments: options.activePayments,
      resolvePrice: options.resolvePrice,
      manifestPath: '/api/agent/.well-known/agent-card.json',
      faviconDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      x402ClientExample: 'const response = await fetch(url);',
    })
  );

describe('renderLandingPage', () => {
  it('renders paid invoke and streaming entrypoints with schemas', async () => {
    const entrypoints: EntrypointDef[] = [
      {
        key: 'summarize',
        description: 'Summarize a document',
        network: 'eip155:8453',
        input: z.object({
          email: z.email(),
          source: z.url(),
          count: z.number().min(2),
          enabled: z.boolean(),
          tags: z.array(z.string()),
        }),
        output: z.object({ summary: z.string() }),
        stream: async () => ({ status: 'succeeded' }),
      },
      {
        key: 'classify',
        input: z.object({
          mode: z.enum(['quick', 'careful']),
          value: z.union([z.literal('fixed'), z.number().max(9)]),
        }),
      },
    ];

    const page = await render(entrypoints, {
      activePayments: payments,
      resolvePrice: (entrypoint, which) => {
        if (entrypoint.key === 'summarize') {
          return which === 'invoke' ? '$0.01' : '$0.02';
        }
        return null;
      },
    });

    expect(page).toContain('<!DOCTYPE html>');
    expect(page).toContain('<title>Coverage &lt;Agent&gt;</title>');
    expect(page).toMatch(
      /class="stat-value">2<\/span>[\s\S]*class="stat-label">Entrypoints/
    );
    expect(page).toMatch(/class="stat-value"\s*>Enabled<\/span/);
    expect(page).toContain('Invoke: $0.01 · Stream: $0.02');
    expect(page).toContain('POST /api/agent/entrypoints/summarize/stream');
    expect(page).toContain(
      'https://agent.example.com/api/agent/entrypoints/summarize/invoke'
    );
    expect(page).toContain('/api/agent/entrypoints/summarize/invoke');
    expect(page).toContain('agent@example.com');
    expect(page).toContain('https://example.com');
    expect(page).toContain('&quot;count&quot;: 2');
    expect(page).toContain('const response = await fetch(url);');
    expect(page).toContain(
      'const manifestUrl = "/api/agent/.well-known/agent-card.json";'
    );
  });

  it('renders the empty and metadata fallback states', async () => {
    const page = await render([], {
      pageMeta: { name: 'Bare agent', version: '0.0.1' },
    });

    expect(page).toMatch(
      /class="stat-value">0<\/span>[\s\S]*class="stat-label">Entrypoints/
    );
    expect(page).toMatch(/class="stat-value"\s*>None<\/span/);
    expect(page).toContain('No entrypoints registered yet.');
    expect(page).toContain('content="https://agent.example.com"');
    expect(page).toContain('content="website"');
  });

  it('renders a free schema-less invoke entrypoint', async () => {
    const page = await render([{ key: 'ping' }]);

    expect(page).toMatch(
      /class="stat-value">1<\/span>[\s\S]*class="stat-label">Entrypoint/
    );
    expect(page).toContain('No description provided yet.');
    expect(page).toContain('No input schema provided.');
    expect(page).toContain('Free');
    expect(page).not.toContain('POST /entrypoints/ping/stream');
  });
});
