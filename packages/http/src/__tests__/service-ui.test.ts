import { describe, expect, it } from 'bun:test';

import {
  createServiceUiStyleSheet,
  defineServiceUi,
  resolveServiceUi,
} from '../service-ui';

describe('service UI configuration', () => {
  it('resolves the existing dossier storefront as the default preset', () => {
    const config = defineServiceUi({ preset: 'dossier' });
    const resolved = resolveServiceUi(config);

    expect(resolved).toMatchObject({
      preset: 'dossier',
      colorScheme: 'dark',
      tokens: {
        colors: {
          canvas: '#0B0D0C',
          surface: '#111512',
          text: '#EDF2EB',
          accent: '#7EE2A8',
        },
        fonts: {
          display: [
            'IBM Plex Mono',
            'ui-monospace',
            'SFMono-Regular',
            'Menlo',
            'Consolas',
            'monospace',
          ],
          body: [
            'IBM Plex Mono',
            'ui-monospace',
            'SFMono-Regular',
            'Menlo',
            'Consolas',
            'monospace',
          ],
          mono: [
            'IBM Plex Mono',
            'ui-monospace',
            'SFMono-Regular',
            'Menlo',
            'Consolas',
            'monospace',
          ],
        },
      },
    });
  });

  it('resolves each preset with a distinct layout palette and typography', () => {
    const folio = resolveServiceUi(defineServiceUi({ preset: 'folio' }));
    const consoleUi = resolveServiceUi(defineServiceUi({ preset: 'console' }));

    expect(folio).toMatchObject({
      preset: 'folio',
      colorScheme: 'light',
      tokens: {
        colors: {
          canvas: '#F4F0E8',
          surface: '#FFFCF5',
          text: '#1D201E',
          accent: '#1859C9',
        },
        fonts: {
          display: ['Instrument Serif', 'Iowan Old Style', 'Georgia', 'serif'],
          body: [
            'Source Sans 3',
            'Avenir Next',
            'Segoe UI',
            'Helvetica Neue',
            'Arial',
            'sans-serif',
          ],
        },
      },
    });
    expect(consoleUi).toMatchObject({
      preset: 'console',
      colorScheme: 'dark',
      tokens: {
        colors: {
          canvas: '#07111A',
          surface: '#0B1824',
          text: '#EAF7FF',
          accent: '#39D6E7',
        },
        fonts: {
          display: [
            'DM Sans',
            'Aptos',
            'Segoe UI',
            'Helvetica Neue',
            'Arial',
            'sans-serif',
          ],
          mono: [
            'JetBrains Mono',
            'ui-monospace',
            'SFMono-Regular',
            'Menlo',
            'Consolas',
            'monospace',
          ],
        },
      },
    });
  });

  it('rejects color overrides that are not six-digit hexadecimal values', () => {
    expect(() =>
      resolveServiceUi({
        preset: 'dossier',
        tokens: { colors: { accent: '#12GG45' } },
      })
    ).toThrow('serviceUi.tokens.colors.accent must be a six-digit hex color');
  });

  it('rejects unsafe or empty font stacks', () => {
    expect(() =>
      resolveServiceUi({
        preset: 'folio',
        tokens: { fonts: { body: ['Source Sans 3; color: red'] } },
      })
    ).toThrow('serviceUi.tokens.fonts.body contains an unsafe font family');

    expect(() =>
      resolveServiceUi({
        preset: 'folio',
        tokens: { fonts: { body: [] } },
      } as never)
    ).toThrow('serviceUi.tokens.fonts.body must contain 1 to 8 font families');
  });

  it('accepts only HTTPS or same-origin font stylesheets', () => {
    expect(
      resolveServiceUi({
        preset: 'console',
        tokens: { fonts: { stylesheetUrl: '/fonts/service-ui.css' } },
      }).tokens.fonts.stylesheetUrl
    ).toBe('/fonts/service-ui.css');

    expect(() =>
      resolveServiceUi({
        preset: 'console',
        tokens: { fonts: { stylesheetUrl: 'http://fonts.example/ui.css' } },
      } as never)
    ).toThrow(
      'serviceUi.tokens.fonts.stylesheetUrl must use HTTPS or a same-origin path'
    );
  });

  it('rejects token overrides that make primary text inaccessible', () => {
    expect(() =>
      resolveServiceUi({
        preset: 'dossier',
        tokens: {
          colors: { canvas: '#101010', surface: '#101010', text: '#111111' },
        },
      })
    ).toThrow(
      'serviceUi color contrast for text on canvas must be at least 4.5:1'
    );
  });

  it('generates deterministic, preset-specific CSS from resolved tokens', () => {
    const css = createServiceUiStyleSheet(
      resolveServiceUi({ preset: 'folio' })
    );

    expect(css).toContain('--service-canvas: #F4F0E8;');
    expect(css).toContain(
      '--service-display: "Instrument Serif", "Iowan Old Style", "Georgia", serif;'
    );
    expect(css).toContain('[data-service-ui-preset="folio"] h1');
    expect(css).toContain('.endpoint-table');
    expect(css).not.toContain('[data-service-ui-preset="console"]');
    expect(css).not.toContain('gradient(');
  });

  it('rejects unknown presets with the supported values', () => {
    expect(() => resolveServiceUi({ preset: 'neon' } as never)).toThrow(
      'Unknown service UI preset "neon". Expected dossier, folio, or console.'
    );
  });

  it('rejects unknown config and token keys instead of silently ignoring them', () => {
    expect(() =>
      resolveServiceUi({ preset: 'dossier', layout: 'wide' } as never)
    ).toThrow('serviceUi.layout is not supported');

    expect(() =>
      resolveServiceUi({
        preset: 'folio',
        tokens: { colors: { primary: '#1859C9' } },
      } as never)
    ).toThrow('serviceUi.tokens.colors.primary is not supported');
  });
});
