import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import process, {
  stdin as defaultInput,
  stdout as defaultOutput,
} from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import {
  type AdapterDefinition,
  type AdapterOptions,
  type AdapterSnippets,
  getAdapterDefinition,
  getAdapterDisplayName,
  getAdapterLayers,
  isAdapterSupported,
} from './adapters.js';

type CliOptions = {
  install: boolean;
  templateId?: string;
  adapterId?: string;
  adapterUiPreference?: 'ui' | 'headless';
  skipWizard?: boolean;
  templateArgs?: Map<string, string>;
};

type ParsedArgs = {
  options: CliOptions;
  target: string | null;
  showHelp: boolean;
};

type RunLogger = {
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

type PromptChoice = {
  value: string;
  title: string;
  description?: string;
};

type PromptApi = {
  select: (params: {
    message: string;
    choices: PromptChoice[];
  }) => Promise<string>;
  confirm: (params: {
    message: string;
    defaultValue?: boolean;
  }) => Promise<boolean>;
  input: (params: {
    message: string;
    defaultValue?: string;
  }) => Promise<string>;
  close?: () => Promise<void> | void;
};

type RunOptions = {
  cwd?: string;
  templateRoot?: string;
  logger?: RunLogger;
  prompt?: PromptApi;
};

type WizardCondition = {
  key: string;
  equals?: string | boolean;
  in?: Array<string | boolean>;
};

type WizardPrompt = {
  key: string;
  type: 'input' | 'confirm' | 'select';
  message: string;
  defaultValue?: string | boolean;
  choices?: PromptChoice[];
  when?: WizardCondition;
};

type WizardConfig = {
  prompts?: WizardPrompt[];
};

type TemplateMeta = {
  id?: string;
  name?: string;
  description?: string;
  /** Single adapter (backward compatible) */
  adapter?: string;
  /** Multiple compatible adapters (takes precedence over adapter) */
  adapters?: string[];
  wizard?: WizardConfig;
};

type TemplateDescriptor = {
  id: string;
  /** Array of compatible adapters */
  adapters: string[];
  title: string;
  description?: string;
  path: string;
  wizard?: WizardConfig;
};

type WizardAnswers = Map<string, string | boolean>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_ROOT = resolve(__dirname, '../templates');

const LUCID_BANNER = [
  '____   ____     ___   ____   ___________   ',

  '',
  '',
  "MM'   `MM'     `M'  6MMMMb/ `MM`MMMMMMMb. ",
  'MM     MM       M  8P    YM  MM MM    `Mb ',
  'MM     MM       M 6M      Y  MM MM     MM ',
  'MM     MM       M MM         MM MM     MM ',
  'MM     MM       M MM         MM MM     MM ',
  'MM     MM       M MM         MM MM     MM ',
  'MM     YM       M YM      6  MM MM     MM ',
  'MM    / 8b     d8  8b    d9  MM MM    .M9 ',
  "_MMMMMMM  YMMMMM9    YMMMM9  _MM_MMMMMMM9'",

  '',
  '       L U C I D  DREAMS   ',
  '   Agent scaffolding toolkit  ',
];

const DEFAULT_PROJECT_NAME = 'agent-app';
const PROJECT_NAME_PROMPT = 'Project directory name:';

const defaultLogger: RunLogger = {
  log: message => console.log(message),
  warn: message => console.warn(message),
  error: message => console.error(message),
};

export async function runCli(
  argv: string[],
  options: RunOptions = {}
): Promise<void> {
  const logger = options.logger ?? defaultLogger;
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const templateRoot = options.templateRoot
    ? resolve(options.templateRoot)
    : TEMPLATE_ROOT;
  const prompt = options.prompt;

  const parsed = parseArgs(argv);

  printBanner(logger);

  if (parsed.showHelp) {
    printHelp(logger);
    return;
  }

  const templates = await loadTemplates(templateRoot);
  if (templates.length === 0) {
    throw new Error(`No templates found in ${templateRoot}`);
  }

  const { template, adapter: selectedAdapter } = await resolveTemplate({
    templates,
    requestedId: parsed.options.templateId,
    requestedAdapter: parsed.options.adapterId,
    prompt,
    logger,
  });

  // Validate adapter exists and is compatible with template
  validateAdapterExists(selectedAdapter);
  validateAdapterCompatibility(template, selectedAdapter);

  const adapterDefinition = getAdapterDefinition(selectedAdapter);
  const requestedVariant = parsed.options.adapterUiPreference;
  if (
    requestedVariant &&
    adapterDefinition.supportedVariants &&
    !adapterDefinition.supportedVariants.includes(requestedVariant)
  ) {
    const supported = adapterDefinition.supportedVariants.join(', ');
    throw new Error(
      `Adapter "${selectedAdapter}" does not support "--adapter-ui=${requestedVariant}". Supported modes: ${supported}`
    );
  }
  const adapterVariant =
    requestedVariant ?? adapterDefinition.defaultVariant ?? undefined;
  const adapterOptions: AdapterOptions = {
    variant: adapterVariant,
  };

  logger.log(`Using runtime adapter: ${formatAdapterName(selectedAdapter)}`);
  if (adapterVariant) {
    logger.log(
      `Adapter mode: ${adapterVariant === 'headless' ? 'Headless API' : 'Full UI'}`
    );
  }
  logger.log(`Using template: ${template.title}`);

  const projectName = await resolveProjectName({
    parsed,
    prompt,
    logger,
    template,
  });

  const targetDir = projectName === '.' ? cwd : resolve(cwd, projectName);
  const projectDirName = basename(targetDir);
  const packageName = toPackageName(projectDirName);

  await assertTemplatePresent(template.path);
  await assertTargetDirectory(targetDir);
  const wizardAnswers = await collectWizardAnswers({
    template,
    prompt: parsed.options.skipWizard ? undefined : prompt,
    context: {
      AGENT_NAME: projectDirName,
      PACKAGE_NAME: packageName,
    },
    preSuppliedArgs: parsed.options.skipWizard
      ? parsed.options.templateArgs
      : undefined,
  });
  const replacements = buildTemplateReplacements({
    projectDirName,
    packageName,
    answers: wizardAnswers,
    adapter: adapterDefinition,
    templateId: template.id,
    adapterOptions,
  });
  await copyTemplate(
    template.path,
    targetDir,
    adapterDefinition,
    adapterOptions
  );

  // Read template.json metadata
  const templateJsonPath = join(template.path, 'template.json');
  const templateJsonRaw = await fs.readFile(templateJsonPath, 'utf8');
  const templateMeta = JSON.parse(templateJsonRaw);

  await applyTemplateTransforms(targetDir, {
    packageName,
    replacements,
    adapter: adapterDefinition,
    templateRoot: template.path,
    templateMeta,
  });

  await setupEnvironment({
    targetDir,
    skipWizard: parsed.options.skipWizard ?? false,
    wizardAnswers,
    agentName: projectDirName,
    template,
  });

  if (parsed.options.install) {
    await runInstall(targetDir, logger);
  }

  const relativeTarget = relative(cwd, targetDir) || '.';
  const nextSteps = [
    relativeTarget !== '.' ? `cd ${relativeTarget}` : null,
    !parsed.options.install ? 'bun install' : null,
    'bun run dev',
  ].filter(Boolean);

  logger.log('');
  logger.log(`Created agent app in ${relativeTarget}`);
  logger.log('Next steps:');
  nextSteps.forEach((step, index) => {
    logger.log(`  ${index + 1}. ${step}`);
  });
  logger.log('');
  logger.log('Happy hacking!');
}

export type { PromptApi, RunLogger };

function parseArgs(args: string[]): ParsedArgs {
  const options: CliOptions = {
    install: false,
    skipWizard: false,
    templateArgs: new Map(),
  };
  const positional: string[] = [];
  let showHelp = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--install' || arg === '-i') {
      options.install = true;
    } else if (arg === '--no-install') {
      options.install = false;
    } else if (arg === '--help' || arg === '-h') {
      showHelp = true;
    } else if (arg === '--wizard=no' || arg === '--no-wizard') {
      options.skipWizard = true;
    } else if (arg === '--non-interactive') {
      options.skipWizard = true;
    } else if (arg === '--template' || arg === '-t') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Expected value after --template');
      }
      options.templateId = value;
      i += 1;
    } else if (arg?.startsWith('--template=')) {
      options.templateId = arg.slice('--template='.length);
    } else if (arg === '--adapter' || arg === '--framework' || arg === '-a') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Expected value after --adapter');
      }
      options.adapterId = value.toLowerCase();
      i += 1;
    } else if (arg?.startsWith('--adapter=')) {
      options.adapterId = arg.slice('--adapter='.length).toLowerCase();
    } else if (arg?.startsWith('--framework=')) {
      options.adapterId = arg.slice('--framework='.length).toLowerCase();
    } else if (arg === '--adapter-ui') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Expected value after --adapter-ui');
      }
      options.adapterUiPreference = normalizeAdapterUi(value);
      i += 1;
    } else if (arg?.startsWith('--adapter-ui=')) {
      const value = arg.slice('--adapter-ui='.length);
      options.adapterUiPreference = normalizeAdapterUi(value);
    } else if (arg?.startsWith('--') && arg.includes('=')) {
      // Capture template arguments like --SOME_KEY=value
      const equalIndex = arg.indexOf('=');
      const key = arg.slice(2, equalIndex);
      const value = arg.slice(equalIndex + 1);
      if (key.length > 0) {
        options.templateArgs?.set(key, value);
      }
    } else if (!arg?.startsWith('-')) {
      positional.push(arg ?? '');
    }
  }

  return { options, target: positional[0] ?? null, showHelp };
}

