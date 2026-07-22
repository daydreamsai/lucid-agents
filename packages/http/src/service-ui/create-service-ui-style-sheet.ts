import type { ResolvedServiceUi } from '@lucid-agents/types/http';

import { BASE_CSS, PRESET_LAYOUT_CSS, serializeFontStack } from './style-sheet';

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
}

${BASE_CSS}

${PRESET_LAYOUT_CSS[resolved.preset]}`;
}
