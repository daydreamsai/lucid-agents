import { afterEach, describe, expect, it } from 'bun:test';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli, type PromptApi } from '../src/index.js';

const tempPaths: string[] = [];

afterEach(async () => {
  while (tempPaths.length > 0) {
    const path = tempPaths.pop();
    if (path) {
      await rm(path, { recursive: true, force: true });
    }
  }
});

async function createTempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'lucid-cli-safety-'));
  tempPaths.push(path);
  return path;
}

function blankTemplatePath(): string {
  const testsDir = fileURLToPath(new URL('.', import.meta.url));
  return resolve(testsDir, '../templates/blank');
}

async function createTemplateRoot(
  metadataUpdate: (metadata: Record<string, unknown>) => Record<string, unknown>
): Promise<string> {
  const root = await createTempDir();
  const templateDir = join(root, 'safety');
  await cp(blankTemplatePath(), templateDir, { recursive: true });
  const metadataPath = join(templateDir, 'template.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<
    string,
    unknown
  >;
  const updatedMetadata = metadataUpdate(metadata);
  await writeFile(
    metadataPath,
    `${JSON.stringify(updatedMetadata, null, 2)}\n`,
    'utf8'
  );

  const schemaPath = join(templateDir, 'template.schema.json');
  const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as {
    properties: Record<string, unknown>;
    required?: string[];
  };
  const prompts = (
    (
      updatedMetadata.wizard as
        | { prompts?: Array<{ key?: string; type?: string }> }
        | undefined
    )?.prompts ?? []
  ).filter(
    (prompt): prompt is { key: string; type?: string } =>
      typeof prompt.key === 'string'
  );
  const promptKeys = new Set(prompts.map(prompt => prompt.key));
  schema.properties = {
    AGENT_NAME: schema.properties.AGENT_NAME ?? { type: 'string' },
    ...Object.fromEntries(
      prompts.map(prompt => [
        prompt.key,
        schema.properties[prompt.key] ?? {
          type: prompt.type === 'confirm' ? 'boolean' : 'string',
        },
      ])
    ),
  };
  schema.required = (schema.required ?? []).filter(
    key => key === 'AGENT_NAME' || promptKeys.has(key)
  );
  await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  return root;
}

const logger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

describe('scaffolding safety', () => {
  it('rejects the current working directory without changing it', async () => {
    const cwd = await createTempDir();

    await expect(
      runCli(['.', '--template=blank', '--adapter=hono', '--non-interactive'], {
        cwd,
        logger,
      })
    ).rejects.toThrow(
      'Scaffolding into the current working directory is not supported'
    );

    expect(await readdir(cwd)).toEqual([]);
  });

  it('rejects an invalid semantic version before creating a destination', async () => {
    const cwd = await createTempDir();

    await expect(
      runCli(
        [
          'invalid-version-agent',
          '--template=blank',
          '--adapter=hono',
          '--non-interactive',
          '--AGENT_VERSION=not-a-version',
        ],
        { cwd, logger }
      )
    ).rejects.toThrow(/AGENT_VERSION.*must match pattern/u);

    expect(await readdir(cwd)).toEqual([]);
  });

  it('fails closed on unsupported template schema validation keywords', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(metadata => metadata);
    const schemaPath = join(templateRoot, 'safety', 'template.schema.json');
    const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as {
      properties: Record<string, Record<string, unknown>>;
    };
    schema.properties.AGENT_VERSION = {
      ...schema.properties.AGENT_VERSION,
      maxLength: 1,
    };
    await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');

    await expect(
      runCli(
        [
          'unsupported-schema-agent',
          '--template=safety',
          '--adapter=hono',
          '--non-interactive',
        ],
        { cwd, logger, templateRoot }
      )
    ).rejects.toThrow('unsupported keyword "maxLength"');

    expect(await readdir(cwd)).toEqual([]);
  });

  it('rejects an invalid RPC URL before creating a destination', async () => {
    const cwd = await createTempDir();

    await expect(
      runCli(
        [
          'invalid-rpc-agent',
          '--template=identity',
          '--adapter=hono',
          '--non-interactive',
          '--RPC_URL=not-a-url',
        ],
        { cwd, logger }
      )
    ).rejects.toThrow(/RPC_URL.*valid URI/u);

    expect(await readdir(cwd)).toEqual([]);
  });

  it('rejects an invalid chain ID before creating a destination', async () => {
    const cwd = await createTempDir();

    await expect(
      runCli(
        [
          'invalid-chain-agent',
          '--template=identity',
          '--adapter=hono',
          '--non-interactive',
          '--CHAIN_ID=not-a-chain',
        ],
        { cwd, logger }
      )
    ).rejects.toThrow(/CHAIN_ID.*must match pattern/u);

    expect(await readdir(cwd)).toEqual([]);
  });

  it('rejects a chain without a configured identity registry deployment', async () => {
    const cwd = await createTempDir();

    await expect(
      runCli(
        [
          'unsupported-chain-agent',
          '--template=identity',
          '--adapter=hono',
          '--non-interactive',
          '--CHAIN_ID=8453',
        ],
        { cwd, logger }
      )
    ).rejects.toThrow(/CHAIN_ID.*must be one of its declared values/u);

    expect(await readdir(cwd)).toEqual([]);
  });

  it('requires an explicit signer when identity auto-registration is enabled', async () => {
    const cwd = await createTempDir();

    await expect(
      runCli(
        [
          'unsigned-registration-agent',
          '--template=identity',
          '--adapter=hono',
          '--non-interactive',
          '--IDENTITY_AUTO_REGISTER=true',
        ],
        { cwd, logger }
      )
    ).rejects.toThrow(/must match at least one allowed configuration/u);

    expect(await readdir(cwd)).toEqual([]);
  });

  it('requires explicit acknowledgement for mainnet identity registration', async () => {
    const cwd = await createTempDir();

    await expect(
      runCli(
        [
          'unacknowledged-mainnet-agent',
          '--template=identity',
          '--adapter=hono',
          '--non-interactive',
          '--CHAIN_ID=1',
          '--IDENTITY_AUTO_REGISTER=true',
          `--AGENT_WALLET_PRIVATE_KEY=0x${'1'.repeat(64)}`,
        ],
        { cwd, logger }
      )
    ).rejects.toThrow(
      /IDENTITY_ALLOW_MAINNET_REGISTRATION.*must equal its required value/u
    );

    expect(await readdir(cwd)).toEqual([]);
  });

  it('leaves payments unconfigured in the default identity project', async () => {
    const cwd = await createTempDir();

    await runCli(
      [
        'readonly-identity-agent',
        '--template=identity',
        '--adapter=hono',
        '--non-interactive',
      ],
      { cwd, logger }
    );

    const env = await readFile(
      join(cwd, 'readonly-identity-agent', '.env'),
      'utf8'
    );
    expect(env).toContain('PAYMENTS_ENABLED=false');
    expect(env).not.toContain('PAYMENTS_FACILITATOR_URL=');
    expect(env).not.toContain('PAYMENTS_NETWORK=');
    expect(env).not.toContain('PAYMENTS_DESTINATION=');
    expect(env).not.toContain('PAYMENTS_RECEIVABLE_ADDRESS=');
    expect(env).not.toContain('STRIPE_SECRET_KEY=');
  });

  it('requires a complete payment destination when payments are enabled', async () => {
    const cwd = await createTempDir();

    await expect(
      runCli(
        [
          'incomplete-payment-agent',
          '--template=identity',
          '--adapter=hono',
          '--non-interactive',
          '--PAYMENTS_ENABLED=true',
        ],
        { cwd, logger }
      )
    ).rejects.toThrow(/PAYMENTS_RECEIVABLE_ADDRESS.*at least 1 character/u);

    await expect(
      lstat(join(cwd, 'incomplete-payment-agent'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('leaves no destination behind when generation fails', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(metadata => metadata);
    const templatePath = join(templateRoot, 'safety', 'agent.ts.template');
    await writeFile(
      templatePath,
      '{{TEMPLATE_IMPORTS}}\n{{TEMPLATE_PRE_SETUP}}\n',
      'utf8'
    );

    await expect(
      runCli(
        [
          'failed-agent',
          '--template=safety',
          '--adapter=hono',
          '--non-interactive',
        ],
        { cwd, logger, templateRoot }
      )
    ).rejects.toThrow(
      /Template missing required marker[\s\S]*Re-run: bunx @lucid-agents\/cli failed-agent --template=safety --adapter=hono --non-interactive/u
    );

    await expect(lstat(join(cwd, 'failed-agent'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('always ignores generated environment files', async () => {
    const cwd = await createTempDir();

    await runCli(
      [
        'ignored-env-agent',
        '--template=blank',
        '--adapter=hono',
        '--non-interactive',
      ],
      { cwd, logger }
    );

    const ignore = await readFile(
      join(cwd, 'ignored-env-agent', '.gitignore'),
      'utf8'
    );
    expect(ignore.split('\n')).toContain('.env');
    expect(ignore.split('\n')).toContain('!.env.example');
    expect(
      (await lstat(join(cwd, 'ignored-env-agent', '.env'))).mode & 0o777
    ).toBe(0o600);
  });

  it('marks sensitive wizard input without exposing its default', async () => {
    const cwd = await createTempDir();
    const templateRoot = await createTemplateRoot(metadata => ({
      ...metadata,
      wizard: {
        prompts: [
          {
            key: 'SECRET_TOKEN',
            type: 'input',
            message: 'Secret token',
            defaultValue: 'must-not-be-rendered',
            sensitive: true,
          },
        ],
      },
    }));
    const inputCalls: Array<{
      message: string;
      defaultValue?: string;
      sensitive?: boolean;
    }> = [];
    const messages: string[] = [];
    const recordingLogger = {
      log: (message: string) => messages.push(message),
      warn: (message: string) => messages.push(message),
      error: (message: string) => messages.push(message),
    };
    const prompt: PromptApi = {
      select: async ({ choices }) => choices[0]?.value ?? '',
      confirm: async ({ defaultValue }) => defaultValue ?? false,
      input: async params => {
        inputCalls.push(params);
        return params.message === 'Secret token'
          ? 'runtime-secret'
          : (params.defaultValue ?? '');
      },
    };

    await runCli(['secret-agent', '--template=safety', '--adapter=hono'], {
      cwd,
      logger: recordingLogger,
      prompt,
      templateRoot,
    });

    expect(inputCalls).toContainEqual({
      message: 'Secret token',
      sensitive: true,
    });
    expect(await readFile(join(cwd, 'secret-agent', '.env'), 'utf8')).toContain(
      'SECRET_TOKEN=runtime-secret'
    );
    expect(messages.join('\n')).not.toContain('runtime-secret');
    expect(messages.join('\n')).not.toContain('must-not-be-rendered');
  });

  it('fails cleanly when dependency installation fails', async () => {
    const cwd = await createTempDir();
    const fakeBin = await createTempDir();
    const fakeBun = join(fakeBin, 'bun');
    await writeFile(fakeBun, '#!/bin/sh\nexit 23\n', 'utf8');
    await chmod(fakeBun, 0o755);
    const originalPath = process.env.PATH;
    process.env.PATH = `${fakeBin}:${originalPath ?? ''}`;

    try {
      await expect(
        runCli(
          [
            'install-failure-agent',
            '--template=blank',
            '--adapter=hono',
            '--non-interactive',
            '--install',
          ],
          { cwd, logger }
        )
      ).rejects.toThrow('bun install exited with code 23');
    } finally {
      process.env.PATH = originalPath;
    }

    await expect(
      lstat(join(cwd, 'install-failure-agent'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not create the secret environment file until install succeeds', async () => {
    const cwd = await createTempDir();
    const fakeBin = await createTempDir();
    const templateRoot = await createTemplateRoot(metadata => ({
      ...metadata,
      wizard: {
        prompts: [
          {
            key: 'SECRET_TOKEN',
            type: 'input',
            message: 'Secret token',
            defaultValue: '',
            sensitive: true,
          },
        ],
      },
    }));
    const fakeBun = join(fakeBin, 'bun');
    await writeFile(
      fakeBun,
      '#!/bin/sh\nif [ -e .env ]; then exit 41; fi\nexit 0\n',
      'utf8'
    );
    await chmod(fakeBun, 0o755);
    const originalPath = process.env.PATH;
    process.env.PATH = `${fakeBin}:${originalPath ?? ''}`;

    try {
      await runCli(
        [
          'secret-install-agent',
          '--template=safety',
          '--adapter=hono',
          '--non-interactive',
          '--install',
          '--SECRET_TOKEN=runtime-secret',
        ],
        { cwd, logger, templateRoot }
      );
    } finally {
      process.env.PATH = originalPath;
    }

    expect(
      await readFile(join(cwd, 'secret-install-agent', '.env'), 'utf8')
    ).toContain('SECRET_TOKEN=runtime-secret');
  });

  it('rejects unknown arguments before creating a destination', async () => {
    const cwd = await createTempDir();

    await expect(
      runCli(
        [
          'unknown-option-agent',
          '--template=blank',
          '--adapter=hono',
          '--unknown-option',
        ],
        { cwd, logger }
      )
    ).rejects.toThrow('Unknown option "--unknown-option"');
    await expect(
      runCli(
        [
          'unknown-key-agent',
          '--template=blank',
          '--adapter=hono',
          '--non-interactive',
          '--NOT_A_TEMPLATE_KEY=value',
        ],
        { cwd, logger }
      )
    ).rejects.toThrow('Unknown template argument "NOT_A_TEMPLATE_KEY"');
    await expect(
      runCli(
        ['first-agent', 'second-agent', '--template=blank', '--adapter=hono'],
        { cwd, logger }
      )
    ).rejects.toThrow('Expected one project directory');

    for (const name of [
      'unknown-option-agent',
      'unknown-key-agent',
      'first-agent',
    ]) {
      await expect(lstat(join(cwd, name))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
  });

  it('rejects environment values containing line breaks', async () => {
    const cwd = await createTempDir();

    await expect(
      runCli(
        [
          'newline-agent',
          '--template=blank',
          '--adapter=hono',
          '--non-interactive',
          '--OPENAI_API_KEY=secret\nINJECTED_VALUE=true',
        ],
        { cwd, logger }
      )
    ).rejects.toThrow('must not contain line breaks');
    await expect(lstat(join(cwd, 'newline-agent'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('commits nested project paths only after generation succeeds', async () => {
    const cwd = await createTempDir();

    await runCli(
      [
        'nested/path-agent',
        '--template=blank',
        '--adapter=hono',
        '--non-interactive',
      ],
      { cwd, logger }
    );

    expect(
      JSON.parse(
        await readFile(join(cwd, 'nested/path-agent/package.json'), 'utf8')
      )
    ).toMatchObject({ name: 'path-agent' });
  });

  it('atomically replaces an existing empty destination', async () => {
    const cwd = await createTempDir();
    const target = join(cwd, 'empty-agent');
    await mkdir(target);

    await runCli(
      [
        'empty-agent',
        '--template=blank',
        '--adapter=hono',
        '--non-interactive',
      ],
      { cwd, logger }
    );

    expect(
      JSON.parse(await readFile(join(target, 'package.json'), 'utf8'))
    ).toMatchObject({ name: 'empty-agent' });
  });

  it('never mutates a destination containing only Finder metadata', async () => {
    const cwd = await createTempDir();
    const target = join(cwd, 'finder-agent');
    await mkdir(target);
    await writeFile(join(target, '.DS_Store'), 'preserve-me', 'utf8');

    await expect(
      runCli(
        [
          'finder-agent',
          '--template=blank',
          '--adapter=hono',
          '--non-interactive',
        ],
        { cwd, logger }
      )
    ).rejects.toThrow('already exists and is not empty');

    expect(await readdir(target)).toEqual(['.DS_Store']);
    expect(await readFile(join(target, '.DS_Store'), 'utf8')).toBe(
      'preserve-me'
    );
  });
});
