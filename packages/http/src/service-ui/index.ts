import type {
  ResolvedServiceUi,
  ServiceUiConfig,
  ServiceUiFonts,
} from '@lucid-agents/types/http';

const MONO_STACK: ServiceUiFonts['mono'] = [
  'IBM Plex Mono',
  'SFMono-Regular',
  'monospace',
];

const DOSSIER: ResolvedServiceUi = {
  preset: 'dossier',
  colorScheme: 'dark',
  tokens: {
    colors: {
      canvas: '#0B0D0C',
      surface: '#111512',
      surfaceRaised: '#171C18',
      text: '#EDF2EB',
      textMuted: '#8D978F',
      border: '#29302B',
      accent: '#7EE2A8',
      accentText: '#07110B',
      success: '#7EE2A8',
      warning: '#E3B965',
      danger: '#FF8B82',
      code: '#080A09',
    },
    fonts: {
      display: MONO_STACK,
      body: MONO_STACK,
      mono: MONO_STACK,
    },
  },
};

const FOLIO: ResolvedServiceUi = {
  preset: 'folio',
  colorScheme: 'light',
  tokens: {
    colors: {
      canvas: '#F4F0E8',
      surface: '#FFFCF5',
      surfaceRaised: '#FFFFFF',
      text: '#1D201E',
      textMuted: '#656A66',
      border: '#D6D0C4',
      accent: '#1859C9',
      accentText: '#FFFFFF',
      success: '#147A4A',
      warning: '#9A6700',
      danger: '#B42318',
      code: '#171A18',
    },
    fonts: {
      display: ['Instrument Serif', 'Iowan Old Style', 'Georgia', 'serif'],
      body: ['Source Sans 3', 'Avenir Next', 'Segoe UI', 'sans-serif'],
      mono: MONO_STACK,
    },
  },
};

const CONSOLE: ResolvedServiceUi = {
  preset: 'console',
  colorScheme: 'dark',
  tokens: {
    colors: {
      canvas: '#07111A',
      surface: '#0B1824',
      surfaceRaised: '#102536',
      text: '#EAF7FF',
      textMuted: '#82A0B3',
      border: '#1E3A4C',
      accent: '#39D6E7',
      accentText: '#031014',
      success: '#4DD4A4',
      warning: '#F5B942',
      danger: '#FF6B73',
      code: '#03090E',
    },
    fonts: {
      display: ['DM Sans', 'Aptos', 'Segoe UI', 'sans-serif'],
      body: ['DM Sans', 'Aptos', 'Segoe UI', 'sans-serif'],
      mono: ['JetBrains Mono', 'SFMono-Regular', 'monospace'],
    },
  },
};

const PRESETS = {
  dossier: DOSSIER,
  folio: FOLIO,
  console: CONSOLE,
} as const satisfies Record<ServiceUiConfig['preset'], ResolvedServiceUi>;

const HEX_COLOR = /^#[0-9A-F]{6}$/iu;
const SAFE_FONT_FAMILY = /^[A-Z0-9][A-Z0-9 ._-]{0,63}$/iu;
const GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
]);

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

