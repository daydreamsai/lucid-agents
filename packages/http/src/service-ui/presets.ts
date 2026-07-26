import type {
  ResolvedServiceUi,
  ServiceUiConfig,
  ServiceUiFonts,
} from '@lucid-agents/types/http';

const MONO_STACK: ServiceUiFonts['mono'] = [
  'Fragment Mono',
  'ui-monospace',
  'SFMono-Regular',
  'Menlo',
  'Consolas',
  'monospace',
];

const DOSSIER: ResolvedServiceUi = {
  preset: 'dossier',
  colorScheme: 'dark',
  tokens: {
    colors: {
      canvas: '#0C0F0D',
      surface: '#151917',
      surfaceRaised: '#1D231F',
      text: '#F6F7F2',
      textMuted: '#AAB3AC',
      border: '#303730',
      accent: '#DFFF45',
      accentText: '#0C0F0D',
      success: '#55D590',
      warning: '#F4B942',
      danger: '#FF6B66',
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
      canvas: '#F6F7F2',
      surface: '#FAFBF7',
      surfaceRaised: '#EEF1EC',
      text: '#0C0F0D',
      textMuted: '#626B64',
      border: '#DDE2DC',
      accent: '#2B302C',
      accentText: '#F6F7F2',
      success: '#18794E',
      warning: '#9A6700',
      danger: '#C53935',
      code: '#EEF1EC',
    },
    fonts: {
      display: [
        'Instrument Sans',
        'Avenir Next',
        'Segoe UI',
        'Helvetica Neue',
        'Arial',
        'sans-serif',
      ],
      body: [
        'Instrument Sans',
        'Avenir Next',
        'Segoe UI',
        'Helvetica Neue',
        'Arial',
        'sans-serif',
      ],
      mono: MONO_STACK,
    },
  },
};

const CONSOLE: ResolvedServiceUi = {
  preset: 'console',
  colorScheme: 'dark',
  tokens: {
    colors: {
      canvas: '#0C0F0D',
      surface: '#121714',
      surfaceRaised: '#1B211C',
      text: '#F6F7F2',
      textMuted: '#AAB3AC',
      border: '#303730',
      accent: '#DFFF45',
      accentText: '#0C0F0D',
      success: '#55D590',
      warning: '#F4B942',
      danger: '#FF6B66',
      code: '#080A09',
    },
    fonts: {
      display: [
        'Instrument Sans',
        'Aptos',
        'Segoe UI',
        'Helvetica Neue',
        'Arial',
        'sans-serif',
      ],
      body: [
        'Instrument Sans',
        'Aptos',
        'Segoe UI',
        'Helvetica Neue',
        'Arial',
        'sans-serif',
      ],
      mono: [
        'Fragment Mono',
        'ui-monospace',
        'SFMono-Regular',
        'Menlo',
        'Consolas',
        'monospace',
      ],
    },
  },
};

export const SERVICE_UI_PRESETS = {
  dossier: DOSSIER,
  folio: FOLIO,
  console: CONSOLE,
} as const satisfies Record<ServiceUiConfig['preset'], ResolvedServiceUi>;
