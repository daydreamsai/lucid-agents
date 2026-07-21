import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ADAPTER_FILES_ROOT = join(PACKAGE_ROOT, 'adapters');

type AdapterSnippets = {
  imports: string;
  preSetup: string;
  appCreation: string;
  entrypointRegistration: string;
  postSetup: string;
  exports: string;
};

type DeploymentDefinition = {
  templateIds: string[];
  filesDir: string;
  readmePath: string;
  replacementTargets: string[];
  package: {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
};

export type AdapterDefinition = {
  id: string;
  displayName: string;
  /** Base layers copied in order before the adapter-specific overlay. */
  baseFilesDirs?: string[];
  filesDir: string;
  placeholderTargets?: string[];
  /** Public base path used by generated HTTP handlers. */
  httpBasePath?: string;
  snippets: AdapterSnippets;
  deployment?: DeploymentDefinition;
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
    deployment: {
      templateIds: ['blank'],
      filesDir: join(ADAPTER_FILES_ROOT, 'hono-cloudflare'),
      readmePath: join(ADAPTER_FILES_ROOT, 'hono-cloudflare', 'README.md'),
      replacementTargets: ['lucid.deploy.json', 'wrangler.jsonc'],
      package: {
        scripts: {
          deploy: 'lucid-deploy',
        },
        devDependencies: {
          '@lucid-agents/deploy': 'latest',
          wrangler: '4.113.0',
        },
      },
    },
    snippets: {
      imports: `import { createAgentApp } from "@lucid-agents/hono";`,
      preSetup: ``,
      appCreation: `const { app, addEntrypoint } = await createAgentApp(agent);`,
      entrypointRegistration: `const inputSchema = z.object({
  text: z.string().min(1, "Please provide some text."),
});

addEntrypoint({
  key: "echo",
  description: "Echo input text",
  input: inputSchema,
  handler: async (ctx) => {
    const input = ctx.input as z.infer<typeof inputSchema>;
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
      appCreation: `const { app, addEntrypoint } = await createAgentApp(agent);`,
      entrypointRegistration: `const inputSchema = z.object({
  text: z.string().min(1, "Please provide some text."),
});

addEntrypoint({
  key: "echo",
  description: "Echo input text",
  input: inputSchema,
  handler: async (ctx) => {
    const input = ctx.input as z.infer<typeof inputSchema>;
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
    baseFilesDirs: [
      join(ADAPTER_FILES_ROOT, 'tanstack', 'headless'),
      join(ADAPTER_FILES_ROOT, 'ui'),
    ],
    filesDir: join(ADAPTER_FILES_ROOT, 'tanstack', 'ui'),
    placeholderTargets: ['src/lib/agent.ts.template'],
    httpBasePath: '/api/agent',
    snippets: {
      imports: `import { createTanStackRuntime } from "@lucid-agents/tanstack";`,
      preSetup: ``,
      appCreation: `const tanstack = await createTanStackRuntime(agent);

const { handlers, runtime } = tanstack;`,
      entrypointRegistration: `const inputSchema = z.object({
  text: z.string().min(1, "Please provide some text."),
});

runtime.entrypoints.add({
  key: "echo",
  description: "Echo input text",
  input: inputSchema,
  handler: async (ctx) => {
    const input = ctx.input as z.infer<typeof inputSchema>;
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
  'tanstack-headless': {
    id: 'tanstack-headless',
    displayName: 'TanStack Start (Headless)',
    filesDir: join(ADAPTER_FILES_ROOT, 'tanstack', 'headless'),
    placeholderTargets: ['src/lib/agent.ts.template'],
    httpBasePath: '/api/agent',
    snippets: {
      imports: `import { createTanStackRuntime } from "@lucid-agents/tanstack";`,
      preSetup: ``,
      appCreation: `const tanstack = await createTanStackRuntime(agent);

const { handlers, runtime } = tanstack;`,
      entrypointRegistration: `const inputSchema = z.object({
  text: z.string().min(1, "Please provide some text."),
});

runtime.entrypoints.add({
  key: "echo",
  description: "Echo input text",
  input: inputSchema,
  handler: async (ctx) => {
    const input = ctx.input as z.infer<typeof inputSchema>;
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
  next: {
    id: 'next',
    displayName: 'Next.js',
    baseFilesDirs: [join(ADAPTER_FILES_ROOT, 'ui', 'src')],
    filesDir: join(ADAPTER_FILES_ROOT, 'next'),
    placeholderTargets: ['lib/agent.ts.template'],
    httpBasePath: '/api/agent',
    snippets: {
      imports: ``,
      preSetup: ``,
      appCreation: `const runtime = agent;
const agentCore = runtime.agent;
const { handlers } = runtime.http;

const addEntrypoint = (def: Parameters<typeof runtime.entrypoints.add>[0]) => {
  runtime.entrypoints.add(def);
};`,
      entrypointRegistration: `const inputSchema = z.object({
  text: z.string().min(1, "Please provide some text."),
});

addEntrypoint({
  key: "echo",
  description: "Echo input text",
  input: inputSchema,
  handler: async (ctx) => {
    const input = ctx.input as z.infer<typeof inputSchema>;
    return {
      output: {
        text: input.text,
      },
    };
  },
});`,
      postSetup: ``,
      exports: `export { agentCore as agent, handlers, runtime, runtime as app };`,
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