function normalizeAdapterUi(value: string): 'ui' | 'headless' {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'headless' ||
    normalized === 'api' ||
    normalized === 'api-only' ||
    normalized === 'no-ui'
  ) {
    return 'headless';
  }
  if (normalized === 'ui' || normalized === 'full' || normalized === 'shell') {
    return 'ui';
  }
  throw new Error(
    `Unknown adapter UI mode "${value}". Use "ui" or "headless".`
  );
}

function printHelp(logger: RunLogger) {
  logger.log('Usage: bunx @lucid-agents/create-agent-kit <app-name> [options]');
  logger.log('');
  logger.log('Options:');
  logger.log(
    '  -t, --template <id>   Select template (blank, axllm, axllm-flow, identity)'
  );
  logger.log(
    '  -a, --adapter <id>    Select runtime adapter/framework (hono, tanstack, etc.)'
  );
  logger.log(
    '      --adapter-ui <mode>  Adapter-specific mode (ui, headless for TanStack)'
  );
  logger.log('  -i, --install         Run bun install after scaffolding');
  logger.log('  --no-install          Skip bun install');
  logger.log('  --wizard=no           Skip wizard, use template defaults');
  logger.log('  --non-interactive     Same as --wizard=no');
  logger.log(
    '  --KEY=value           Pass template argument (use with --non-interactive)'
  );
  logger.log('  -h, --help            Show this help');
  logger.log('');
  logger.log('Examples:');
  logger.log('  bunx @lucid-agents/create-agent-kit my-agent');
  logger.log(
    '  bunx @lucid-agents/create-agent-kit my-agent --template=identity --install'
  );
  logger.log('  bunx @lucid-agents/create-agent-kit my-agent --wizard=no');
  logger.log('');
  logger.log('Non-interactive with template arguments:');
  logger.log(
    '  bunx @lucid-agents/create-agent-kit my-agent --template=identity \\'
  );
  logger.log('    --non-interactive \\');
  logger.log('    --AGENT_DESCRIPTION="My agent" \\');
  logger.log('    --PAYMENTS_RECEIVABLE_ADDRESS="0x..."');
}

