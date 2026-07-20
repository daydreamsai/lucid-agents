import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { ServicePageHealthInput } from '../service-page-model';
import { describe, expect, it } from 'bun:test';

import { renderLandingPage } from '../landing-page';

const card: AgentCardWithEntrypoints = {
  name: 'Coverage <Agent>',
  version: '1.2.3',
  description: 'Exercises the generated service storefront',
  supportedInterfaces: [
    {
      url: 'https://agent.example.com/api/agent/',
      protocolBinding: 'HTTP+JSON',
    },
  ],
  capabilities: {
    streaming: true,
    stateTransitionHistory: true,
    extensions: [
      {
        uri: 'https://example.com/extensions/research',
        description: 'Research provenance',
      },
    ],
  },
  payments: [{ method: 'x402', network: 'eip155:8453' }],
  registrations: [{ agentId: 7, agentRegistry: 'eip155:8453:0xregistry' }],
  trustModels: ['feedback'],
  entrypoints: {
    summarize: {
      description: 'Summarize a document',
      streaming: true,
      input_schema: {
        type: 'object',
        required: ['source', 'count'],
        properties: {
          source: { type: 'string', format: 'uri' },
          count: { type: 'number', minimum: 2 },
        },
      },
      output_schema: {
        type: 'object',
        properties: { summary: { type: 'string' } },
      },
      pricing: { invoke: '$0.01', stream: '$0.02' },
      payment_protocol: 'x402',
      network: 'eip155:8453',
    },
    ping: {
      description: 'Check basic service behavior',
      streaming: false,
    },
  },
};

const render = async (
  manifest: AgentCardWithEntrypoints = card,
  health: ServicePageHealthInput = { ok: true, version: manifest.version }
): Promise<string> =>
  String(
    await renderLandingPage({
      manifest,
      health,
      faviconDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      x402ClientExample: 'const response = await fetch(url);',
    })
  );

describe('renderLandingPage', () => {
  it('renders the public service, trust, capabilities, and offering operations', async () => {
    const page = await render();

    expect(page).toContain('<!DOCTYPE html>');
    expect(page).toContain('<title>Coverage &lt;Agent&gt;</title>');
    expect(page).toContain('class="service-page"');
    expect(page).toContain('Agent offerings');
    expect(page).toContain('Summarize');
    expect(page).toContain('$0.01 invoke · $0.02 stream');
    expect(page).toContain('x402');
    expect(page).toContain('eip155:8453');
    expect(page).toContain('Registered identity');
    expect(page).toContain('Research provenance');
    expect(page).toContain('/api/agent/entrypoints/summarize/invoke');
    expect(page).toContain('/api/agent/entrypoints/summarize/stream');
    expect(page).toContain('https://example.com');
    expect(page).toContain('&quot;count&quot;: 2');
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain('data-action="invoke"');
    expect(page).toContain('data-action="stream"');
    expect(page).toContain('data-action="back"');
    expect(page).toContain('@media (min-width: 1200px)');
    expect(page).toContain('grid-template-columns: 320px minmax(0, 1fr)');
    expect(page).toContain('@media (max-width: 767px)');
    expect(page).toContain('position: sticky');
    expect(page).toContain('const response = await fetch(url);');
    expect(page).toContain('<meta name="theme-color" content="#0b0d0c"');
    expect(page).toContain('color-scheme: dark');
    expect(page).toContain('font: 16px/1.5 var(--mono)');
    expect(page).not.toContain('class="monogram"');
  });

  it('makes protected flows explicit and only executes free operations', async () => {
    const page = await render();

    expect(page).toContain('Protected operation');
    expect(page).toContain('Use a protocol-aware client');
    expect(page).toContain('data-protected="true"');
    expect(page).toContain('data-protected="false"');
    expect(page).toContain("if (button.dataset.protected === 'true')");
    expect(page).not.toContain('localStorage');
    expect(page).not.toContain('Powered by @lucid/agent-kit');
    expect(page).not.toContain('radial-gradient');
  });

  it('renders an honest empty service state and safe metadata fallbacks', async () => {
    const page = await render(
      {
        name: 'Bare agent',
        entrypoints: {},
        supportedInterfaces: [
          { url: 'https://bare.example/', protocolBinding: 'HTTP+JSON' },
        ],
      },
      null
    );

    expect(page).toContain('No offerings published');
    expect(page).toContain('Status unknown');
    expect(page).toContain('No additional capabilities published.');
    expect(page).toContain('This agent has not published a description yet.');
  });
});
