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
      imports: `import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { createAgentApp } from "@lucid-agents/hono";`,
      preSetup: `const agentBuilder = createAgent({
  name: process.env.AGENT_NAME,
  version: process.env.AGENT_VERSION,
  description: process.env.AGENT_DESCRIPTION,
});

agentBuilder.use(http());`,
      appCreation: `const agent = await agentBuilder.build();

const { app, addEntrypoint } = await createAgentApp(agent);`,
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
      imports: `import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { createAgentApp } from "@lucid-agents/express";`,
      preSetup: `const agent = createAgent({
  name: process.env.AGENT_NAME,
  version: process.env.AGENT_VERSION,
  description: process.env.AGENT_DESCRIPTION,
});

agent.use(http());`,
      appCreation: `const { app, addEntrypoint } = await createAgentApp(agent);`,
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
      imports: `import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { createTanStackRuntime } from "@lucid-agents/tanstack";`,
      preSetup: `const agent = createAgent({
  name: process.env.AGENT_NAME,
  version: process.env.AGENT_VERSION,
  description: process.env.AGENT_DESCRIPTION,
});

agent.use(http());`,
      appCreation: `const tanstack = await createTanStackRuntime(agent);

const { handlers, runtime } = tanstack;`,
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
      exports: `export { agent: runtime.agent, handlers, app: runtime };`,
    },
  },
  'tanstack-headless': {
    id: 'tanstack-headless',
    displayName: 'TanStack Start (Headless)',
    filesDir: join(ADAPTER_FILES_ROOT, 'tanstack', 'headless'),
    placeholderTargets: ['src/lib/agent.ts.template'],
    snippets: {
      imports: `import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { createTanStackRuntime } from "@lucid-agents/tanstack";`,
      preSetup: `const agent = createAgent({
  name: process.env.AGENT_NAME,
  version: process.env.AGENT_VERSION,
  description: process.env.AGENT_DESCRIPTION,
});

agent.use(http());`,
      appCreation: `const tanstack = await createTanStackRuntime(agent);

const { handlers, runtime } = tanstack;`,
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
      exports: `export { agent: runtime.agent, handlers, app: runtime };`,
    },
  },
  next: {
    id: 'next',
    displayName: 'Next.js',
    filesDir: join(ADAPTER_FILES_ROOT, 'next'),
    placeholderTargets: ['lib/agent.ts.template'],
    snippets: {
      imports: `import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";`,
      preSetup: `const agent = createAgent({
  name: process.env.AGENT_NAME,
  version: process.env.AGENT_VERSION,
  description: process.env.AGENT_DESCRIPTION,
});

agent.use(http());`,
      appCreation: `const builtAgent = await agent.build();

const { agent: agentCore, handlers, entrypoints } = builtAgent;

const addEntrypoint = (def: typeof entrypoints.snapshot()[number]) => {
  entrypoints.add(def);
};`,
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
      exports: `export { agent: agentCore, handlers, app: builtAgent };`,
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
