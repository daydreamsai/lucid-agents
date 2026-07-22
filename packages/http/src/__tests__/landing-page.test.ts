import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { ServiceUiConfig } from '@lucid-agents/types/http';
import type { ServicePageHealthInput } from '../service-page-model';
import { describe, expect, it } from 'bun:test';

import { renderLandingPage } from '../landing-page';

const card: AgentCardWithEntrypoints = {
  name: 'Coverage <Agent>',
  version: '1.2.3',
  description: 'Exercises the generated service storefront',
  protocolVersion: '1.0',
  provider: {
    organization: 'Lucid Research',
    url: 'https://lucid.example/about',
  },
  documentationUrl: 'https://lucid.example/docs',
  supportedInterfaces: [
    {
      url: 'https://agent.example.com/api/agent/',
      protocolBinding: 'HTTP+JSON',
    },
  ],
  capabilities: {
    streaming: true,
    pushNotifications: true,
    stateTransitionHistory: true,
    extensions: [
      {
        uri: 'https://example.com/extensions/research',
        description: 'Research provenance',
      },
    ],
  },
  securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
  security: [{ bearer: [] }],
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json', 'text/event-stream'],
  supportsAuthenticatedExtendedCard: true,
  skills: [
    {
      id: 'summarize',
      name: 'Evidence summary',
      tags: ['summarization', 'research'],
      examples: ['Summarize a public report'],
    },
  ],
  payments: [
    {
      method: 'x402',
      network: 'eip155:8453',
      payee: '0x0000000000000000000000000000000000000001',
      endpoint: 'https://facilitator.example/settle',
      priceModel: { default: '$0.01' },
    },
  ],
  registrations: [{ agentId: 7, agentRegistry: 'eip155:8453:0xregistry' }],
  trustModels: ['feedback'],
  ValidationRequestsURI: 'https://agent.example.com/validation/requests',
  ValidationResponsesURI: 'https://agent.example.com/validation/responses',
  FeedbackDataURI: 'https://agent.example.com/feedback',
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
  health: ServicePageHealthInput = { ok: true, version: manifest.version },
  serviceUi?: ServiceUiConfig
): Promise<string> =>
  String(
    await renderLandingPage({
      manifest,
      health,
      faviconDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      x402ClientExample: 'const response = await fetch(url);',
      serviceUi,
    })
  );

describe('renderLandingPage', () => {
  it('renders one minimal table row for every invoke and stream endpoint', async () => {
    const page = await render();

    expect(page).toContain('<!DOCTYPE html>');
    expect(page).toContain('<title>Coverage &lt;Agent&gt;</title>');
    expect(page).toContain('class="service-page"');
    expect(page).toContain('data-service-ui-preset="dossier"');
    expect(page).toContain('data-service-ui-mode="directory"');
    expect(page).toContain('class="endpoint-table"');
    expect(page).toContain('Payment method');
    expect(page).toContain('Price');
    expect(page).toMatch(/3\s+endpoints/u);
    expect(page).toContain('Evidence summary');
    expect(page).toContain('Evidence summary stream');
    expect(page).toContain('$0.01');
    expect(page).toContain('$0.02');
    expect(page).toContain('Free');
    expect(page).toContain('None');
    expect(page).toContain('x402');
    expect(page).toContain('eip155:8453');
    expect(page).toContain('/api/agent/entrypoints/summarize/invoke');
    expect(page).toContain('/api/agent/entrypoints/summarize/stream');
    expect(page).toContain('/api/agent/entrypoints/ping/invoke');
    expect(page).toContain('name="theme-color"');
    expect(page).toContain('content="#0b0d0c"');
    expect(page).toContain('color-scheme: dark');
    expect(page).toContain('--service-body:');
    expect(page).not.toContain('Public Agent Card JSON');
    expect(page).not.toContain('Input schema');
    expect(page).not.toContain('&quot;count&quot;');
  });

  it('is read-only and contains no browser-side API execution path', async () => {
    const page = await render();

    expect(page).not.toContain('<script');
    expect(page).not.toContain('<textarea');
    expect(page).not.toContain('<pre');
    expect(page).not.toContain('data-action=');
    expect(page).not.toContain('aria-live=');
    expect(page).not.toContain('localStorage');
    expect(page).not.toContain('cURL');
    expect(page).not.toContain('JSON');
  });

  it('applies every preset and safe font stylesheet through the same renderer', async () => {
    for (const [preset, colorScheme, canvas] of [
      ['dossier', 'dark', '#0B0D0C'],
      ['folio', 'light', '#F4F0E8'],
      ['console', 'dark', '#07111A'],
    ] as const) {
      const page = await render(card, { ok: true }, { preset });
      expect(page).toContain(`data-service-ui-preset="${preset}"`);
      expect(page).toContain(`color-scheme: ${colorScheme}`);
      expect(page).toContain(`--service-canvas: ${canvas}`);
    }

    const page = await render(
      card,
      { ok: true },
      {
        preset: 'folio',
        tokens: {
          fonts: { stylesheetUrl: 'https://fonts.example/service-ui.css' },
        },
      }
    );
    expect(page).toContain(
      '<link rel="stylesheet" href="https://fonts.example/service-ui.css"'
    );
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

    expect(page).toContain('No endpoints published');
    expect(page).toMatch(/0\s+endpoints/u);
    expect(page).toContain('Status unknown');
    expect(page).toContain('This agent has not published a description yet.');
  });
});
