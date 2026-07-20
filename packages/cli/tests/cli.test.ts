import { afterEach, describe, expect, it } from 'bun:test';
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAdapterDefinition } from '../src/adapters.js';
import { runCli, type PromptApi } from '../src/index.js';

const tempPaths: string[] = [];

afterEach(async () => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (!dir) continue;
    await rm(dir, { recursive: true, force: true });
  }
});

const createTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'create-agent-kit-'));
  tempPaths.push(dir);
  return dir;
};

const createLogger = () => {
  const messages: string[] = [];
  const logger = {
    log: (message: string) => {
      messages.push(message);
    },
    warn: (message: string) => {
      messages.push(message);
    },
    error: (message: string) => {
      messages.push(message);
    },
  };

  return { logger, messages };
};

const getRepoTemplatePath = (id: string) => {
  const currentDir = fileURLToPath(new URL('..', import.meta.url));
  return resolve(currentDir, 'templates', id);
};

const createTemplateRoot = async (templateIds: string[]) => {
  const root = await createTempDir();
  for (const id of templateIds) {
    const target = join(root, id);
    await cp(getRepoTemplatePath('blank'), target, { recursive: true });
    const templateMetaPath = join(target, 'template.json');
    const existingMetaRaw = await readFile(templateMetaPath, 'utf8');
    const existingMeta = JSON.parse(existingMetaRaw) as Record<string, unknown>;
    const updatedMeta = {
      ...existingMeta,
      id,
      name: `Template ${id}`,
      description: `The ${id} template`,
    };
    await writeFile(
      templateMetaPath,
      JSON.stringify(updatedMeta, null, 2),
      'utf8'
    );
    const readmePath = join(target, 'README.md');
    const originalReadme = await readFile(readmePath, 'utf8');
    await writeFile(
      readmePath,
      `${originalReadme}\n<!-- template:${id} -->\n`,
      'utf8'
    );
  }
  return root;
};

const readJson = async (path: string) => {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
};

const setAdaptersForTemplates = async (
  root: string,
  templateIds: string[],
  adapters: string[]
) => {
  await Promise.all(
    templateIds.map(async id => {
      const metaPath = join(root, id, 'template.json');
      const raw = await readFile(metaPath, 'utf8');
      const meta = JSON.parse(raw) as Record<string, unknown>;
      await writeFile(
        metaPath,
        JSON.stringify(
          {
            ...meta,
            adapters,
          },
          null,
          2
        ),
        'utf8'
      );
    })
  );
};

const updateTemplateMetadata = async (
  root: string,
  id: string,
  update: (metadata: Record<string, unknown>) => Record<string, unknown>
) => {
  const metaPath = join(root, id, 'template.json');
  const metadata = await readJson(metaPath);
  await writeFile(metaPath, JSON.stringify(update(metadata), null, 2), 'utf8');
};

