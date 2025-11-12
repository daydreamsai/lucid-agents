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

    // agent.ts uses process.env
    expect(agentSrc).toContain('process.env.AGENT_NAME');
    expect(agentSrc).toContain('process.env.AGENT_VERSION');
    expect(agentSrc).toContain('process.env.AGENT_DESCRIPTION');
    expect(agentSrc).toContain('key: "echo"');
    expect(agentSrc).toContain('useConfigPayments: true');
    expect(agentSrc).not.toContain('{{');

    // .env has defaults from template.json
    expect(envFile).toContain('AGENT_NAME=demo-agent');
    expect(envFile).toContain('AGENT_VERSION=0.1.0');
    expect(envFile).toContain('PAYMENTS_RECEIVABLE_ADDRESS=');
    expect(envFile).toContain('PRIVATE_KEY=');
  });

  it('applies wizard answers to generate .env file', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();
    const inputResponses = new Map<string, string>([
      ['How would you describe your agent?', 'Quote assistant for pricing.'],
      ['What version should the agent start at?', '1.0.0'],
      ['Facilitator URL', 'https://facilitator.example'],
      ['Payment network identifier', 'base'],
      [
        'Receivable address (address that receives payments)',
        '0xabc0000000000000000000000000000000000000',
      ],
      ['Default price (USDC)', '4200'],
      ['Wallet private key (leave empty to add later)', ''],
    ]);

    const prompt: PromptApi = {
      select: async ({ choices }) => choices[0]?.value ?? '',
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

    // agent.ts now uses process.env
    expect(agentSrc).toContain('process.env.AGENT_NAME');
    expect(agentSrc).toContain('process.env.AGENT_VERSION');
    expect(agentSrc).toContain('process.env.AGENT_DESCRIPTION');
    expect(agentSrc).toContain('key: "echo"');
    expect(agentSrc).toContain('useConfigPayments: true');

    // .env contains wizard answers
    expect(envFile).toContain('AGENT_NAME=quote-agent');
    expect(envFile).toContain('AGENT_VERSION=1.0.0');
    expect(envFile).toContain('AGENT_DESCRIPTION=Quote assistant for pricing.');
    expect(envFile).toContain(
      'PAYMENTS_FACILITATOR_URL=https://facilitator.example'
    );
    expect(envFile).toContain(
      'PAYMENTS_RECEIVABLE_ADDRESS=0xabc0000000000000000000000000000000000000'
    );
    expect(envFile).toContain('PAYMENTS_NETWORK=base');
    expect(envFile).toContain('PAYMENTS_DEFAULT_PRICE=4200');
    expect(envFile).toContain('PRIVATE_KEY=');

    // README uses agent name
    expect(readme).toContain('quote-agent');
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
    const pkg = (await readJson(join(projectDir, 'package.json'))) as Record<
      string,
      unknown
    >;
    const deps = (pkg.dependencies ?? {}) as Record<string, unknown>;

    expect(tanstackAgent).toContain('createTanStackRuntime');
    expect(
      Object.prototype.hasOwnProperty.call(
        deps,
        '@lucid-agents/agent-kit-tanstack'
      )
    ).toBe(true);
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
    const proxySrc = await readFile(join(projectDir, 'proxy.ts'), 'utf8');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');
    const pkg = (await readJson(join(projectDir, 'package.json'))) as Record<
      string,
      any
    >;

    expect(agentSrc).toContain('createAgentHttpRuntime');
    expect(proxySrc).toContain('createNextPaywall');
    expect(pkg.dependencies?.next).toBeDefined();
    expect(pkg.dependencies?.['x402-next']).toBeDefined();
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

    await expect(readdir(componentsDir)).rejects.toThrow();
    expect(indexRoute).toContain('TanStack runtime without a UI shell');
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
      'Usage: bunx @lucid-agents/create-agent-kit <app-name>'
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
      input: async ({ message, defaultValue = '' }) => {
        // Just use defaults for all inputs
        return defaultValue;
      },
    };

    await runCli(['env-agent'], { cwd, logger, prompt, templateRoot });

    const projectDir = join(cwd, 'env-agent');
    const env = await readFile(join(projectDir, '.env'), 'utf8');

    // Should have values from wizard (defaults in this case)
    expect(env).toContain('AGENT_NAME=env-agent');
    expect(env).toContain('PAYMENTS_NETWORK=base-sepolia');
    expect(env).toContain(
      'PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems'
    );
    expect(env).toContain('PRIVATE_KEY=');
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
    expect(envFile).toContain('PAYMENTS_NETWORK=base-sepolia');
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
        '--PAYMENTS_DEFAULT_PRICE=5000',
        '--PAYMENTS_NETWORK=ethereum-mainnet',
        '--PRIVATE_KEY=0xabcdef',
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
    expect(envFile).toContain('PAYMENTS_DEFAULT_PRICE=5000');
    expect(envFile).toContain('PAYMENTS_NETWORK=ethereum-mainnet');
    expect(envFile).toContain('PRIVATE_KEY=0xabcdef');
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
        '--PAYMENTS_DEFAULT_PRICE=9999',
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
    expect(envFile).toContain('PAYMENTS_DEFAULT_PRICE=9999');

    // Should still have defaults for non-provided values
    expect(envFile).toContain('AGENT_NAME=override-agent');
    expect(envFile).toContain('PAYMENTS_NETWORK=base-sepolia');
  });

  it('handles empty string values in CLI arguments', async () => {
    const cwd = await createTempDir();
    const { logger } = createLogger();

    await runCli(
      [
        'empty-args-agent',
        '--template=blank',
        '--non-interactive',
        '--PRIVATE_KEY=',
        '--PAYMENTS_RECEIVABLE_ADDRESS=',
      ],
      {
        cwd,
        logger,
      }
    );

    const projectDir = join(cwd, 'empty-args-agent');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    expect(envFile).toContain('PRIVATE_KEY=');
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
        '--PAYMENTS_FACILITATOR_URL=https://facilitator.example.com/api?key=test',
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
      'PAYMENTS_FACILITATOR_URL=https://facilitator.example.com/api?key=test'
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
      ],
      {
        cwd,
        logger,
      }
    );

    const projectDir = join(cwd, 'identity-agent');
    const envFile = await readFile(join(projectDir, '.env'), 'utf8');

    expect(envFile).toContain('AGENT_DOMAIN=agent.example.com');
    expect(envFile).toContain('RPC_URL=https://sepolia.base.org');
    expect(envFile).toContain('CHAIN_ID=84532');
    expect(envFile).toContain('IDENTITY_AUTO_REGISTER=false');
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
    expect(agentsMd).toContain('Blank Agent Template - AI Coding Guide');
    expect(agentsMd).toContain('How to Add Entrypoints');

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
});
