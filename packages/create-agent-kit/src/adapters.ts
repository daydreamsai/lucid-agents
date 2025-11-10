import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ADAPTER_FILES_ROOT = join(PACKAGE_ROOT, 'adapters');

type AdapterSnippets = {
  imports: string;
  configOverrides: string;
  appCreation: string;
  entrypointRegistration: string;
  exports: string;
};

export type AdapterOptions = {
  variant?: string;
};

export type AdapterDefinition = {
  id: string;
  displayName: string;
  filesDir?: string;
  placeholderTargets?: string[];
  snippets: AdapterSnippets;
  supportedVariants?: string[];
  defaultVariant?: string;
  resolveLayers?: (params: { options?: AdapterOptions }) => string[];
  buildReplacements?: (params: {
    answers: Map<string, string | boolean>;
    templateId?: string;
    options?: AdapterOptions;
  }) => Record<string, string>;
};

const sharedConfigOverrides = `const configOverrides: AgentKitConfig = {
  payments: {
    facilitatorUrl: process.env.PAYMENTS_FACILITATOR_URL as any,
    payTo: process.env.PAYMENTS_RECEIVABLE_ADDRESS as \`0x\${string}\`,
    network: process.env.PAYMENTS_NETWORK as any,
    defaultPrice: process.env.PAYMENTS_DEFAULT_PRICE,
  },
};`;

const adapterDefinitions: Record<string, AdapterDefinition> = {
  hono: {
    id: 'hono',
    displayName: 'Hono',
    filesDir: join(ADAPTER_FILES_ROOT, 'hono'),
    snippets: {
      imports: `import { createAgentApp } from "@lucid-agents/agent-kit-hono";`,
      configOverrides: sharedConfigOverrides,
      appCreation: `const { app, addEntrypoint } = createAgentApp(
  {
    name: process.env.AGENT_NAME,
    version: process.env.AGENT_VERSION,
    description: process.env.AGENT_DESCRIPTION,
  },
  {
    useConfigPayments: true,
    {{FEATURE_AGENT_OPTIONS}}
  }
);`,
      entrypointRegistration: ``,
      exports: `export { app };`,
    },
  },
  tanstack: {
    id: 'tanstack',
    displayName: 'TanStack Start',
    defaultVariant: 'ui',
    supportedVariants: ['ui', 'headless'],
    resolveLayers: ({ options }) => {
      if (options?.variant === 'headless') {
        return [join(ADAPTER_FILES_ROOT, 'tanstack', 'headless')];
      }
      return [join(ADAPTER_FILES_ROOT, 'tanstack', 'ui')];
    },
    placeholderTargets: ['src/lib/agent.ts'],
    snippets: {
      imports: `import { createTanStackRuntime } from "@lucid-agents/agent-kit-tanstack";
import type { CreateAgentHttpOptions } from "@lucid-agents/agent-kit";`,
      configOverrides: sharedConfigOverrides,
      appCreation: `const tanstack = createTanStackRuntime(
  {
    name: process.env.AGENT_NAME,
    version: process.env.AGENT_VERSION,
    description: process.env.AGENT_DESCRIPTION,
  },
  {
    useConfigPayments: true,
    {{FEATURE_AGENT_OPTIONS}}
  }
);

const { runtime, handlers } = tanstack;`,
      entrypointRegistration: ``,
      exports: `const { agent } = runtime;

export { agent, handlers, runtime };`,
    },
  },
};

export function isAdapterSupported(id: string): boolean {
  return Boolean(adapterDefinitions[id]);
}

export function getAdapterDefinition(id: string): AdapterDefinition {
  const adapter = adapterDefinitions[id];
  if (!adapter) {
    throw new Error(`Unsupported adapter "${id}"`);
  }
  return adapter;
}

export function getAdapterDisplayName(id: string): string {
  return adapterDefinitions[id]?.displayName ?? toTitleCase(id);
}

export function getAdapterLayers(
  adapter: AdapterDefinition,
  options?: AdapterOptions
): string[] {
  if (adapter.resolveLayers) {
    return adapter.resolveLayers({ options });
  }
  if (adapter.filesDir) {
    return [adapter.filesDir];
  }
  return [];
}

function toTitleCase(value: string): string {
  return value
    .split(/[-_]/g)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
