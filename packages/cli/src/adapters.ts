import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ADAPTER_FILES_ROOT = join(PACKAGE_ROOT, 'adapters');

export type AdapterSnippets = {
  imports: string;
  preSetup: string;
  appCreation: string;
  entrypointRegistration: string;
  postSetup: string;
  exports: string;
};

export type AdapterDefinition = {
  id: string;
  displayName: string;
  filesDir: string;
  placeholderTargets?: string[];
  snippets: AdapterSnippets;
  buildReplacements?: (params: {
    answers: Map<string, string | boolean>;
    templateId?: string;
  }) => Record<string, string>;
};

const adapterDefinitions: Record<string, AdapterDefinition> = {
  hono: {
    id: 'hono',
    displayName: 'Hono',
    filesDir: join(ADAPTER_FILES_ROOT, 'hono'),
    placeholderTargets: ['src/lib/agent.ts.template'],
    snippets: {
      imports: `import { createAgentApp } from "@lucid-agents/hono";`,
      preSetup: ``,
      appCreation: `const { app, runtime, addEntrypoint } = createAgentApp(
  {
    name: process.env.AGENT_NAME,
    version: process.env.AGENT_VERSION,
    description: process.env.AGENT_DESCRIPTION,
  },
  typeof appOptions !== 'undefined' ? appOptions : {}
);`,
      entrypointRegistration: `addEntrypoint({
  key: "echo",
  description: "Echo input text",
  input: z.object({
    text: z.string().min(1, "Please provide some text."),
  }),
  handler: async ({ input }) => {
    return {
      output: {
        text: input.text,
      },
    };
  },
});`,
      postSetup: ``,
      exports: `export { app };`,
    },
  },
  express: {
    id: 'express',
    displayName: 'Express',
    filesDir: join(ADAPTER_FILES_ROOT, 'express'),
    placeholderTargets: ['src/lib/agent.ts.template'],
    snippets: {
      imports: `import { createAgentApp } from "@lucid-agents/express";`,
      preSetup: ``,
      appCreation: `const { app, runtime, addEntrypoint } = createAgentApp(
  {
    name: process.env.AGENT_NAME,
    version: process.env.AGENT_VERSION,
    description: process.env.AGENT_DESCRIPTION,
  },
  typeof appOptions !== 'undefined' ? appOptions : {}
);`,
      entrypointRegistration: `addEntrypoint({
  key: "echo",
  description: "Echo input text",
  input: z.object({
    text: z.string().min(1, "Please provide some text."),
  }),
  handler: async ({ input }) => {
    return {
      output: {
        text: input.text,
      },
    };
  },
});`,
      postSetup: ``,
      exports: `export { app };`,
    },
  },
  'tanstack-ui': {
    id: 'tanstack-ui',
    displayName: 'TanStack Start (UI)',
    filesDir: join(ADAPTER_FILES_ROOT, 'tanstack', 'ui'),
    placeholderTargets: ['src/lib/agent.ts.template'],
    snippets: {
      imports: `import { createTanStackRuntime } from "@lucid-agents/tanstack";`,
      preSetup: ``,
      appCreation: `const tanstack = createTanStackRuntime(
  {
    name: process.env.AGENT_NAME,
    version: process.env.AGENT_VERSION,
    description: process.env.AGENT_DESCRIPTION,
  },
  typeof appOptions !== 'undefined' ? appOptions : {}
);

const { runtime, handlers } = tanstack;`,
      entrypointRegistration: `runtime.entrypoints.add({
  key: "echo",
  description: "Echo input text",
  input: z.object({
    text: z.string().min(1, "Please provide some text."),
  }),
  handler: async ({ input }) => {
    return {
      output: {
        text: input.text,
      },
    };
  },
});`,
      postSetup: ``,
      exports: `const { agent } = runtime;

export { agent, handlers, runtime };`,
    },
  },
  'tanstack-headless': {
    id: 'tanstack-headless',
    displayName: 'TanStack Start (Headless)',
    filesDir: join(ADAPTER_FILES_ROOT, 'tanstack', 'headless'),
    placeholderTargets: ['src/lib/agent.ts.template'],
    snippets: {
      imports: `import { createTanStackRuntime } from "@lucid-agents/tanstack";`,
      preSetup: ``,
      appCreation: `const tanstack = createTanStackRuntime(
  {
    name: process.env.AGENT_NAME,
    version: process.env.AGENT_VERSION,
    description: process.env.AGENT_DESCRIPTION,
  },
  typeof appOptions !== 'undefined' ? appOptions : {}
);

const { runtime, handlers } = tanstack;`,
      entrypointRegistration: `runtime.entrypoints.add({
  key: "echo",
  description: "Echo input text",
  input: z.object({
    text: z.string().min(1, "Please provide some text."),
  }),
  handler: async ({ input }) => {
    return {
      output: {
        text: input.text,
      },
    };
  },
});`,
      postSetup: ``,
      exports: `const { agent } = runtime;

export { agent, handlers, runtime };`,
    },
  },
  next: {
    id: 'next',
    displayName: 'Next.js',
    filesDir: join(ADAPTER_FILES_ROOT, 'next'),
    placeholderTargets: ['lib/agent.ts.template'],
    snippets: {
      imports: `import { createAgentHttpRuntime } from "@lucid-agents/core";`,
      preSetup: ``,
      appCreation: `const runtime = createAgentHttpRuntime(
  {
    name: process.env.AGENT_NAME,
    version: process.env.AGENT_VERSION,
    description: process.env.AGENT_DESCRIPTION,
  },
  typeof appOptions !== 'undefined' ? appOptions : {}
);

const { agent, handlers, addEntrypoint } = runtime;`,
      entrypointRegistration: `addEntrypoint({
  key: "echo",
  description: "Echo input text",
  input: z.object({
    text: z.string().min(1, "Please provide some text."),
  }),
  handler: async ({ input }) => {
    return {
      output: {
        text: input.text,
      },
    };
  },
});`,
      postSetup: ``,
      exports: `export { agent, handlers, runtime };`,
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

function toTitleCase(value: string): string {
  return value
    .split(/[-_]/g)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
