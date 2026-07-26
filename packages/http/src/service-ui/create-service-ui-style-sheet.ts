import type { ResolvedServiceUi } from '@lucid-agents/types/http';

import { BASE_CSS, PRESET_LAYOUT_CSS, serializeFontStack } from './style-sheet';

const LUCID_MARK_OUTER_PATH =
  'M256 128 L255.76 180.39 L255.05 196.27 L253.85 207.54 L252.16 216.46 L249.96 223.85 L247.23 230.1 L243.93 235.45 L240.03 240.03 L235.45 243.93 L230.1 247.23 L223.85 249.96 L216.46 252.16 L207.54 253.85 L196.27 255.05 L180.39 255.76 L128 256 L75.61 255.76 L59.73 255.05 L48.46 253.85 L39.54 252.16 L32.15 249.96 L25.9 247.23 L20.55 243.93 L15.97 240.03 L12.07 235.45 L8.77 230.1 L6.04 223.85 L3.84 216.46 L2.15 207.54 L.95 196.27 L.24 180.39 L0 128 L.24 75.61 L.95 59.73 L2.15 48.46 L3.84 39.54 L6.04 32.15 L8.77 25.9 L12.07 20.55 L15.97 15.97 L20.55 12.07 L25.9 8.77 L32.15 6.04 L39.54 3.84 L48.46 2.15 L59.73 .95 L75.61 .24 L128 0 L180.39 .24 L196.27 .95 L207.54 2.15 L216.46 3.84 L223.85 6.04 L230.1 8.77 L235.45 12.07 L240.03 15.97 L243.93 20.55 L247.23 25.9 L249.96 32.15 L252.16 39.54 L253.85 48.46 L255.05 59.73 L255.76 75.61 Z';
const LUCID_MARK_CORE_PATH =
  'M180 128 L179.82 137.9 L179.28 144.18 L178.39 149.49 L177.14 154.18 L175.54 158.39 L173.58 162.17 L171.26 165.57 L168.6 168.6 L165.57 171.26 L162.17 173.58 L158.39 175.54 L154.18 177.14 L149.49 178.39 L144.18 179.28 L137.9 179.82 L128 180 L118.1 179.82 L111.82 179.28 L106.51 178.39 L101.82 177.14 L97.61 175.54 L93.83 173.58 L90.43 171.26 L87.4 168.6 L84.74 165.57 L82.42 162.17 L80.46 158.39 L78.86 154.18 L77.61 149.49 L76.72 144.18 L76.18 137.9 L76 128 L76.18 118.1 L76.72 111.82 L77.61 106.51 L78.86 101.82 L80.46 97.61 L82.42 93.83 L84.74 90.43 L87.4 87.4 L90.43 84.74 L93.83 82.42 L97.61 80.46 L101.82 78.86 L106.51 77.61 L111.82 76.72 L118.1 76.18 L128 76 L137.9 76.18 L144.18 76.72 L149.49 77.61 L154.18 78.86 L158.39 80.46 L162.17 82.42 L165.57 84.74 L168.6 87.4 L171.26 90.43 L173.58 93.83 L175.54 97.61 L177.14 101.82 L178.39 106.51 L179.28 111.82 L179.82 118.1 Z';

function createLucidMarkDataUrl(colorScheme: ResolvedServiceUi['colorScheme']) {
  const outer = colorScheme === 'dark' ? '#F6F7F2' : '#0C0F0D';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="${outer}" d="${LUCID_MARK_OUTER_PATH}"/><path fill="#DFFF45" d="${LUCID_MARK_CORE_PATH}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Produces the deterministic stylesheet shared by static and React pages. */
export function createServiceUiStyleSheet(resolved: ResolvedServiceUi): string {
  const { colors, fonts } = resolved.tokens;
  return `:root {
  color-scheme: ${resolved.colorScheme};
  --service-canvas: ${colors.canvas};
  --service-surface: ${colors.surface};
  --service-surface-raised: ${colors.surfaceRaised};
  --service-text: ${colors.text};
  --service-text-muted: ${colors.textMuted};
  --service-border: ${colors.border};
  --service-accent: ${colors.accent};
  --service-accent-text: ${colors.accentText};
  --service-success: ${colors.success};
  --service-warning: ${colors.warning};
  --service-danger: ${colors.danger};
  --service-code: ${colors.code};
  --service-display: ${serializeFontStack(fonts.display)};
  --service-body: ${serializeFontStack(fonts.body)};
  --service-mono: ${serializeFontStack(fonts.mono)};
  --service-lucid-mark: ${createLucidMarkDataUrl(resolved.colorScheme)};
}

${BASE_CSS}

${PRESET_LAYOUT_CSS[resolved.preset]}`;
}
