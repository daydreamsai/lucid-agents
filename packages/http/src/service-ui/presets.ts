import type {
  ResolvedServiceUi,
  ServiceUiConfig,
  ServiceUiFonts,
} from '@lucid-agents/types/http';

const MONO_STACK: ServiceUiFonts['mono'] = [
  'IBM Plex Mono',
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
      canvas: '#0B0D0C',
      surface: '#111512',
      surfaceRaised: '#171C18',
      text: '#EDF2EB',
      textMuted: '#8D978F',
      border: '#29302B',
      accent: '#7EE2A8',
      accentText: '#07110B',
      success: '#55BE85',
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
      canvas: '#F7F8FA',
      surface: '#FFFFFF',
      surfaceRaised: '#F1F3F6',
      text: '#111827',
      textMuted: '#667085',
      border: '#D7DCE2',
      accent: '#145BCC',
      accentText: '#FFFFFF',
      success: '#137A50',
      warning: '#956000',
      danger: '#B42318',
      code: '#EEF1F4',
    },
    fonts: {
      display: [
        'Avenir Next',
        'Segoe UI',
        'Helvetica Neue',
        'Arial',
        'sans-serif',
      ],
      body: [
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
      display: [
        'DM Sans',
        'Aptos',
        'Segoe UI',
        'Helvetica Neue',
        'Arial',
        'sans-serif',
      ],
      body: [
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
};

export const SERVICE_UI_PRESETS = {
  dossier: DOSSIER,
  folio: FOLIO,
  console: CONSOLE,
} as const satisfies Record<ServiceUiConfig['preset'], ResolvedServiceUi>;
