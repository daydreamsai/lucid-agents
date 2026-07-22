import type {
  ResolvedServiceUi,
  ServiceUiConfig,
} from '@lucid-agents/types/http';

const HEX_COLOR = /^#[0-9A-F]{6}$/iu;
const SAFE_FONT_FAMILY = /^[A-Z0-9][A-Z0-9 ._-]{0,63}$/iu;

function assertKnownKeys(
  value: object,
  supported: readonly string[],
  path: string
): void {
  for (const key of Object.keys(value)) {
    if (!supported.includes(key)) {
      throw new Error(`${path}.${key} is not supported`);
    }
  }
}

function validateConfigShape(config: ServiceUiConfig): void {
  assertKnownKeys(config, ['preset', 'tokens'], 'serviceUi');
  if (!config.tokens) return;
  assertKnownKeys(config.tokens, ['colors', 'fonts'], 'serviceUi.tokens');
  if (config.tokens.colors) {
    assertKnownKeys(
      config.tokens.colors,
      [
        'canvas',
        'surface',
        'surfaceRaised',
        'text',
        'textMuted',
        'border',
        'accent',
        'accentText',
        'success',
        'warning',
        'danger',
        'code',
      ],
      'serviceUi.tokens.colors'
    );
  }
  if (config.tokens.fonts) {
    assertKnownKeys(
      config.tokens.fonts,
      ['display', 'body', 'mono', 'stylesheetUrl'],
      'serviceUi.tokens.fonts'
    );
  }
}

function validateColorOverrides(config: ServiceUiConfig): void {
  for (const [name, value] of Object.entries(config.tokens?.colors ?? {})) {
    if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
      throw new Error(
        `serviceUi.tokens.colors.${name} must be a six-digit hex color`
      );
    }
  }
}

function validateFontOverrides(config: ServiceUiConfig): void {
  const fonts = config.tokens?.fonts;
  if (!fonts) return;
  for (const name of ['display', 'body', 'mono'] as const) {
    const stack = fonts[name];
    if (stack === undefined) continue;
    if (!Array.isArray(stack) || stack.length < 1 || stack.length > 8) {
      throw new Error(
        `serviceUi.tokens.fonts.${name} must contain 1 to 8 font families`
      );
    }
    if (
      stack.some(
        family =>
          typeof family !== 'string' || !SAFE_FONT_FAMILY.test(family.trim())
      )
    ) {
      throw new Error(
        `serviceUi.tokens.fonts.${name} contains an unsafe font family`
      );
    }
  }
  const stylesheetUrl = fonts.stylesheetUrl;
  if (stylesheetUrl === undefined) return;
  const sameOrigin =
    stylesheetUrl.startsWith('/') && !stylesheetUrl.startsWith('//');
  let secureRemote = false;
  if (stylesheetUrl.startsWith('https://')) {
    try {
      const parsed = new URL(stylesheetUrl);
      secureRemote =
        parsed.protocol === 'https:' && !parsed.username && !parsed.password;
    } catch {
      secureRemote = false;
    }
  }
  if (
    stylesheetUrl.length > 2_048 ||
    /[\u0000-\u001F\\]/u.test(stylesheetUrl) ||
    (!sameOrigin && !secureRemote)
  ) {
    throw new Error(
      'serviceUi.tokens.fonts.stylesheetUrl must use HTTPS or a same-origin path'
    );
  }
}

function relativeLuminance(color: string): number {
  const channels = [1, 3, 5].map(index => {
    const channel = Number.parseInt(color.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return (
    0.2126 * (channels[0] ?? 0) +
    0.7152 * (channels[1] ?? 0) +
    0.0722 * (channels[2] ?? 0)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const light = Math.max(foregroundLuminance, backgroundLuminance);
  const dark = Math.min(foregroundLuminance, backgroundLuminance);
  return (light + 0.05) / (dark + 0.05);
}

export function validateServiceUiConfig(config: ServiceUiConfig): void {
  validateConfigShape(config);
  validateColorOverrides(config);
  validateFontOverrides(config);
}

export function validateServiceUiContrast(resolved: ResolvedServiceUi): void {
  const { colors } = resolved.tokens;
  const pairs = [
    ['text on canvas', colors.text, colors.canvas, 4.5],
    ['text on surface', colors.text, colors.surface, 4.5],
    ['text on code', colors.text, colors.code, 4.5],
    ['muted text on canvas', colors.textMuted, colors.canvas, 4.5],
    ['accent text on accent', colors.accentText, colors.accent, 4.5],
    ['accent focus on canvas', colors.accent, colors.canvas, 3],
  ] as const;
  for (const [label, foreground, background, minimum] of pairs) {
    if (contrastRatio(foreground, background) + Number.EPSILON < minimum) {
      throw new Error(
        `serviceUi color contrast for ${label} must be at least ${minimum}:1`
      );
    }
  }
}