describe('create-agent-kit CLI', () => {
  it('scaffolds a new project with wizard defaults', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(['demo-agent', '--template=blank', '--wizard=no'], {
      cwd,
      logger,
    });

    const projectDir = join(cwd, 'demo-agent');
    const pkg = await readJson(join(projectDir, 'package.json'));
    const readme = await readFile(join(projectDir, 'README.md'), 'utf8');
    const agentSrc = await readFile(
      join(projectDir, 'src/lib/agent.ts'),
      'utf8'
    );
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    expect(pkg.name).toBe('demo-agent');
    expect(readme).toContain('demo-agent');
    expect(readme).not.toContain('{{');

    // agent.ts uses process.env and extension API
    expect(agentSrc).toContain('createAgent');
    expect(agentSrc).toContain('process.env.AGENT_NAME');
    expect(agentSrc).toContain('process.env.AGENT_VERSION');
    expect(agentSrc).toContain('process.env.AGENT_DESCRIPTION');
    expect(agentSrc).toContain('key: "echo"');
    expect(agentSrc).toContain('http');
    expect(agentSrc).not.toContain('{{');

    // .env has defaults from template.json
    expect(envFile).toContain('AGENT_NAME=demo-agent');
    expect(envFile).toContain('AGENT_VERSION=0.1.0');
    expect(envFile).toContain('PAYMENTS_RECEIVABLE_ADDRESS=');
    expect(envFile).toContain('DEVELOPER_WALLET_PRIVATE_KEY=');
  });

  it('applies wizard answers to generate .env file', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();
    const inputResponses = new Map<string, string>([
      ['How would you describe your agent?', 'Quote assistant for pricing.'],
      ['What version should the agent start at?', '1.0.0'],
      ['Facilitator URL', 'https://facilitator.daydreams.systems'],
      ['Payment network identifier', 'base'],
      [
        'Receivable address (address that receives payments)',
        '0xabc0000000000000000000000000000000000000',
      ],
      ['Default price (USDC)', '4200'],
      ['Wallet private key (leave empty to add later)', ''],
    ]);

    const prompt: PromptApi = {
      select: async ({ choices, message }) => {
        // Select 'base' network when asked about payment network
        if (message?.toLowerCase().includes('network')) {
          const baseChoice = choices.find(c => c.value === 'base');
          if (baseChoice) return baseChoice.value;
        }
        return choices[0]?.value ?? '';
      },
      confirm: async ({ defaultValue }) => defaultValue ?? false,
      input: async ({ message, defaultValue = '' }) =>
        inputResponses.get(message) ?? defaultValue,
    };

    await runCli(['quote-agent', '--template=blank'], {
      cwd,
      logger,
      prompt,
    });

    const projectDir = join(cwd, 'quote-agent');
    const agentSrc = await readFile(
      join(projectDir, 'src/lib/agent.ts'),
      'utf8'
    );
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');
    const readme = await readFile(join(projectDir, 'README.md'), 'utf8');

    // agent.ts now uses process.env and extension API
    expect(agentSrc).toContain('createAgent');
    expect(agentSrc).toContain('process.env.AGENT_NAME');
    expect(agentSrc).toContain('process.env.AGENT_VERSION');
    expect(agentSrc).toContain('process.env.AGENT_DESCRIPTION');
    expect(agentSrc).toContain('key: "echo"');
    expect(agentSrc).toContain('http');

    // .env contains wizard answers
    expect(envFile).toContain('AGENT_NAME=quote-agent');
    expect(envFile).toContain('AGENT_VERSION=1.0.0');
    expect(envFile).toContain('AGENT_DESCRIPTION=Quote assistant for pricing.');
    expect(envFile).toContain(
      'PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems'
    );
    expect(envFile).toContain('PAYMENTS_FACILITATOR_AUTH=');
    expect(envFile).toContain(
      'PAYMENTS_RECEIVABLE_ADDRESS=0xabc0000000000000000000000000000000000000'
    );
    expect(envFile).toContain('PAYMENTS_NETWORK=base');
    expect(envFile).toContain('DEVELOPER_WALLET_PRIVATE_KEY=');

    // README uses agent name
    expect(readme).toContain('quote-agent');
  });

  it('supports stripe destination mode in wizard flow', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();
    const inputResponses = new Map<string, string>([
      ['How would you describe your agent?', 'Stripe-native agent'],
      ['What version should the agent start at?', '1.2.3'],
      ['Facilitator URL', 'https://facilitator.daydreams.systems'],
      ['Facilitator auth token (optional, defaults to DREAMS_AUTH_TOKEN)', ''],
      [
        'Stripe secret key (required for Stripe destination mode)',
        'sk_test_123',
      ],
      [
        'Developer wallet private key (optional, for contract interactions)',
        '',
      ],
      ['OpenAI API key (leave empty to add later)', ''],
      ['WalletConnect project ID (leave empty to add later)', ''],
    ]);

    const prompt: PromptApi = {
      select: async ({ message, choices }) => {
        if (message.toLowerCase().includes('payment destination mode')) {
          const stripe = choices.find(c => c.value === 'stripe');
          if (stripe) return stripe.value;
        }
        if (message.toLowerCase().includes('payment network')) {
          const ethereum = choices.find(c => c.value === 'ethereum');
          if (ethereum) return ethereum.value;
        }
        return choices[0]?.value ?? '';
      },
      confirm: async ({ defaultValue }) => defaultValue ?? false,
      input: async ({ message, defaultValue = '' }) =>
        inputResponses.get(message) ?? defaultValue,
    };

    await runCli(['stripe-agent', '--template=blank'], {
      cwd,
      logger,
      prompt,
    });

    const envFile = await readFile(join(cwd, 'stripe-agent', '.env'), 'utf8');
    expect(envFile).toContain('PAYMENTS_DESTINATION=stripe');
    expect(envFile).toContain('STRIPE_SECRET_KEY=sk_test_123');
    expect(envFile).toContain('PAYMENTS_NETWORK=base');
    expect(envFile).not.toContain('PAYMENTS_RECEIVABLE_ADDRESS=');
  });

  it('forces PAYMENTS_NETWORK=base when stripe destination is passed via CLI args', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['blank']);
    const { logger } = createLogger();

    await runCli(
      [
        'stripe-cli-agent',
        '--template=blank',
        '--wizard=no',
        '--PAYMENTS_DESTINATION=stripe',
        '--STRIPE_SECRET_KEY=sk_test_123',
      ],
      {
        cwd,
        logger,
        templateRoot,
      }
    );

    const envFile = await readFile(
      join(cwd, 'stripe-cli-agent', '.env'),
      'utf8'
    );
    expect(envFile).toContain('PAYMENTS_DESTINATION=stripe');
    expect(envFile).toContain('PAYMENTS_NETWORK=base');
  });

  it('honors the --adapter flag to select a runtime framework', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['blank']);
    const { logger } = createLogger();

    await runCli(['demo-agent', '--adapter=tanstack-ui', '--wizard=no'], {
      cwd,
      logger,
      templateRoot,
    });

    const projectDir = join(cwd, 'demo-agent');
    const tanstackAgent = await readFile(
      join(projectDir, 'src/lib/agent.ts'),
      'utf8'
    );
    const canonicalCardRoute = await readFile(
      join(
        projectDir,
        'src/routes/api/agent/[.]well-known/agent-card[.]json.ts'
      ),
      'utf8'
    );
    const canonicalLegacyCardRoute = await readFile(
      join(projectDir, 'src/routes/api/agent/[.]well-known/agent[.]json.ts'),
      'utf8'
    );
    const canonicalOasfRoute = await readFile(
      join(
        projectDir,
        'src/routes/api/agent/[.]well-known/oasf-record[.]json.ts'
      ),
      'utf8'
    );
    const landingRoute = await readFile(
      join(projectDir, 'src/routes/api/agent/index.ts'),
      'utf8'
    );
    const faviconRoute = await readFile(
      join(projectDir, 'src/routes/api/agent/favicon[.]svg.ts'),
      'utf8'
    );
    const routeTree = await readFile(
      join(projectDir, 'src/routeTree.gen.ts'),
      'utf8'
    );
    const dashboardRoute = await readFile(
      join(projectDir, 'src/routes/index.tsx'),
      'utf8'
    );
    const [, storefront, serviceStyles] = await Promise.all([
      readFile(join(projectDir, 'src/lib/service-client.ts'), 'utf8'),
      readFile(
        join(projectDir, 'src/components/service-storefront.tsx'),
        'utf8'
      ),
      readFile(join(projectDir, 'src/styles/service.css'), 'utf8'),
    ]);
    const startTypes = await readFile(
      join(projectDir, 'src/tanstack-start.d.ts'),
      'utf8'
    );
    const pkg = (await readJson(join(projectDir, 'package.json'))) as Record<
      string,
      unknown
    >;
    const deps = (pkg.dependencies ?? {}) as Record<string, unknown>;
    const devDeps = (pkg.devDependencies ?? {}) as Record<string, unknown>;

    expect(tanstackAgent).toContain('createAgent');
    expect(tanstackAgent).toContain('createTanStackRuntime');
    expect(tanstackAgent).toContain('basePath: "/api/agent"');
    expect(canonicalCardRoute).toContain('handlers.manifest({ request })');
    expect(canonicalLegacyCardRoute).toContain(
      'handlers.manifest({ request })'
    );
    expect(canonicalOasfRoute).toContain('runtime.http.handlers.oasf(request)');
    expect(landingRoute).toContain('handlers.landing?.({ request })');
    expect(faviconRoute).toContain('handlers.favicon({ request })');
    expect(routeTree).toContain("'/api/agent/'");
    expect(routeTree).toContain('/api/agent/favicon.svg');
    expect(routeTree).not.toContain("'/about'");
    expect(dashboardRoute).toContain('buildServicePageModel');
    expect(dashboardRoute).toContain('handlers.manifest');
    expect(dashboardRoute).not.toContain('runtime.entrypoints');
    expect(dashboardRoute).not.toContain('runtime.agent.config.meta');
    expect(serviceStyles).toContain('color-scheme: dark');
    expect(serviceStyles).toContain('font-family: var(--service-mono)');
    expect(storefront).not.toContain('service-monogram');
    expect(storefront).not.toContain('service-icon');
    expect(startTypes).toContain("import type {} from '@tanstack/react-start'");
    await expect(
      readFile(join(projectDir, 'src/routes/about.tsx'), 'utf8')
    ).rejects.toThrow();
    expect(routeTree).toContain('/api/agent/.well-known/agent-card.json');
    expect(routeTree).toContain('/api/agent/.well-known/agent.json');
    expect(routeTree).toContain('/api/agent/.well-known/oasf-record.json');
    expect(
      Object.prototype.hasOwnProperty.call(deps, '@lucid-agents/tanstack')
    ).toBe(true);
    expect(deps['@wagmi/connectors']).toBe('6.2.0');
    expect(deps['@wagmi/core']).toBe('2.22.1');
    expect(deps['@x402/svm']).toBe('2.2.0');
    expect(deps['@lucid-agents/types']).toBe('latest');
    expect(deps['@tailwindcss/vite']).toBeUndefined();
    expect(devDeps['@tailwindcss/vite']).toBe('^4.1.16');
    expect((pkg.scripts as Record<string, string>).start).toBe(
      'node --env-file=.env .output/server/index.mjs'
    );
    expect(Object.values(deps)).not.toContain('catalog:');
    expect(Object.values(deps)).not.toContain('workspace:*');
    expect(getAdapterDefinition('tanstack-ui').baseFilesDirs).toHaveLength(2);
  });

  it('scaffolds projects with the Next.js adapter', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['blank']);
    const { logger } = createLogger();

    await runCli(['demo-agent', '--adapter=next', '--wizard=no'], {
      cwd,
      logger,
      templateRoot,
    });

    const projectDir = join(cwd, 'demo-agent');
    const agentSrc = await readFile(join(projectDir, 'lib/agent.ts'), 'utf8');
    const invokeRouteSrc = await readFile(
      join(projectDir, 'app/api/agent/entrypoints/[key]/invoke/route.ts'),
      'utf8'
    );
    const taskRouteSrc = await readFile(
      join(projectDir, 'app/api/agent/tasks/route.ts'),
      'utf8'
    );
    const cardRouteSrc = await readFile(
      join(projectDir, 'app/.well-known/agent-card.json/route.ts'),
      'utf8'
    );
    const legacyCardRouteSrc = await readFile(
      join(projectDir, 'app/.well-known/agent.json/route.ts'),
      'utf8'
    );
    const oasfRouteSrc = await readFile(
      join(projectDir, 'app/.well-known/oasf-record.json/route.ts'),
      'utf8'
    );
    const canonicalCardRouteSrc = await readFile(
      join(projectDir, 'app/api/agent/.well-known/agent-card.json/route.ts'),
      'utf8'
    );
    const canonicalLegacyCardRouteSrc = await readFile(
      join(projectDir, 'app/api/agent/.well-known/agent.json/route.ts'),
      'utf8'
    );
    const canonicalOasfRouteSrc = await readFile(
      join(projectDir, 'app/api/agent/.well-known/oasf-record.json/route.ts'),
      'utf8'
    );
    const landingRouteSrc = await readFile(
      join(projectDir, 'app/api/agent/route.ts'),
      'utf8'
    );
    const faviconRouteSrc = await readFile(
      join(projectDir, 'app/api/agent/favicon.svg/route.ts'),
      'utf8'
    );
    const [, storefront] = await Promise.all([
      readFile(join(projectDir, 'lib/service-client.ts'), 'utf8'),
      readFile(join(projectDir, 'components/service-storefront.tsx'), 'utf8'),
    ]);
    const appKitProviderSrc = await readFile(
      join(projectDir, 'components/AppKitProvider.tsx'),
      'utf8'
    );
    const pageSrc = await readFile(join(projectDir, 'app/page.tsx'), 'utf8');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');
    const pkg = (await readJson(join(projectDir, 'package.json'))) as Record<
      string,
      any
    >;

    expect(agentSrc).toContain('createAgent');
    expect(agentSrc).toContain('basePath: "/api/agent"');
    expect(agentSrc).toContain('const { handlers } = runtime.http');
    expect(agentSrc).not.toContain('resolveManifest');
    expect(invokeRouteSrc).toContain('handlers.invoke');
    expect(taskRouteSrc).toContain('handlers.tasks');
    expect(cardRouteSrc).toContain('handlers.manifest(request)');
    expect(legacyCardRouteSrc).toContain('handlers.manifest(request)');
    expect(oasfRouteSrc).toContain('handlers.oasf(request)');
    expect(canonicalCardRouteSrc).toContain('handlers.manifest(request)');
    expect(canonicalLegacyCardRouteSrc).toContain('handlers.manifest(request)');
    expect(canonicalOasfRouteSrc).toContain('handlers.oasf(request)');
    expect(landingRouteSrc).toContain('handlers.landing?.(request)');
    expect(faviconRouteSrc).toContain('handlers.favicon(request)');
    expect(appKitProviderSrc).toContain("projectId: projectId ?? ''");
    expect(appKitProviderSrc).not.toContain(
      'NEXT_PUBLIC_PROJECT_ID or NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID is required'
    );
    expect(pageSrc).toContain('buildServicePageModel');
    expect(pageSrc).toContain('handlers.manifest');
    expect(pageSrc).not.toContain('runtime.manifest');
    expect(storefront).not.toContain('service-monogram');
    expect(storefront).not.toContain('service-icon');
    await expect(
      readFile(join(projectDir, 'proxy.ts'), 'utf8')
    ).rejects.toThrow();
    await expect(
      readFile(join(projectDir, 'lib/paywall.ts'), 'utf8')
    ).rejects.toThrow();
    expect(pkg.dependencies?.next).toBeDefined();
    expect(pkg.dependencies?.['@wagmi/connectors']).toBe('6.2.0');
    expect(pkg.dependencies?.['@wagmi/core']).toBe('2.22.1');
    expect(pkg.dependencies?.['@x402/svm']).toBe('2.2.0');
    expect(pkg.dependencies?.['@lucid-agents/types']).toBe('latest');
    expect(pkg.dependencies?.['@x402/next']).toBeUndefined();
    expect(Object.values(pkg.dependencies ?? {})).not.toContain('catalog:');
    expect(Object.values(pkg.dependencies ?? {})).not.toContain('workspace:*');
    expect(envFile).toContain('OPENAI_API_KEY=');
    expect(envFile).toContain('NEXT_PUBLIC_PROJECT_ID=');
  });

  it('generates tanstack projects without leftover template tokens', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['blank']);
    const { logger } = createLogger();

    await runCli(['demo-agent', '--adapter=tanstack-ui', '--wizard=no'], {
      cwd,
      logger,
      templateRoot,
    });

    const projectDir = join(cwd, 'demo-agent');
    const filesToCheck = ['src/agent.ts', 'src/lib/agent.ts', '.env'];
    let checked = 0;
    for (const file of filesToCheck) {
      try {
        const contents = await readFile(join(projectDir, file), 'utf8');
        checked += 1;
        expect(contents).not.toContain('{{');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('supports the tanstack headless adapter mode', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['blank']);
    const { logger } = createLogger();

    await runCli(
      [
        'headless-agent',
        '--template=blank',
        '--adapter=tanstack-headless',
        '--wizard=no',
      ],
      { cwd, logger, templateRoot }
    );

    const projectDir = join(cwd, 'headless-agent');
    const componentsDir = join(projectDir, 'src/components');
    const indexRoute = await readFile(
      join(projectDir, 'src/routes/index.tsx'),
      'utf8'
    );
    const startTypes = await readFile(
      join(projectDir, 'src/tanstack-start.d.ts'),
      'utf8'
    );
    const pkg = (await readJson(join(projectDir, 'package.json'))) as Record<
      string,
      unknown
    >;

    await expect(readdir(componentsDir)).rejects.toThrow();
    expect(indexRoute).toContain('ApiDirectory');
    expect(indexRoute).toContain('handlers.manifest');
    expect(indexRoute).not.toContain('runtime.entrypoints');
    expect(startTypes).toContain("import type {} from '@tanstack/react-start'");
    expect((pkg.scripts as Record<string, string>).start).toBe(
      'node --env-file=.env .output/server/index.mjs'
    );
  });

  it('prompts for a project name when not provided and prompt is available', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    const prompt: PromptApi = {
      select: async ({ choices }) => choices[0]?.value ?? '',
      confirm: async () => false,
      input: async ({ message, defaultValue = '' }) =>
        message === 'Project directory name:' ? 'prompted-agent' : defaultValue,
    };

    await runCli(['--template=blank'], {
      cwd,
      logger,
      prompt,
    });

    const projectDir = join(cwd, 'prompted-agent');
    const pkg = await readJson(join(projectDir, 'package.json'));

    expect(pkg.name).toBe('prompted-agent');
  });

  it('falls back to a default project name when not provided in non-interactive mode', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(['--template=blank', '--wizard=no'], {
      cwd,
      logger,
    });

    const projectDir = join(cwd, 'blank-agent');
    const pkg = await readJson(join(projectDir, 'package.json'));

    expect(pkg.name).toBe('blank-agent');
  });

  it('refuses to scaffold into a non-empty directory', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();
    const targetDir = join(cwd, 'existing');
    await mkdir(targetDir);
    await writeFile(join(targetDir, 'README.md'), 'hello');

    await expect(
      runCli(['existing', '--template=blank', '--wizard=no'], { cwd, logger })
    ).rejects.toThrow(/already exists and is not empty/);
  });

  it('prints help and exits early when --help is passed', async () => {
    const cwd = await createTempDir();
    const { logger, messages } = createLogger();

    await runCli(['--help'], { cwd, logger });

    expect(messages.join('\n')).toContain(
      'Usage: bunx @lucid-agents/cli <app-name>'
    );
    const entries = await readdir(cwd);
    expect(entries.length).toBe(0);
  });

  it('generates .env from wizard answers with defaults', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['blank']);
    const { logger } = createLogger();

    const prompt: PromptApi = {
      select: async ({ choices }) => choices[0]?.value ?? '',
      confirm: async () => false,
      input: async ({ message: _message, defaultValue = '' }) => {
        // Just use defaults for all inputs
        return defaultValue;
      },
    };

    await runCli(['env-agent'], { cwd, logger, prompt, templateRoot });

    const projectDir = join(cwd, 'env-agent');
    const env = await readFile(join(projectDir, '.env'), 'utf8');

    // Should have values from wizard (defaults in this case)
    expect(env).toContain('AGENT_NAME=env-agent');
    expect(env).toContain('PAYMENTS_NETWORK=ethereum');
    expect(env).toContain(
      'PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems'
    );
    expect(env).toContain('PAYMENTS_FACILITATOR_AUTH=');
    expect(env).toContain('DEVELOPER_WALLET_PRIVATE_KEY=');
  });

  it('requires --template when multiple templates and no prompt', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['alpha', 'beta']);
    await setAdaptersForTemplates(templateRoot, ['alpha', 'beta'], ['hono']);
    const { logger } = createLogger();

    await expect(
      runCli(['project'], { cwd, logger, templateRoot })
    ).rejects.toThrow(/Multiple templates available/);
  });

  it('allows selecting template via prompt', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['alpha', 'beta']);
    await setAdaptersForTemplates(templateRoot, ['alpha', 'beta'], ['hono']);
    const { logger } = createLogger();

    const prompt: PromptApi = {
      select: async ({ choices }) => {
        // Handle template selection (returns 'beta')
        const betaChoice = choices.find(c => c.value === 'beta');
        if (betaChoice) return betaChoice.value;
        // Handle network selection (return first choice - base-sepolia)
        return choices[0]?.value || '';
      },
      confirm: async () => false,
      input: async ({ defaultValue = '' }) => defaultValue,
    };

    await runCli(['project'], { cwd, logger, templateRoot, prompt });

    const projectDir = join(cwd, 'project');
    const readme = await readFile(join(projectDir, 'README.md'), 'utf8');
    expect(readme).toContain('<!-- template:beta -->');
  });

  it('does not invoke prompt API when --wizard=no is used', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    // Create a prompt that throws if any method is called
    const prompt: PromptApi = {
      select: async () => {
        throw new Error('select() should not be called with --wizard=no');
      },
      confirm: async () => {
        throw new Error('confirm() should not be called with --wizard=no');
      },
      input: async () => {
        throw new Error('input() should not be called with --wizard=no');
      },
    };

    // Should not throw because prompt is never invoked
    await runCli(['no-prompt-agent', '--template=blank', '--wizard=no'], {
      cwd,
      logger,
      prompt,
    });

    // Verify project was created successfully with defaults
    const projectDir = join(cwd, 'no-prompt-agent');
    const pkg = await readJson(join(projectDir, 'package.json'));
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    expect(pkg.name).toBe('no-prompt-agent');
    expect(envFile).toContain('AGENT_NAME=no-prompt-agent');
    expect(envFile).toContain('AGENT_VERSION=0.1.0');
    expect(envFile).toContain('PAYMENTS_NETWORK=ethereum');
  });

  it('accepts template arguments via CLI flags in non-interactive mode', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(
      [
        'custom-agent',
        '--template=blank',
        '--non-interactive',
        '--AGENT_DESCRIPTION=Custom AI agent for testing',
        '--AGENT_VERSION=2.0.0',
        '--PAYMENTS_RECEIVABLE_ADDRESS=0x1234567890123456789012345678901234567890',
        '--PAYMENTS_NETWORK=ethereum-mainnet',
        '--DEVELOPER_WALLET_PRIVATE_KEY=0xabcdef',
      ],
      {
        cwd,
        logger,
      }
    );

    const projectDir = join(cwd, 'custom-agent');
    const pkg = await readJson(join(projectDir, 'package.json'));
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    expect(pkg.name).toBe('custom-agent');
    expect(envFile).toContain('AGENT_NAME=custom-agent');
    expect(envFile).toContain('AGENT_DESCRIPTION=Custom AI agent for testing');
    expect(envFile).toContain('AGENT_VERSION=2.0.0');
    expect(envFile).toContain(
      'PAYMENTS_RECEIVABLE_ADDRESS=0x1234567890123456789012345678901234567890'
    );
    expect(envFile).toContain('PAYMENTS_NETWORK=ethereum-mainnet');
    expect(envFile).toContain('DEVELOPER_WALLET_PRIVATE_KEY=0xabcdef');
  });

  it('CLI arguments override template defaults in non-interactive mode', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(
      [
        'override-agent',
        '--template=blank',
        '--non-interactive',
        '--AGENT_VERSION=3.5.1',
      ],
      {
        cwd,
        logger,
      }
    );

    const projectDir = join(cwd, 'override-agent');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    // Provided values
    expect(envFile).toContain('AGENT_VERSION=3.5.1');

    // Should still have defaults for non-provided values
    expect(envFile).toContain('AGENT_NAME=override-agent');
    expect(envFile).toContain('PAYMENTS_NETWORK=ethereum');
  });

  it('handles empty string values in CLI arguments', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(
      [
        'empty-args-agent',
        '--template=blank',
        '--non-interactive',
        '--DEVELOPER_WALLET_PRIVATE_KEY=',
        '--PAYMENTS_RECEIVABLE_ADDRESS=',
      ],
      {
        cwd,
        logger,
      }
    );

    const projectDir = join(cwd, 'empty-args-agent');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    expect(envFile).toContain('DEVELOPER_WALLET_PRIVATE_KEY=');
    expect(envFile).toContain('PAYMENTS_RECEIVABLE_ADDRESS=');
  });

  it('CLI arguments with special characters are handled correctly', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(
      [
        'special-agent',
        '--template=blank',
        '--non-interactive',
        '--AGENT_DESCRIPTION=Agent with special chars: @#$%&',
        '--PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems/api?key=test',
      ],
      {
        cwd,
        logger,
      }
    );

    const projectDir = join(cwd, 'special-agent');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    expect(envFile).toContain(
      'AGENT_DESCRIPTION=Agent with special chars: @#$%&'
    );
    expect(envFile).toContain(
      'PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems/api?key=test'
    );
  });

  it('ignores CLI arguments in interactive mode (uses wizard)', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    const prompt: PromptApi = {
      select: async ({ choices }) => choices[0]?.value ?? '',
      confirm: async () => false,
      input: async ({ message, defaultValue = '' }) => {
        if (message === 'How would you describe your agent?') {
          return 'From wizard prompt';
        }
        return defaultValue;
      },
    };

    await runCli(
      [
        'interactive-agent',
        '--template=blank',
        '--AGENT_DESCRIPTION=From CLI flag',
      ],
      {
        cwd,
        logger,
        prompt,
      }
    );

    const projectDir = join(cwd, 'interactive-agent');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    // Should use wizard value, not CLI flag (CLI flags only work in non-interactive mode)
    expect(envFile).toContain('AGENT_DESCRIPTION=From wizard prompt');
    expect(envFile).not.toContain('From CLI flag');
  });

  it('works with identity template and domain argument', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(
      [
        'identity-agent',
        '--template=identity',
        '--non-interactive',
        '--AGENT_DOMAIN=agent.example.com',
        '--RPC_URL=https://sepolia.base.org',
        '--CHAIN_ID=84532',
        '--IDENTITY_AUTO_REGISTER=false',
        '--IDENTITY_INCLUDE_A2A=true',
        '--IDENTITY_A2A_ENDPOINT=https://agent.example.com/.well-known/agent-card.json',
        '--IDENTITY_INCLUDE_WEB=true',
        '--IDENTITY_WEBSITE=https://agent.example.com/',
        '--IDENTITY_INCLUDE_OASF=true',
        '--IDENTITY_OASF_ENDPOINT=ipfs://bafy-example',
        '--IDENTITY_OASF_VERSION=0.8',
        '--IDENTITY_OASF_AUTHORS_JSON=[\"ops@agent.example.com\"]',
        '--IDENTITY_OASF_SKILLS_JSON=[\"reasoning\"]',
        '--IDENTITY_OASF_DOMAINS_JSON=[\"finance\"]',
        '--IDENTITY_OASF_MODULES_JSON=[\"https://agent.example.com/modules/core\"]',
        '--IDENTITY_OASF_LOCATORS_JSON=[\"https://agent.example.com/.well-known/oasf-record.json\"]',
        '--IDENTITY_INCLUDE_TWITTER=true',
        '--IDENTITY_TWITTER=@lucidagents',
        '--IDENTITY_INCLUDE_EMAIL=true',
        '--IDENTITY_EMAIL=ops@agent.example.com',
      ],
      {
        cwd,
        logger,
      }
    );

    const projectDir = join(cwd, 'identity-agent');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');
    const agentSrc = await readFile(
      join(projectDir, 'src/lib/agent.ts'),
      'utf8'
    );
    const pkg = await readJson(join(projectDir, 'package.json'));
    const dependencies = pkg.dependencies as Record<string, string>;

    expect(envFile).toContain('AGENT_DOMAIN=agent.example.com');
    expect(envFile).toContain('RPC_URL=https://sepolia.base.org');
    expect(envFile).toContain('CHAIN_ID=84532');
    expect(envFile).toContain('IDENTITY_AUTO_REGISTER=false');
    expect(envFile).toContain('IDENTITY_INCLUDE_A2A=true');
    expect(envFile).toContain(
      'IDENTITY_A2A_ENDPOINT=https://agent.example.com/.well-known/agent-card.json'
    );
    expect(envFile).toContain('IDENTITY_INCLUDE_WEB=true');
    expect(envFile).toContain('IDENTITY_WEBSITE=https://agent.example.com/');
    expect(envFile).toContain('IDENTITY_INCLUDE_OASF=true');
    expect(envFile).toContain('IDENTITY_OASF_ENDPOINT=ipfs://bafy-example');
    expect(envFile).toContain('IDENTITY_OASF_VERSION=0.8');
    expect(envFile).toContain(
      'IDENTITY_OASF_AUTHORS_JSON=["ops@agent.example.com"]'
    );
    expect(envFile).toContain('IDENTITY_OASF_SKILLS_JSON=["reasoning"]');
    expect(envFile).toContain('IDENTITY_OASF_DOMAINS_JSON=["finance"]');
    expect(envFile).toContain(
      'IDENTITY_OASF_MODULES_JSON=["https://agent.example.com/modules/core"]'
    );
    expect(envFile).toContain(
      'IDENTITY_OASF_LOCATORS_JSON=["https://agent.example.com/.well-known/oasf-record.json"]'
    );
    expect(envFile).toContain('IDENTITY_INCLUDE_TWITTER=true');
    expect(envFile).toContain('IDENTITY_TWITTER=@lucidagents');
    expect(envFile).toContain('IDENTITY_INCLUDE_EMAIL=true');
    expect(envFile).toContain('IDENTITY_EMAIL=ops@agent.example.com');
    expect(agentSrc).toContain('.use(payments(');
    expect(agentSrc).toContain('agent.identity?.result');
    expect(agentSrc).not.toContain('createAgentIdentity(');
    expect(dependencies['@lucid-agents/http']).toBeDefined();
    expect(dependencies['@lucid-agents/payments']).toBeDefined();
  });

  it('omits gated OASF fields when OASF is disabled', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(
      ['identity-default-agent', '--template=identity', '--non-interactive'],
      {
        cwd,
        logger,
      }
    );

    const projectDir = join(cwd, 'identity-default-agent');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    expect(envFile).toContain('IDENTITY_INCLUDE_OASF=false');
    expect(envFile).not.toContain('IDENTITY_OASF_ENDPOINT=');
    expect(envFile).not.toContain('IDENTITY_OASF_VERSION=');
    expect(envFile).not.toContain('IDENTITY_OASF_AUTHORS_JSON=');
    expect(envFile).not.toContain('IDENTITY_OASF_SKILLS_JSON=');
    expect(envFile).not.toContain('IDENTITY_OASF_DOMAINS_JSON=');
    expect(envFile).not.toContain('IDENTITY_OASF_MODULES_JSON=');
    expect(envFile).not.toContain('IDENTITY_OASF_LOCATORS_JSON=');
  });

  it('AGENTS.md and template.schema.json are copied to generated project', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(['docs-test-agent', '--template=blank', '--wizard=no'], {
      cwd,
      logger,
    });

    const projectDir = join(cwd, 'docs-test-agent');
    const agentsMd = await readFile(join(projectDir, 'AGENTS.md'), 'utf8');
    const templateSchema = await readFile(
      join(projectDir, 'template.schema.json'),
      'utf8'
    );

    // Verify AGENTS.md exists and has content
    expect(agentsMd).toContain('# Blank agent template guide');
    expect(agentsMd).toContain('Register entrypoints through');

    // Verify template.schema.json exists and is valid JSON
    const schema = JSON.parse(templateSchema);
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(schema.title).toContain('Blank Agent Template Schema');
    expect(schema.properties).toBeDefined();
    expect(schema.properties.AGENT_NAME).toBeDefined();
  });

  it('template.json is removed but AGENTS.md and template.schema.json remain', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(['artifact-test', '--template=blank', '--wizard=no'], {
      cwd,
      logger,
    });

    const projectDir = join(cwd, 'artifact-test');
    const files = await readdir(projectDir);

    // Should have AGENTS.md and template.schema.json
    expect(files).toContain('AGENTS.md');
    expect(files).toContain('template.schema.json');

    // Should NOT have template.json (it's an artifact)
    expect(files).not.toContain('template.json');
  });

  it('handles boolean false values correctly (not converting to empty string)', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(
      [
        'bool-test-agent',
        '--template=identity',
        '--non-interactive',
        '--IDENTITY_AUTO_REGISTER=false',
      ],
      {
        cwd,
        logger,
      }
    );

    const projectDir = join(cwd, 'bool-test-agent');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    // Critical: false should be "false", not empty string
    expect(envFile).toContain('IDENTITY_AUTO_REGISTER=false');
    expect(envFile).not.toContain('IDENTITY_AUTO_REGISTER=\n');

    // Also verify it's not the default (true)
    expect(envFile).not.toContain('IDENTITY_AUTO_REGISTER=true');
  });

  it('handles boolean true values correctly', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(
      [
        'bool-true-agent',
        '--template=identity',
        '--non-interactive',
        '--IDENTITY_AUTO_REGISTER=true',
      ],
      {
        cwd,
        logger,
      }
    );

    const projectDir = join(cwd, 'bool-true-agent');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    expect(envFile).toContain('IDENTITY_AUTO_REGISTER=true');
  });

  it('handles actual boolean types from confirm questions correctly', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['test-confirm']);
    const { logger } = createLogger();

    // Create a template with a confirm-type question
    const templatePath = join(templateRoot, 'test-confirm');
    const templateJson = await readJson(join(templatePath, 'template.json'));
    templateJson.wizard = {
      prompts: [
        {
          key: 'ENABLE_FEATURE',
          type: 'confirm',
          message: 'Enable feature?',
          defaultValue: true,
        },
        {
          key: 'ANOTHER_FEATURE',
          type: 'confirm',
          message: 'Another feature?',
          defaultValue: false,
        },
      ],
    };
    await writeFile(
      join(templatePath, 'template.json'),
      JSON.stringify(templateJson, null, 2),
      'utf8'
    );

    // Test with boolean false via wizard (simulates what happens with confirm types)
    const prompt: PromptApi = {
      select: async ({ choices }) => choices[0]?.value ?? '',
      confirm: async ({ message }) => {
        if (message === 'Enable feature?') return true;
        if (message === 'Another feature?') return false;
        return false;
      },
      input: async ({ defaultValue = '' }) => defaultValue,
    };

    await runCli(['confirm-agent'], {
      cwd,
      logger,
      templateRoot,
      prompt,
    });

    const projectDir = join(cwd, 'confirm-agent');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    // Boolean true should be "true"
    expect(envFile).toContain('ENABLE_FEATURE=true');

    // Boolean false should be "false", NOT empty string
    expect(envFile).toContain('ANOTHER_FEATURE=false');
    expect(envFile).not.toMatch(/ANOTHER_FEATURE=\s*\n/);
  });

  it('parses separated template and adapter flags and validates missing values', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await expect(runCli(['--template'], { cwd, logger })).rejects.toThrow(
      'Expected value after --template'
    );
    await expect(runCli(['--adapter'], { cwd, logger })).rejects.toThrow(
      'Expected value after --adapter'
    );

    await runCli(
      [
        'flag-agent',
        '-t',
        'blank',
        '--framework',
        'hono',
        '--no-install',
        '--network=base',
        '--non-interactive',
      ],
      { cwd, logger }
    );
    const envFile = await readFile(join(cwd, 'flag-agent', '.env'), 'utf8');
    expect(envFile).toContain('PAYMENTS_NETWORK=base');
  });

  it('reports empty and malformed template roots', async () => {
    const cwd = await createTempDir();
    const emptyRoot = await createTempDir();
    const malformedRoot = await createTempDir();
    const malformedTemplate = join(malformedRoot, 'malformed');
    const { logger } = createLogger();
    await mkdir(malformedTemplate);
    await writeFile(
      join(malformedTemplate, 'template.json'),
      '{invalid',
      'utf8'
    );

    await expect(
      runCli(['empty-agent'], { cwd, logger, templateRoot: emptyRoot })
    ).rejects.toThrow('No templates found');
    await expect(
      runCli(['bad-agent'], {
        cwd,
        logger,
        templateRoot: malformedRoot,
      })
    ).rejects.toThrow();
  });

  it('supports legacy adapter metadata and ignores invalid wizard entries', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['legacy', 'fallback']);
    const { logger } = createLogger();
    await updateTemplateMetadata(templateRoot, 'legacy', metadata => {
      const { adapters: _adapters, ...rest } = metadata;
      return {
        ...rest,
        adapter: 'HONO',
        wizard: {
          prompts: [
            null,
            { key: 'MISSING_TYPE', message: 'Missing type' },
            { key: 'INVALID_TYPE', type: 'date', message: 'Invalid type' },
          ],
        },
      };
    });
    await updateTemplateMetadata(templateRoot, 'fallback', metadata => ({
      ...metadata,
      adapters: [],
    }));

    await runCli(['legacy-agent', '--template=legacy', '--wizard=no'], {
      cwd,
      logger,
      templateRoot,
    });
    await runCli(
      [
        'fallback-agent',
        '--template=fallback',
        '--adapter=hono',
        '--wizard=no',
      ],
      { cwd, logger, templateRoot }
    );
    expect(await readFile(join(cwd, 'legacy-agent', '.env'), 'utf8')).toBe(
      'AGENT_NAME=legacy-agent\n'
    );
  });

  it('rejects unknown templates and incompatible adapter requests', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['only']);
    const { logger } = createLogger();

    await expect(
      runCli(['unknown-agent', '--template=missing'], {
        cwd,
        logger,
        templateRoot,
      })
    ).rejects.toThrow('Unknown template "missing"');

    await setAdaptersForTemplates(templateRoot, ['only'], ['hono']);
    await expect(
      runCli(['bad-adapter', '--template=only', '--adapter=mystery'], {
        cwd,
        logger,
        templateRoot,
      })
    ).rejects.toThrow('Unknown adapter "mystery"');
    await expect(
      runCli(['wrong-adapter', '--template=only', '--adapter=express'], {
        cwd,
        logger,
        templateRoot,
      })
    ).rejects.toThrow('does not support adapter "express"');
    await expect(
      runCli(['unavailable-adapter', '--adapter=express'], {
        cwd,
        logger,
        templateRoot,
      })
    ).rejects.toThrow('Adapter "express" is not available');

    await setAdaptersForTemplates(templateRoot, ['only'], ['mystery']);
    await expect(
      runCli(['unsupported-template', '--template=only'], {
        cwd,
        logger,
        templateRoot,
      })
    ).rejects.toThrow('does not support any known runtime adapters');
    await expect(
      runCli(['no-adapters'], { cwd, logger, templateRoot })
    ).rejects.toThrow('No valid adapters found');
  });

  it('handles invalid prompt selections and warns once for unknown adapters', async () => {
    const cwd = await createTempDir();
    const multiAdapterRoot = await createTemplateRoot(['multi']);
    const { logger, messages } = createLogger();

    await expect(
      runCli(['needs-adapter'], {
        cwd,
        logger,
        templateRoot: multiAdapterRoot,
      })
    ).rejects.toThrow('Multiple runtime adapters available');

    const invalidAdapterPrompt: PromptApi = {
      select: async () => 'bogus',
      confirm: async () => false,
      input: async ({ defaultValue = '' }) => defaultValue,
    };
    await expect(
      runCli(['invalid-selection'], {
        cwd,
        logger,
        templateRoot: multiAdapterRoot,
        prompt: invalidAdapterPrompt,
      })
    ).rejects.toThrow('No templates found for adapter "bogus"');

    const templateRoot = await createTemplateRoot(['first', 'second']);
    await setAdaptersForTemplates(
      templateRoot,
      ['first', 'second'],
      ['mystery', 'hono']
    );
    const missingTemplatePrompt: PromptApi = {
      select: async () => 'not-a-template',
      confirm: async ({ defaultValue }) => defaultValue ?? false,
      input: async ({ defaultValue = '' }) => defaultValue,
    };
    await runCli(['fallback-selection', '--adapter=hono', '--wizard=no'], {
      cwd,
      logger,
      templateRoot,
      prompt: missingTemplatePrompt,
    });
    expect(
      messages.filter(message => message.includes('unknown adapter'))
    ).toHaveLength(1);
    expect(messages).toContain(
      'Template "not-a-template" not found; falling back to first option.'
    );
  });

  it('resolves non-interactive wizard defaults, interpolation, and conditions', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['wizard-edges']);
    const { logger } = createLogger();
    await updateTemplateMetadata(templateRoot, 'wizard-edges', metadata => ({
      ...metadata,
      adapters: ['hono'],
      wizard: {
        prompts: [
          {
            key: 'CONFIRM_YES',
            type: 'confirm',
            message: 'Confirm yes',
            defaultValue: 'yes',
          },
          {
            key: 'CONFIRM_NO',
            type: 'confirm',
            message: 'Confirm no',
            defaultValue: 'no',
          },
          {
            key: 'CONFIRM_UNKNOWN',
            type: 'confirm',
            message: 'Confirm unknown',
            defaultValue: 'maybe',
          },
          {
            key: 'INPUT_BOOLEAN',
            type: 'input',
            message: 'Boolean input',
            defaultValue: true,
          },
          { key: 'INPUT_EMPTY', type: 'input', message: 'Empty input' },
          {
            key: 'SELECT_DEFAULT',
            type: 'select',
            message: 'Default select',
            defaultValue: 'two',
            choices: [
              { value: 'one', title: 'One' },
              { value: 'two', title: 'Two' },
            ],
          },
          {
            key: 'SELECT_FIRST',
            type: 'select',
            message: 'First select',
            choices: [{ value: 'one', title: 'One' }],
          },
          {
            key: 'INTERPOLATED',
            type: 'input',
            message: 'Interpolated',
            defaultValue: '{{CONFIRM_YES}}/{{AGENT_NAME}}/{{UNKNOWN_TOKEN}}',
          },
          {
            key: 'GATED_IN',
            type: 'input',
            message: 'Gated input',
            defaultValue: 'included',
            when: { key: 'SELECT_FIRST', in: ['one'] },
          },
        ],
      },
    }));

    await runCli(
      ['wizard-edge-agent', '--template=wizard-edges', '--wizard=no'],
      { cwd, logger, templateRoot }
    );
    const envFile = await readFile(
      join(cwd, 'wizard-edge-agent', '.env'),
      'utf8'
    );
    expect(envFile).toContain('CONFIRM_YES=true');
    expect(envFile).toContain('CONFIRM_NO=false');
    expect(envFile).toContain('CONFIRM_UNKNOWN=false');
    expect(envFile).toContain('INPUT_BOOLEAN=true');
    expect(envFile).toContain('INPUT_EMPTY=');
    expect(envFile).toContain('SELECT_DEFAULT=two');
    expect(envFile).toContain('SELECT_FIRST=one');
    expect(envFile).toContain('INTERPOLATED=true/wizard-edge-agent/');
    expect(envFile).toContain('GATED_IN=included');
  });

  it('fails select wizard prompts that do not define choices', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(['no-choices']);
    const { logger } = createLogger();
    await updateTemplateMetadata(templateRoot, 'no-choices', metadata => ({
      ...metadata,
      adapters: ['hono'],
      wizard: {
        prompts: [
          { key: 'CHOICE', type: 'select', message: 'Choose something' },
        ],
      },
    }));
    const prompt: PromptApi = {
      select: async () => '',
      confirm: async () => false,
      input: async ({ defaultValue = '' }) => defaultValue,
    };

    await expect(
      runCli(['interactive-no-choices', '--template=no-choices'], {
        cwd,
        logger,
        templateRoot,
        prompt,
      })
    ).rejects.toThrow('Prompt "CHOICE" is missing choices');
    await expect(
      runCli(
        ['noninteractive-no-choices', '--template=no-choices', '--wizard=no'],
        { cwd, logger, templateRoot }
      )
    ).rejects.toThrow('Prompt "CHOICE" is missing choices');
  });

  it('reports malformed agent templates and merges dependency conflicts', async () => {
    const cwd = await createTempDir();
    const malformedRoot = await createTemplateRoot(['malformed-agent']);
    const malformedPath = join(malformedRoot, 'malformed-agent');
    const { logger } = createLogger();
    await writeFile(
      join(malformedPath, 'agent.ts.template'),
      '{{TEMPLATE_IMPORTS}}\n{{TEMPLATE_PRE_SETUP}}',
      'utf8'
    );

    await expect(
      runCli(
        ['malformed-output', '--template=malformed-agent', '--wizard=no'],
        { cwd, logger, templateRoot: malformedRoot }
      )
    ).rejects.toThrow('Template missing required marker');

    const conflictRoot = await createTemplateRoot(['conflict']);
    await updateTemplateMetadata(conflictRoot, 'conflict', metadata => ({
      ...metadata,
      adapters: ['hono'],
      package: {
        dependencies: {
          '@lucid-agents/core': '0.0.0-conflict',
        },
      },
    }));
    await runCli(['conflict-agent', '--template=conflict', '--wizard=no'], {
      cwd,
      logger,
      templateRoot: conflictRoot,
    });
    const packageJson = await readJson(
      join(cwd, 'conflict-agent', 'package.json')
    );
    expect(
      (packageJson.dependencies as Record<string, string>)['@lucid-agents/core']
    ).toBe('0.0.0-conflict');
  });

  it('allows a marker-only README and falls back to the adapter README', async () => {
    const cwd = await createTempDir();
    const plainRoot = await createTemplateRoot(['plain-readme']);
    const missingRoot = await createTemplateRoot(['missing-readme']);
    const { logger } = createLogger();
    await writeFile(
      join(plainRoot, 'plain-readme', 'README.md'),
      'No placeholders here.\n',
      'utf8'
    );
    await rm(join(missingRoot, 'missing-readme', 'README.md'));

    await runCli(['plain-agent', '--template=plain-readme', '--wizard=no'], {
      cwd,
      logger,
      templateRoot: plainRoot,
    });
    await runCli(
      ['missing-agent', '--template=missing-readme', '--wizard=no'],
      { cwd, logger, templateRoot: missingRoot }
    );
    expect(await readFile(join(cwd, 'plain-agent', 'README.md'), 'utf8')).toBe(
      'No placeholders here.\n'
    );
    expect(await readdir(join(cwd, 'missing-agent'))).toContain('README.md');
  });
});