function validateContrast(resolved: ResolvedServiceUi): void {
  const { colors } = resolved.tokens;
  const pairs = [
    ['text on canvas', colors.text, colors.canvas, 4.5],
    ['text on surface', colors.text, colors.surface, 4.5],
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

function serializeFontStack(stack: ServiceUiFonts['body']): string {
  return stack
    .map(family => {
      const trimmed = family.trim();
      return GENERIC_FONT_FAMILIES.has(trimmed.toLowerCase())
        ? trimmed
        : `"${trimmed}"`;
    })
    .join(', ');
}

const BASE_CSS = `
* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 320px;
  background: var(--service-canvas);
  color: var(--service-text);
  font: 16px/1.55 var(--service-body);
  text-rendering: optimizeLegibility;
}

button,
textarea,
input {
  font: inherit;
}

a {
  color: var(--service-accent);
  text-underline-offset: 3px;
}

button:focus-visible,
a:focus-visible,
textarea:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 3px solid var(--service-accent);
  outline-offset: 3px;
}

.service-page {
  width: min(1240px, 100%);
  margin: 0 auto;
  padding: 0 36px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.service-header {
  padding: 48px 0 36px;
  border-bottom: 1px solid var(--service-border);
}

.service-kicker,
.kicker,
.section-label {
  color: var(--service-text-muted);
  font: 650 12px/1.4 var(--service-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--service-text-muted);
}

.status-online,
.state-success .state-indicator,
.state-partial .state-indicator {
  background: var(--service-success);
}

.status-degraded,
.state-payment .state-indicator {
  background: var(--service-warning);
}

.status-offline,
.state-error .state-indicator,
.state-invalid .state-indicator {
  background: var(--service-danger);
}

h1,
h2,
h3 {
  margin-block: 0;
  color: var(--service-text);
  font-family: var(--service-display);
}

h1 {
  max-width: 920px;
  margin-top: 12px;
  font-size: clamp(30px, 4vw, 50px);
  line-height: 1.05;
  letter-spacing: -0.045em;
}

h2 {
  font-size: clamp(26px, 3vw, 38px);
  line-height: 1.12;
  letter-spacing: -0.035em;
}

h3 {
  font-size: 18px;
  line-height: 1.25;
}

.service-purpose,
.purpose {
  max-width: 760px;
  margin: 18px 0 0;
  color: var(--service-text-muted);
  font-size: clamp(15px, 1.5vw, 18px);
}

.identity-meta,
.trust-line,
.operation-facts,
.facts,
.tag-list,
.mode-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
}

.identity-meta,
.trust-line {
  color: var(--service-text-muted);
  font: 550 12px/1.4 var(--service-mono);
}

.trust-line li::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  margin: 0 8px 2px 0;
  border-radius: 50%;
  background: var(--service-success);
}

.service-layout {
  display: grid;
  min-width: 0;
  border-bottom: 1px solid var(--service-border);
}

.offering-rail {
  min-width: 0;
  padding: 32px 24px 40px 0;
}

.offering-rail > .section-label {
  display: block;
  margin-bottom: 16px;
}

.offering-list,
.offering-rail ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.offering-list li,
.offering-rail li {
  border-top: 1px solid var(--service-border);
}

.offering-list li:last-child,
.offering-rail li:last-child {
  border-bottom: 1px solid var(--service-border);
}

.offering-list button,
.offering-rail a {
  display: grid;
  width: 100%;
  min-height: 92px;
  gap: 7px;
  padding: 16px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  text-decoration: none;
}

.offering-list .is-selected button,
.offering-rail a[aria-current='page'] {
  box-shadow: inset 3px 0 0 var(--service-accent);
  background: var(--service-surface);
}

.offering-title,
.offering-rail strong {
  font-weight: 750;
}

.offering-description,
.offering-rail small {
  color: var(--service-text-muted);
}

.offering-meta,
.price {
  color: var(--service-accent);
  font: 600 12px/1.4 var(--service-mono);
}

.workspaces,
.offering-workspace,
.workspace-empty {
  min-width: 0;
}

.workspaces {
  padding: 32px 0 52px 38px;
}

.workspace,
.offering-workspace {
  min-width: 0;
  padding-bottom: 50px;
  scroll-margin-top: 28px;
}

.workspace + .workspace {
  padding-top: 48px;
  border-top: 1px solid var(--service-border);
}

.workspace-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
}

.workspace-header h2 {
  margin-top: 7px;
}

.workspace-header p {
  max-width: 660px;
  margin: 10px 0 0;
  color: var(--service-text-muted);
}

.operation-facts,
.facts {
  align-items: flex-start;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 0;
}

.operation-facts span,
.facts span,
.tag-list li,
.mode-list li {
  padding: 6px 8px;
  border: 1px solid var(--service-border);
  border-radius: 4px;
  font: 600 12px/1.2 var(--service-mono);
}

.input-section,
.request-contract,
.readiness-panel,
.run-state,
.integration-section,
.contract-block {
  margin-top: 26px;
}

.section-heading-row,
.endpoint-line,
.run-state-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

textarea,
pre,
.code-block {
  width: 100%;
  overflow: auto;
  border: 1px solid var(--service-border);
  border-radius: 4px;
  background: var(--service-code);
  color: var(--service-text);
  font: 13px/1.65 var(--service-mono);
  tab-size: 2;
}

textarea {
  min-height: 190px;
  margin-top: 11px;
  padding: 16px;
  resize: vertical;
}

pre,
.code-block {
  margin: 12px 0 0;
  padding: 16px;
  white-space: pre-wrap;
  word-break: break-word;
}

code {
  font-family: var(--service-mono);
}

.schema-grid,
.contract-grid,
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.protected-note,
.readiness-panel,
.run-state,
.detail-card,
.empty-state,
.empty {
  padding: 18px;
  border: 1px solid var(--service-border);
  border-radius: 4px;
  background: var(--service-surface);
}

.protected-note {
  margin-top: 18px;
}

.protected-note p,
.readiness-panel p,
.run-placeholder,
.empty-state,
.empty {
  margin-block: 5px 0;
  color: var(--service-text-muted);
}

.credential-field {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.credential-field input {
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--service-border);
  border-radius: 4px;
  background: var(--service-code);
  color: var(--service-text);
}

.run-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 20px 0;
}

.primary-button,
.secondary-button,
.text-button,
.mobile-back,
.integration-toggle {
  min-height: 44px;
  cursor: pointer;
  font-weight: 750;
}

.primary-button,
.secondary-button {
  padding: 10px 18px;
  border-radius: 4px;
}

.primary-button {
  border: 1px solid var(--service-accent);
  background: var(--service-accent);
  color: var(--service-accent-text);
}

.secondary-button {
  border: 1px solid var(--service-text);
  background: transparent;
  color: var(--service-text);
}

.text-button,
.mobile-back,
.integration-toggle {
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: var(--service-accent);
}

.text-button.danger,
.error-message {
  color: var(--service-danger);
}

.mobile-back {
  display: none;
}

.run-state {
  min-height: 160px;
}

.run-state-heading {
  justify-content: flex-start;
}

.state-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--service-text-muted);
}

.state-note,
.task-reference {
  color: var(--service-text-muted);
  font: 600 12px/1.4 var(--service-mono);
}

details {
  margin-top: 18px;
  border-top: 1px solid var(--service-border);
}

summary {
  min-height: 48px;
  padding-top: 14px;
  cursor: pointer;
  font-weight: 750;
}

.service-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  padding: 42px 0;
  border-bottom: 1px solid var(--service-border);
}

.service-details > .section-label,
.raw-card > .section-label {
  grid-column: 1 / -1;
}

.detail-card h3 {
  margin-bottom: 14px;
}

.detail-list,
.capability-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--service-border);
}

.detail-list > div,
.capability-list > li {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  padding: 12px 0;
  border-bottom: 1px solid var(--service-border);
}

.detail-list dt,
.capability-list span {
  color: var(--service-text-muted);
}

.detail-list dd {
  min-width: 0;
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

.raw-card {
  padding: 42px 0;
  border-bottom: 1px solid var(--service-border);
}

.service-footer,
footer {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 24px 0 40px;
  color: var(--service-text-muted);
  font: 12px/1.4 var(--service-mono);
}

@media (hover: hover) and (pointer: fine) {
  .offering-list button:hover,
  .offering-rail a:hover {
    background: var(--service-surface-raised);
  }

  .primary-button:hover,
  .secondary-button:hover {
    transform: translateY(-1px);
  }
}

@media (max-width: 900px) {
  .service-page {
    padding-inline: 22px;
  }

  .service-layout,
  .service-details,
  .schema-grid,
  .contract-grid,
  .detail-grid {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .offering-rail {
    position: static !important;
    padding-right: 0;
    border-right: 0 !important;
    border-bottom: 1px solid var(--service-border);
  }

  .workspaces {
    padding-left: 0;
  }

  .workspace-header {
    display: block;
  }

  .operation-facts,
  .facts {
    justify-content: flex-start;
    margin-top: 16px;
  }
}

@media (max-width: 767px) {
  .service-page {
    padding-inline: 18px;
  }

  [data-service-ui-mode='interactive'] .service-layout.show-mobile-list .offering-workspace,
  [data-service-ui-mode='interactive'] .service-layout.show-mobile-list .workspace-empty {
    display: none;
  }

  [data-service-ui-mode='interactive'] .service-layout:not(.show-mobile-list) .offering-rail {
    display: none;
  }

  [data-service-ui-mode='interactive'] .mobile-back {
    display: inline-flex;
    align-items: center;
    margin-bottom: 20px;
  }

  .service-details,
  .schema-grid,
  .contract-grid,
  .detail-grid {
    display: grid;
  }

  .service-footer,
  footer {
    display: grid;
  }
}

@media (max-width: 480px) {
  .service-page {
    padding-inline: 14px;
  }

  .run-actions {
    position: sticky;
    z-index: 3;
    bottom: 0;
    margin-inline: -14px;
    padding: 12px 14px;
    border-block: 1px solid var(--service-border);
    background: var(--service-canvas);
  }

  .run-actions .primary-button {
    flex: 1;
  }

  textarea {
    margin-inline: -14px;
    width: calc(100% + 28px);
    border-inline: 0;
    border-radius: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}`;

const PRESET_LAYOUT_CSS: Record<ServiceUiConfig['preset'], string> = {
  dossier: `[data-service-ui-preset="dossier"] {
  font-family: var(--service-mono);
}

[data-service-ui-preset="dossier"] .service-layout {
  grid-template-columns: 320px minmax(0, 1fr);
}

[data-service-ui-preset="dossier"] .offering-rail {
  position: sticky;
  top: 0;
  align-self: start;
  border-right: 1px solid var(--service-border);
}

@media (min-width: 1200px) {
  [data-service-ui-preset="dossier"] .service-layout {
    grid-template-columns: 320px minmax(0, 1fr);
  }
}`,
  folio: `[data-service-ui-preset="folio"] .service-page {
  width: min(1360px, 100%);
}

[data-service-ui-preset="folio"] .service-header {
  padding-block: 72px 48px;
}

[data-service-ui-preset="folio"] h1 {
  max-width: 1050px;
  font-size: clamp(44px, 7vw, 86px);
  font-weight: 500;
  line-height: 0.96;
  letter-spacing: -0.04em;
}

[data-service-ui-preset="folio"] .service-layout {
  grid-template-columns: minmax(280px, 0.82fr) minmax(0, 1.7fr);
  gap: 34px;
  padding-block: 36px;
}

[data-service-ui-preset="folio"] .offering-rail {
  position: sticky;
  top: 24px;
  align-self: start;
  padding: 0;
}

[data-service-ui-preset="folio"] .offering-list,
[data-service-ui-preset="folio"] .offering-rail ul {
  display: grid;
  gap: 12px;
}

[data-service-ui-preset="folio"] .offering-list li,
[data-service-ui-preset="folio"] .offering-rail li,
[data-service-ui-preset="folio"] .offering-list li:last-child,
[data-service-ui-preset="folio"] .offering-rail li:last-child {
  border: 0;
}

[data-service-ui-preset="folio"] .offering-list button,
[data-service-ui-preset="folio"] .offering-rail a,
[data-service-ui-preset="folio"] .detail-card,
[data-service-ui-preset="folio"] .protected-note,
[data-service-ui-preset="folio"] .readiness-panel,
[data-service-ui-preset="folio"] .run-state {
  border: 1px solid var(--service-border);
  border-radius: 14px;
  background: var(--service-surface);
}

[data-service-ui-preset="folio"] .offering-list .is-selected button,
[data-service-ui-preset="folio"] .offering-rail a[aria-current='page'] {
  box-shadow: inset 0 0 0 2px var(--service-accent);
}

[data-service-ui-preset="folio"] .workspaces {
  padding: 0;
}

[data-service-ui-preset="folio"] .workspace,
[data-service-ui-preset="folio"] .offering-workspace {
  padding: clamp(24px, 4vw, 52px);
  border: 1px solid var(--service-border);
  border-radius: 18px;
  background: var(--service-surface);
}

[data-service-ui-preset="folio"] .workspace + .workspace {
  margin-top: 28px;
}`,
  console: `[data-service-ui-preset="console"] .service-page {
  width: min(1480px, 100%);
  padding-inline: 24px;
}

[data-service-ui-preset="console"] .service-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 28px;
  padding-block: 28px 22px;
}

[data-service-ui-preset="console"] .service-header h1,
[data-service-ui-preset="console"] .service-header .service-purpose,
[data-service-ui-preset="console"] .service-header .purpose,
[data-service-ui-preset="console"] .service-header .trust-line {
  grid-column: 1;
}

[data-service-ui-preset="console"] .service-layout {
  grid-template-columns: minmax(0, 1fr);
}

[data-service-ui-preset="console"] .offering-rail {
  position: sticky;
  z-index: 4;
  top: 0;
  padding: 14px 0;
  border-bottom: 1px solid var(--service-border);
  background: var(--service-canvas);
}

[data-service-ui-preset="console"] .offering-rail > .section-label {
  margin-bottom: 10px;
}

[data-service-ui-preset="console"] .offering-list,
[data-service-ui-preset="console"] .offering-rail ul {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

[data-service-ui-preset="console"] .offering-list li,
[data-service-ui-preset="console"] .offering-rail li,
[data-service-ui-preset="console"] .offering-list li:last-child,
[data-service-ui-preset="console"] .offering-rail li:last-child {
  flex: 0 0 min(300px, 76vw);
  border: 0;
}

[data-service-ui-preset="console"] .offering-list button,
[data-service-ui-preset="console"] .offering-rail a {
  min-height: 74px;
  border: 1px solid var(--service-border);
  border-radius: 4px;
  background: var(--service-surface);
}

[data-service-ui-preset="console"] .offering-list .is-selected button,
[data-service-ui-preset="console"] .offering-rail a[aria-current='page'] {
  box-shadow: inset 0 -3px 0 var(--service-accent);
}

[data-service-ui-preset="console"] .workspaces {
  padding: 26px 0 44px;
}

[data-service-ui-preset="console"] .workspace,
[data-service-ui-preset="console"] .offering-workspace {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 22px;
}

[data-service-ui-preset="console"] .workspace-header,
[data-service-ui-preset="console"] .mobile-back,
[data-service-ui-preset="console"] .readiness-panel,
[data-service-ui-preset="console"] .run-actions,
[data-service-ui-preset="console"] .integration-section,
[data-service-ui-preset="console"] .protected-note,
[data-service-ui-preset="console"] .tag-list {
  grid-column: 1 / -1;
}

[data-service-ui-preset="console"] .input-section,
[data-service-ui-preset="console"] .request-contract {
  grid-column: 1;
}

[data-service-ui-preset="console"] .run-state,
[data-service-ui-preset="console"] .contract-output {
  grid-column: 2;
}

[data-service-ui-preset="console"] .detail-card {
  background: var(--service-surface);
}

@media (max-width: 900px) {
  [data-service-ui-preset="console"] .service-header,
  [data-service-ui-preset="console"] .workspace,
  [data-service-ui-preset="console"] .offering-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  [data-service-ui-preset="console"] .input-section,
  [data-service-ui-preset="console"] .request-contract,
  [data-service-ui-preset="console"] .run-state,
  [data-service-ui-preset="console"] .contract-output {
    grid-column: 1;
  }
}`,
};

/** Provides contextual typing for a generated service-ui.config.ts file. */
export function defineServiceUi(config: ServiceUiConfig): ServiceUiConfig {
  return config;
}

/** Resolves a storefront preset into the complete renderer token set. */
export function resolveServiceUi(
  config: ServiceUiConfig = { preset: 'dossier' }
): ResolvedServiceUi {
  validateConfigShape(config);
  if (!Object.prototype.hasOwnProperty.call(PRESETS, config.preset)) {
    throw new Error(
      `Unknown service UI preset "${String(config.preset)}". Expected dossier, folio, or console.`
    );
  }
  validateColorOverrides(config);
  validateFontOverrides(config);
  const preset = PRESETS[config.preset];
  const resolved: ResolvedServiceUi = {
    ...preset,
    tokens: {
      colors: { ...preset.tokens.colors, ...config.tokens?.colors },
      fonts: { ...preset.tokens.fonts, ...config.tokens?.fonts },
    },
  };
  validateContrast(resolved);
  return resolved;
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
}

${BASE_CSS}

${PRESET_LAYOUT_CSS[resolved.preset]}`;
}