function printBanner(logger: RunLogger) {
  LUCID_BANNER.forEach(line => logger.log(line));
}

async function loadTemplates(
  templateRoot: string
): Promise<TemplateDescriptor[]> {
  const entries = await fs.readdir(templateRoot, { withFileTypes: true });
  const descriptors: TemplateDescriptor[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const path = join(templateRoot, id);
    const metaPath = join(path, 'template.json');
    let title = toTitleCase(id);
    let description: string | undefined;
    let wizard: WizardConfig | undefined;
    let adapters: string[] = ['hono'];

    try {
      const raw = await fs.readFile(metaPath, 'utf8');
      const meta = JSON.parse(raw) as TemplateMeta;
      title = meta.name ?? toTitleCase(id);
      description = meta.description;
      wizard = normalizeWizardConfig(meta.wizard);

      // Support both new adapters array and legacy adapter string
      if (meta.adapters && Array.isArray(meta.adapters)) {
        adapters = meta.adapters.map(a => a.toLowerCase());
      } else if (meta.adapter) {
        adapters = [meta.adapter.toLowerCase()];
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    adapters = Array.from(new Set(adapters));
    if (adapters.length === 0) {
      adapters = ['hono'];
    }

    descriptors.push({
      id,
      adapters,
      title,
      description,
      path,
      wizard,
    });
  }

  return descriptors.sort((a, b) => a.id.localeCompare(b.id));
}

function formatAdapterName(adapter: string): string {
  return getAdapterDisplayName(adapter);
}

function normalizeWizardConfig(
  config?: WizardConfig
): WizardConfig | undefined {
  if (!config) return undefined;
  const prompts =
    config.prompts
      ?.map((prompt: any) => {
        if (!prompt || !prompt.key || !prompt.type) {
          return undefined;
        }
        if (
          prompt.type !== 'input' &&
          prompt.type !== 'confirm' &&
          prompt.type !== 'select'
        ) {
          return undefined;
        }
        return { ...prompt };
      })
      .filter((prompt): prompt is WizardPrompt => Boolean(prompt)) ?? [];

  if (prompts.length === 0) {
    return undefined;
  }

  return { prompts };
}

async function resolveTemplate(params: {
  templates: TemplateDescriptor[];
  requestedId?: string;
  requestedAdapter?: string;
  prompt?: PromptApi;
  logger: RunLogger;
}): Promise<{ template: TemplateDescriptor; adapter: string }> {
  const { templates, requestedId, requestedAdapter, prompt, logger } = params;
  const normalizedAdapter = requestedAdapter?.toLowerCase();

  if (requestedId) {
    const match = templates.find(t => t.id === requestedId);
    if (!match) {
      const available = templates.map(t => t.id).join(', ');
      throw new Error(
        `Unknown template "${requestedId}". Available templates: ${available}`
      );
    }
    const supportedAdapters = match.adapters.filter(isAdapterSupported);
    if (supportedAdapters.length === 0) {
      throw new Error(
        `Template "${requestedId}" does not support any known runtime adapters.`
      );
    }
    if (normalizedAdapter) {
      if (!isAdapterSupported(normalizedAdapter)) {
        const supported = supportedAdapters.map(formatAdapterName).join(', ');
        throw new Error(
          `Unknown adapter "${normalizedAdapter}". Supported adapters for template "${requestedId}": ${supported}`
        );
      }
      if (!match.adapters.includes(normalizedAdapter)) {
        const supported = supportedAdapters.map(formatAdapterName).join(', ');
        throw new Error(
          `Template "${requestedId}" does not support adapter "${normalizedAdapter}". Supported adapters: ${supported}`
        );
      }
      return { template: match, adapter: normalizedAdapter };
    }
    return { template: match, adapter: supportedAdapters[0]! };
  }

  // Collect all unique adapters from templates, warning about unknown adapters
  const allAdapters = new Set<string>();
  const unknownAdapters = new Set<string>();
  for (const template of templates) {
    for (const adapter of template.adapters) {
      if (!isAdapterSupported(adapter)) {
        if (!unknownAdapters.has(adapter)) {
          logger.warn(
            `Template "${template.id}" references unknown adapter "${adapter}".`
          );
          unknownAdapters.add(adapter);
        }
        continue;
      }
      allAdapters.add(adapter);
    }
  }
  const adapters = Array.from(allAdapters);

  if (adapters.length === 0) {
    throw new Error('No valid adapters found in templates');
  }

  if (normalizedAdapter && !adapters.includes(normalizedAdapter)) {
    const available = adapters.map(formatAdapterName).join(', ');
    throw new Error(
      `Adapter "${normalizedAdapter}" is not available. Supported adapters: ${available}`
    );
  }

  let selectedAdapter: string = normalizedAdapter ?? adapters[0]!;

  // Always prompt for adapter selection if multiple adapters exist and none was requested
  if (!normalizedAdapter && adapters.length > 1) {
    if (!prompt) {
      const available = adapters.map(formatAdapterName).join(', ');
      throw new Error(
        `Multiple runtime adapters available (${available}). Re-run with --template <name> or pass --adapter <adapter>.`
      );
    }

    const adapterChoices: PromptChoice[] = adapters.map(adapter => ({
      value: adapter,
      title: formatAdapterName(adapter),
    }));

    selectedAdapter = await prompt.select({
      message: 'Select a runtime adapter:',
      choices: adapterChoices,
    });
  } else if (prompt) {
    logger.log(`Using runtime adapter: ${formatAdapterName(selectedAdapter)}`);
  }

  // Filter templates that are compatible with the selected adapter
  const candidates = templates.filter(t =>
    t.adapters.includes(selectedAdapter)
  );
  if (candidates.length === 0) {
    const available = adapters.map(formatAdapterName).join(', ');
    throw new Error(
      `No templates found for adapter "${selectedAdapter}". Available adapters: ${available}`
    );
  }

  if (candidates.length === 1) {
    return { template: candidates[0]!, adapter: selectedAdapter };
  }

  if (!prompt) {
    const available = candidates.map(t => t.id).join(', ');
    throw new Error(
      `Multiple templates available for adapter "${selectedAdapter}" (${available}). Re-run with --template <name>.`
    );
  }

  const choices: PromptChoice[] = candidates.map(template => ({
    value: template.id,
    title: template.title,
    description: template.description,
  }));

  const selection = await prompt.select({
    message: `Select a template for ${formatAdapterName(selectedAdapter)}:`,
    choices,
  });

  const match = candidates.find(t => t.id === selection);
  if (!match) {
    logger.warn(
      `Template "${selection}" not found; falling back to first option.`
    );
    return { template: candidates[0]!, adapter: selectedAdapter };
  }
  return { template: match, adapter: selectedAdapter };
}

function toTitleCase(value: string) {
  return value
    .split(/[-_]/g)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toPackageName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return normalized.length > 0 ? normalized : 'agent-app';
}

async function resolveProjectName(params: {
  parsed: ParsedArgs;
  prompt?: PromptApi;
  logger: RunLogger;
  template: TemplateDescriptor;
}): Promise<string> {
  const { parsed, prompt, logger, template } = params;

  if (parsed.target && parsed.target.trim().length > 0) {
    return parsed.target;
  }

  const defaultName = buildDefaultProjectName({ parsed, template });

  if (prompt) {
    const response = await prompt.input({
      message: PROJECT_NAME_PROMPT,
      defaultValue: defaultName,
    });
    const sanitized = sanitizeAnswerString(response);
    return sanitized.length > 0 ? sanitized : defaultName;
  }

  logger.log(`No <app-name> supplied; defaulting to "${defaultName}".`);
  return defaultName;
}

function buildDefaultProjectName(params: {
  parsed: ParsedArgs;
  template: TemplateDescriptor;
}): string {
  const templateId = params.parsed.options.templateId ?? params.template?.id;

  const candidateSource =
    typeof templateId === 'string' && templateId.length > 0
      ? templateId
      : DEFAULT_PROJECT_NAME;

  let candidate = toPackageName(candidateSource);
  if (!candidate || candidate.length === 0) {
    candidate = DEFAULT_PROJECT_NAME;
  }

  if (candidate !== DEFAULT_PROJECT_NAME && !candidate.endsWith('-agent')) {
    candidate = `${candidate}-agent`;
  }

  return candidate;
}

async function collectWizardAnswers(params: {
  template: TemplateDescriptor;
  prompt?: PromptApi;
  context: Record<string, string>;
  preSuppliedArgs?: Map<string, string>;
}): Promise<WizardAnswers> {
  const { template, prompt, context, preSuppliedArgs } = params;
  const answers: WizardAnswers = new Map();
  const prompts = template.wizard?.prompts ?? [];

  for (const question of prompts) {
    // Check if we have a pre-supplied value for this key
    if (preSuppliedArgs?.has(question.key)) {
      const preSupplied = preSuppliedArgs.get(question.key);
      if (question.type === 'confirm') {
        const normalized = preSupplied?.trim().toLowerCase() ?? '';
        const boolValue = ['true', 'yes', 'y', '1'].includes(normalized);
        answers.set(question.key, boolValue);
      } else {
        answers.set(question.key, sanitizeAnswerString(preSupplied ?? ''));
      }
      continue;
    }

    if (!shouldAskWizardPrompt(question, answers)) {
      continue;
    }

    const defaultValue = resolveWizardDefault({
      question,
      context,
      answers,
    });

    const response = await askWizardPrompt({
      promptApi: prompt,
      question,
      defaultValue,
    });

    if (question.type === 'confirm') {
      answers.set(question.key, Boolean(response));
    } else {
      answers.set(question.key, sanitizeAnswerString(String(response)));
    }
  }

  return answers;
}

function shouldAskWizardPrompt(
  question: WizardPrompt,
  answers: WizardAnswers
): boolean {
  if (!question.when) return true;
  const gateValue = answers.get(question.when.key);
  if (question.when.equals !== undefined) {
    return gateValue === question.when.equals;
  }
  if (question.when.in?.length) {
    return question.when.in.includes(gateValue as never);
  }
  return true;
}

function resolveWizardDefault(params: {
  question: WizardPrompt;
  context: Record<string, string>;
  answers: WizardAnswers;
}): string | boolean | undefined {
  const { question, context, answers } = params;
  const baseContext = context;

  if (question.type === 'confirm') {
    if (typeof question.defaultValue === 'boolean') {
      return question.defaultValue;
    }
    if (typeof question.defaultValue === 'string') {
      const normalized = question.defaultValue.trim().toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
      if (['false', 'no', 'n', '0'].includes(normalized)) return false;
    }
    return undefined;
  }

  if (typeof question.defaultValue === 'string') {
    return interpolateTemplateString(
      question.defaultValue,
      baseContext,
      answers
    );
  }
  if (typeof question.defaultValue === 'boolean') {
    return question.defaultValue ? 'true' : 'false';
  }

  return undefined;
}

async function askWizardPrompt(params: {
  promptApi?: PromptApi;
  question: WizardPrompt;
  defaultValue: string | boolean | undefined;
}): Promise<string | boolean> {
  const { promptApi, question, defaultValue } = params;

  if (!promptApi) {
    return getNonInteractiveAnswer(question, defaultValue);
  }

  if (question.type === 'input') {
    const defaultString =
      typeof defaultValue === 'string' ? defaultValue : undefined;
    const answer = await promptApi.input({
      message: question.message,
      defaultValue: defaultString,
    });
    return sanitizeAnswerString(answer);
  }

  if (question.type === 'confirm') {
    const defaultBool =
      typeof defaultValue === 'boolean'
        ? defaultValue
        : typeof defaultValue === 'string'
          ? ['true', 'yes', 'y', '1'].includes(
              defaultValue.trim().toLowerCase()
            )
          : false;

    return promptApi.confirm({
      message: question.message,
      defaultValue: defaultBool,
    });
  }

  const choices = question.choices ?? [];
  if (choices.length === 0) {
    throw new Error(`Prompt "${question.key}" is missing choices.`);
  }

  const selected = await promptApi.select({
    message: question.message,
    choices,
  });

  return sanitizeAnswerString(selected);
}

function getNonInteractiveAnswer(
  question: WizardPrompt,
  defaultValue: string | boolean | undefined
): string | boolean {
  if (question.type === 'confirm') {
    if (typeof defaultValue === 'boolean') {
      return defaultValue;
    }
    if (typeof defaultValue === 'string') {
      const normalized = defaultValue.trim().toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
      if (['false', 'no', 'n', '0'].includes(normalized)) return false;
    }
    return false;
  }

  if (question.type === 'select') {
    if (typeof defaultValue === 'string' && defaultValue.length > 0) {
      return sanitizeAnswerString(defaultValue);
    }
    const choice = question.choices?.[0];
    if (!choice) {
      throw new Error(`Prompt "${question.key}" is missing choices.`);
    }
    return sanitizeAnswerString(choice.value);
  }

  if (typeof defaultValue === 'string') {
    return sanitizeAnswerString(defaultValue);
  }

  return '';
}

function interpolateTemplateString(
  template: string,
  context: Record<string, string>,
  answers: WizardAnswers
): string {
  return template.replace(/{{([A-Z0-9_]+)}}/g, (_, token: string) => {
    const fromAnswers = answers.get(token);
    if (typeof fromAnswers === 'string') {
      return fromAnswers;
    }
    if (typeof fromAnswers === 'boolean') {
      return fromAnswers ? 'true' : 'false';
    }

    if (Object.prototype.hasOwnProperty.call(context, token)) {
      return context[token] ?? '';
    }

    return '';
  });
}

function sanitizeAnswerString(value: string): string {
  return value.replace(/\r/g, '').trim();
}

class TemplateError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}

type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

type TemplateMetadata = {
  id?: string;
  package?: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  [key: string]: unknown;
};

function parseTemplateSections(content: string): Record<string, string> {
  const markers = [
    '{{ADAPTER_IMPORTS}}',
    '{{ADAPTER_PRE_SETUP}}',
    '{{ADAPTER_POST_SETUP}}',
  ] as const;

  for (const marker of markers) {
    if (!content.includes(marker)) {
      throw new TemplateError(
        `Template missing required marker: ${marker}`,
        'MISSING_MARKER'
      );
    }
  }

  const sections: Record<string, string> = {};
  let currentSection = 'before-imports';
  let currentContent: string[] = [];

  for (const line of content.split('\n')) {
    const foundMarker = markers.find(m => line.trim() === m);

    if (foundMarker) {
      sections[currentSection] = currentContent.join('\n').trim();
      currentSection = foundMarker;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  sections[currentSection] = currentContent.join('\n').trim();

  return sections;
}

function mergeAdapterAndTemplate(
  adapterSnippets: AdapterSnippets,
  templateSections: Record<string, string>
): string {
  const parts: string[] = [
    'import { z } from "zod";',
    adapterSnippets.imports,
    templateSections['{{ADAPTER_IMPORTS}}'] || '',
    '',
    adapterSnippets.preSetup,
    templateSections['{{ADAPTER_PRE_SETUP}}'] || '',
    '',
    adapterSnippets.appCreation,
    '',
    adapterSnippets.entrypointRegistration,
    '',
    adapterSnippets.postSetup,
    templateSections['{{ADAPTER_POST_SETUP}}'] || '',
    '',
    adapterSnippets.exports,
  ];

  return parts.filter(p => p.trim().length > 0).join('\n\n');
}

function mergePackageJson(
  adapterPkg: PackageJson,
  templatePkg: TemplateMetadata
): PackageJson {
  if (!adapterPkg || typeof adapterPkg !== 'object') {
    throw new TemplateError(
      'Invalid adapter package.json',
      'INVALID_ADAPTER_PKG'
    );
  }

  if (!templatePkg || !templatePkg.package) {
    return adapterPkg;
  }
  const conflicts: string[] = [];
  const adapterDeps = adapterPkg.dependencies || {};
  const templateDeps = templatePkg.package.dependencies || {};

  for (const [name, version] of Object.entries(templateDeps)) {
    if (adapterDeps[name] && adapterDeps[name] !== version) {
      conflicts.push(
        `${name}: adapter=${adapterDeps[name]}, template=${version}`
      );
    }
  }

  if (conflicts.length > 0) {
    console.warn(
      'Dependency version conflicts detected (template version will be used):'
    );
    conflicts.forEach(c => console.warn(`  - ${c}`));
  }

  return {
    ...adapterPkg,
    dependencies: {
      ...adapterPkg.dependencies,
      ...templatePkg.package.dependencies,
    },
    devDependencies: {
      ...adapterPkg.devDependencies,
      ...templatePkg.package.devDependencies,
    },
  };
}

function validateAdapterCompatibility(
  templateMeta: TemplateDescriptor,
  adapterId: string
): void {
  if (!templateMeta.adapters || templateMeta.adapters.length === 0) {
    return;
  }

  if (!templateMeta.adapters.includes(adapterId)) {
    throw new TemplateError(
      `Template "${templateMeta.id}" does not support adapter "${adapterId}". ` +
        `Supported adapters: ${templateMeta.adapters.join(', ')}`,
      'INCOMPATIBLE_ADAPTER'
    );
  }
}

function validateAdapterExists(adapterId: string): void {
  if (!isAdapterSupported(adapterId)) {
    const available = ['hono', 'tanstack'];
    throw new TemplateError(
      `Adapter "${adapterId}" does not exist. ` +
        `Available adapters: ${available.join(', ')}`,
      'ADAPTER_NOT_FOUND'
    );
  }
}

function buildTemplateReplacements(params: {
  projectDirName: string;
  packageName: string;
  answers: WizardAnswers;
  adapter: AdapterDefinition;
  templateId?: string;
  adapterOptions?: AdapterOptions;
}): Record<string, string> {
  const {
    projectDirName,
    packageName,
    adapter,
    answers,
    templateId,
    adapterOptions,
  } = params;
  const { snippets } = adapter;

  const answerEntries: Record<string, string> = {};
  for (const [key, value] of answers.entries()) {
    if (typeof value === 'string') {
      answerEntries[key] = value;
    } else {
      answerEntries[key] = value ? 'true' : 'false';
    }
  }

  return {
    ...answerEntries,
    AGENT_NAME: projectDirName,
    APP_NAME: projectDirName,
    PACKAGE_NAME: packageName,
    ADAPTER_ID: adapter.id,
    ADAPTER_DISPLAY_NAME: adapter.displayName,
    ADAPTER_VARIANT:
      adapterOptions?.variant ?? adapter.defaultVariant ?? 'default',
    ADAPTER_IMPORTS: snippets.imports,
    ADAPTER_PRE_SETUP: snippets.preSetup,
    ADAPTER_APP_CREATION: snippets.appCreation,
    ADAPTER_ENTRYPOINT_REGISTRATION: snippets.entrypointRegistration,
    ADAPTER_POST_SETUP: snippets.postSetup,
    ADAPTER_EXPORTS: snippets.exports,
    ...(adapter.buildReplacements
      ? adapter.buildReplacements({
          answers,
          templateId,
          options: adapterOptions,
        })
      : {}),
  };
}

async function assertTemplatePresent(templatePath: string) {
  const exists = existsSync(templatePath);
  if (!exists) {
    throw new Error(`Template not found at ${templatePath}`);
  }
}

async function assertTargetDirectory(targetDir: string) {
  try {
    await fs.mkdir(targetDir, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }

  const entries = await fs.readdir(targetDir);
  const filtered = entries.filter(name => name !== '.DS_Store');
  if (filtered.length > 0) {
    throw new Error(
      `Target directory ${targetDir} already exists and is not empty.`
    );
  }
}

async function copyTemplate(
  templateRoot: string,
  targetDir: string,
  adapter: AdapterDefinition,
  adapterOptions: AdapterOptions
) {
  const adapterLayers = getAdapterLayers(adapter, adapterOptions);
  for (const layer of adapterLayers) {
    await copyAdapterLayer(layer, targetDir);
  }

  const entries = await fs.readdir(templateRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (entry.name === 'agent.ts.template') continue;
    if (entry.name === 'package.json' || entry.name === 'tsconfig.json')
      continue;

    const sourcePath = join(templateRoot, entry.name);
    const targetPath = join(targetDir, entry.name);
    await fs.copyFile(sourcePath, targetPath);
  }
}

async function copyAdapterLayer(
  sourceDir: string | undefined,
  targetDir: string
) {
  if (!sourceDir) return;
  try {
    await fs.cp(sourceDir, targetDir, {
      recursive: true,
      errorOnExist: false,
      filter: source => {
        // Skip .template files - they'll be processed separately
        return !source.endsWith('.template');
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function applyTemplateTransforms(
  targetDir: string,
  params: {
    packageName: string;
    replacements: Record<string, string>;
    adapter: AdapterDefinition;
    templateRoot: string;
    templateMeta: TemplateMetadata;
  }
) {
  const packageJsonPath = join(targetDir, 'package.json');
  const adapterPkgRaw = await fs.readFile(packageJsonPath, 'utf8');
  const adapterPkg = JSON.parse(adapterPkgRaw) as PackageJson;
  const mergedPkg = mergePackageJson(adapterPkg, params.templateMeta);
  mergedPkg.name = params.packageName;
  await fs.writeFile(
    packageJsonPath,
    `${JSON.stringify(mergedPkg, null, 2)}\n`,
    'utf8'
  );

  const templateAgentPath = join(params.templateRoot, 'agent.ts.template');
  const templateAgentExists = existsSync(templateAgentPath);

  if (templateAgentExists) {
    const templateAgentContent = await fs.readFile(templateAgentPath, 'utf8');
    const templateSections = parseTemplateSections(templateAgentContent);
    const mergedAgentContent = mergeAdapterAndTemplate(
      params.adapter.snippets,
      templateSections
    );

    // Get target path from adapter, but remove .template extension
    const adapterTarget =
      params.adapter.placeholderTargets?.[0] || 'src/lib/agent.ts.template';
    const agentTargetPath = join(
      targetDir,
      adapterTarget.replace(/\.template$/, '')
    );

    await fs.writeFile(agentTargetPath, mergedAgentContent, 'utf8');
  }

  await replaceTemplatePlaceholders(
    join(targetDir, 'README.md'),
    params.replacements
  );

  await removeTemplateArtifacts(targetDir);
}

async function replaceTemplatePlaceholders(
  filePath: string,
  replacements: Record<string, string>
) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    let replaced = raw;
    for (const [key, value] of Object.entries(replacements)) {
      replaced = replaced.replaceAll(`{{${key}}}`, value);
    }
    if (replaced === raw) {
      return;
    }
    await fs.writeFile(filePath, replaced, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function removeTemplateArtifacts(targetDir: string) {
  const metaPath = join(targetDir, 'template.json');
  await fs.rm(metaPath, { force: true });
}

async function setupEnvironment(params: {
  targetDir: string;
  skipWizard: boolean;
  wizardAnswers: WizardAnswers;
  agentName: string;
  template: TemplateDescriptor;
}) {
  const { targetDir, wizardAnswers, agentName, template } = params;
  const envPath = join(targetDir, '.env');

  const lines = [`AGENT_NAME=${agentName}`];

  for (const prompt of template.wizard?.prompts || []) {
    // Check wizard answers first (includes CLI args in non-interactive mode)
    // Fall back to default value if not present
    const answer = wizardAnswers.get(prompt.key);
    const value = answer !== undefined ? answer : prompt.defaultValue;
    // Convert to string, handling boolean false correctly
    const stringValue = value == null ? '' : String(value);

    lines.push(`${prompt.key}=${stringValue}`);
  }

  await fs.writeFile(envPath, lines.join('\n') + '\n', 'utf8');
}

async function runInstall(cwd: string, logger: RunLogger) {
  logger.log('Running `bun install`...');
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('bun', ['install'], {
        cwd,
        stdio: 'inherit',
      });

      child.on('error', error => reject(error));
      child.on('exit', code => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`bun install exited with code ${code ?? 'unknown'}`)
          );
        }
      });
    });
  } catch {
    logger.warn(
      'Failed to run `bun install`. Please install dependencies manually.'
    );
  }
}

function createInteractivePrompt(logger: RunLogger): PromptApi | undefined {
  if (!defaultInput.isTTY || !defaultOutput.isTTY) {
    return undefined;
  }

  const rl = createInterface({
    input: defaultInput,
    output: defaultOutput,
  });

  return {
    async select({ message, choices }) {
      logger.log(message);
      choices.forEach((choice, index) => {
        const detail = choice.description ? ` – ${choice.description}` : '';
        logger.log(`  ${index + 1}. ${choice.title}${detail}`);
      });
      const range = `1-${choices.length}`;
      while (true) {
        const answer = await rl.question(`Select an option [${range}]: `);
        const parsed = Number.parseInt(answer, 10);
        if (
          Number.isInteger(parsed) &&
          parsed >= 1 &&
          parsed <= choices.length
        ) {
          return choices[parsed - 1]!.value;
        }
        logger.log('Please enter a valid option number.');
      }
    },
    async confirm({ message, defaultValue = true }) {
      const suffix = defaultValue ? 'Y/n' : 'y/N';
      while (true) {
        const answer = await rl.question(`${message} (${suffix}) `);
        const normalized = answer.trim().toLowerCase();
        if (normalized === '' && defaultValue !== undefined) {
          return defaultValue;
        }
        if (['y', 'yes'].includes(normalized)) return true;
        if (['n', 'no'].includes(normalized)) return false;
        logger.log('Please respond with y or n.');
      }
    },
    async input({ message, defaultValue = '' }) {
      const promptMessage =
        defaultValue && defaultValue.length > 0
          ? `${message} (${defaultValue}): `
          : `${message}: `;
      const answer = await rl.question(promptMessage);
      return answer === '' ? defaultValue : answer;
    },
    async close() {
      await rl.close();
    },
  };
}

async function main() {
  const prompt = createInteractivePrompt(defaultLogger);
  try {
    await runCli(process.argv.slice(2), {
      prompt,
    });
  } catch (error) {
    defaultLogger.error(`\nError: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    await prompt?.close?.();
  }
}

const isCliEntryPoint = (() => {
  if (!process.argv[1]) {
    return false;
  }
  try {
    const entryPath = realpathSync(process.argv[1]);
    const modulePath = realpathSync(fileURLToPath(import.meta.url));
    return entryPath === modulePath;
  } catch {
    return false;
  }
})();

if (isCliEntryPoint) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main();
}
