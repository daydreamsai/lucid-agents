import type {
  ResolvedServiceUi,
  ServiceUiConfig,
} from '@lucid-agents/types/http';

import { SERVICE_UI_PRESETS } from './presets';
import {
  validateServiceUiConfig,
  validateServiceUiContrast,
} from './validation';

/** Resolves a storefront preset into the complete renderer token set. */
export function resolveServiceUi(
  config: ServiceUiConfig = { preset: 'dossier' }
): ResolvedServiceUi {
  validateServiceUiConfig(config);
  if (
    !Object.prototype.hasOwnProperty.call(SERVICE_UI_PRESETS, config.preset)
  ) {
    throw new Error(
      `Unknown service UI preset "${String(config.preset)}". Expected dossier, folio, or console.`
    );
  }
  const preset = SERVICE_UI_PRESETS[config.preset];
  const resolved: ResolvedServiceUi = {
    ...preset,
    tokens: {
      colors: { ...preset.tokens.colors, ...config.tokens?.colors },
      fonts: { ...preset.tokens.fonts, ...config.tokens?.fonts },
    },
  };
  validateServiceUiContrast(resolved);
  return resolved;
}
