import { spawn } from 'node:child_process';
import {
  type Dirent,
  existsSync,
  realpathSync,
} from 'node:fs';
import fs from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import process, {
  stdin as defaultInput,
  stdout as defaultOutput,
} from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  type AdapterDefinition,
  type AdapterOptions,
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
  featureIds?: string[];
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
  multiSelect?: (params: {
    message: string;
    choices: PromptChoice[];
  }) => Promise<string[]>;
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
  /** Default feature IDs to include */
  features?: string[];
  wizard?: WizardConfig;
};

type FeatureMeta = {
  id?: string;
  name?: string;
  description?: string;
  files?: string[];
  entry?: string;
  dependencies?: FeatureDependencies;
  wizard?: WizardConfig;
  readme?: string;
  env?: string[];
  snippets?: Partial<FeatureSnippetPaths>;
};

type FeatureSnippetPaths = {
  imports?: string;
  preApp?: string;
  postApp?: string;
  entrypoints?: string;
  exports?: string;
  agentOptions?: string;
};

type TemplateDescriptor = {
  id: string;
  /** Array of compatible adapters */
  adapters: string[];
  title: string;
  description?: string;
  path: string;
  wizard?: WizardConfig;
  defaultFeatures?: string[];
  supportsFeatures: boolean;
};

type WizardAnswers = Map<string, string | boolean>;

type FeatureDependencies = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type FeatureDescriptor = {
  id: string;
  title: string;
  description?: string;
  files: string[];
  entryModule: string;
  dir: string;
  dependencies?: FeatureDependencies;
  wizard?: WizardConfig;
  readmePath?: string;
  extraEnv?: string[];
  snippets?: FeatureSnippetPaths;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_ROOT = resolve(__dirname, '../templates');
const FEATURE_ROOT = resolve(__dirname, '../features');

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

// DEFAULT_TEMPLATE_VALUES removed - use template.json defaults only

const DEFAULT_PROJECT_NAME = 'agent-app';
const PROJECT_NAME_PROMPT = 'Project directory name:';

const defaultLogger: RunLogger = {
  log: message => console.log(message),
  warn: message => console.warn(message),
  error: message => console.error(message),
};

const LEGACY_TEMPLATE_FEATURES: Record<string, string[]> = {
  axllm: ['axllm'],
  'axllm-flow': ['axllm-flow'],
  identity: ['identity'],
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
  const features = await loadFeatures(FEATURE_ROOT);

  const { template, adapter: selectedAdapter } = await resolveTemplate({
    templates,
    requestedId: parsed.options.templateId,
    requestedAdapter: parsed.options.adapterId,
    prompt,
    logger,
  });
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

  const { selected: selectedFeatures } = await resolveSelectedFeatures({
    template,
    allFeatures: features,
    requestedIds: parsed.options.featureIds ?? [],
    prompt: parsed.options.skipWizard ? undefined : prompt,
    logger,
  });
  if (selectedFeatures.length > 0) {
    logger.log(
      `Features: ${selectedFeatures.map(feature => feature.title).join(', ')}`
    );
  }

  const mergedWizard = mergeWizardConfigs(
    template.wizard,
    ...selectedFeatures.map(feature => feature.wizard)
  );

  const templateForWizard =
    mergedWizard && mergedWizard !== template.wizard
      ? { ...template, wizard: mergedWizard }
      : template;

  const projectName = await resolveProjectName({
    parsed,
    prompt,
    logger,
    template: templateForWizard,
  });

  const targetDir = projectName === '.' ? cwd : resolve(cwd, projectName);
  const projectDirName = basename(targetDir);
  const packageName = toPackageName(projectDirName);

  await assertTemplatePresent(template.path);
  await assertTargetDirectory(targetDir);
  const wizardAnswers = await collectWizardAnswers({
    template: templateForWizard,
    prompt: parsed.options.skipWizard ? undefined : prompt,
    context: {
      AGENT_NAME: projectDirName,
      PACKAGE_NAME: packageName,
    },
    preSuppliedArgs: parsed.options.skipWizard
      ? parsed.options.templateArgs
      : undefined,
  });
  const replacements = await buildTemplateReplacements({
    projectDirName,
    packageName,
    answers: wizardAnswers,
    adapter: adapterDefinition,
    templateId: template.id,
    adapterOptions,
    features: selectedFeatures,
  });
  const featureDependencies = mergeFeatureDependencies(selectedFeatures);
  await copyTemplate(
    template.path,
    targetDir,
    adapterDefinition,
    adapterOptions
  );
  await applyTemplateTransforms(targetDir, {
    packageName,
    replacements,
    adapter: adapterDefinition,
    dependencies: featureDependencies,
  });
  await applyFeatureAssets({
    targetDir,
    features: selectedFeatures,
  });

  const extraEnv = selectedFeatures.flatMap(
    feature => feature.extraEnv ?? []
  );

  await setupEnvironment({
    targetDir,
    wizardAnswers,
    agentName: projectDirName,
    template: templateForWizard,
    extraEnv,
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
  logger.log(`✨  Created agent app in ${relativeTarget}`);
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
    featureIds: [],
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
    } else if (
      arg === '--adapter' ||
      arg === '--framework' ||
      arg === '-a'
    ) {
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
    } else if (arg === '--feature' || arg === '-f') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('Expected value after --feature');
      }
      addFeatureArgs(value, options);
      i += 1;
    } else if (arg?.startsWith('--feature=')) {
      const value = arg.slice('--feature='.length);
      addFeatureArgs(value, options);
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

  if (options.templateId && options.templateId !== 'blank') {
    const presetFeatures = LEGACY_TEMPLATE_FEATURES[options.templateId];
    if (!presetFeatures) {
      throw new Error(
        `Unknown template "${options.templateId}". Available templates: blank`
      );
    }
    presetFeatures.forEach(feature => options.featureIds?.push(feature));
    options.templateId = 'blank';
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

function addFeatureArgs(value: string, options: CliOptions) {
  const entries = value
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(entry => entry.length > 0);
  entries.forEach(entry => options.featureIds?.push(entry));
}

function printHelp(logger: RunLogger) {
  logger.log('Usage: bunx @lucid-agents/create-agent-kit <app-name> [options]');
  logger.log('');
  logger.log('Options:');
  logger.log(
    '  -t, --template <id>   Legacy preset name (blank by default; axllm/identity map to features)'
  );
  logger.log(
    '  -a, --adapter <id>    Select runtime adapter/framework (hono, tanstack, etc.)'
  );
  logger.log(
    '      --adapter-ui <mode>  Adapter-specific mode (ui, headless for TanStack)'
  );
  logger.log(
    '  -f, --feature <id>    Include an additional feature (axllm, axllm-flow, ...)'
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
    let defaultFeatures: string[] | undefined;
    let supportsFeatures = false;

    try {
      const raw = await fs.readFile(metaPath, 'utf8');
      const meta = JSON.parse(raw) as TemplateMeta;
      title = meta.name ?? toTitleCase(id);
      description = meta.description;
      wizard = normalizeWizardConfig(meta.wizard);
      if (Array.isArray(meta.features)) {
        defaultFeatures = meta.features.filter(
          feature => typeof feature === 'string'
        );
        supportsFeatures = true;
      }

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
      defaultFeatures,
      supportsFeatures,
    });
  }

  return descriptors.sort((a, b) => a.id.localeCompare(b.id));
}

async function loadFeatures(
  featureRoot: string
): Promise<FeatureDescriptor[]> {
  const descriptors: FeatureDescriptor[] = [];
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(featureRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const dir = join(featureRoot, id);
    const metaPath = join(dir, 'feature.json');
    let title = toTitleCase(id);
    let description: string | undefined;
    let entryModule = `src/features/${id}.ts`;
    let dependencies: FeatureDependencies | undefined;
    let wizard: WizardConfig | undefined;
    let readmePath: string | undefined;
    let extraEnv: string[] | undefined;
    let snippets: FeatureSnippetPaths | undefined;

    try {
      const raw = await fs.readFile(metaPath, 'utf8');
      const meta = JSON.parse(raw) as FeatureMeta;
      title = meta.name ?? title;
      description = meta.description;
      entryModule = meta.entry ?? entryModule;
      dependencies = meta.dependencies;
      wizard = normalizeWizardConfig(meta.wizard);
      if (typeof meta.readme === 'string') {
        readmePath = join(dir, meta.readme);
      }
      if (Array.isArray(meta.env) && meta.env.length > 0) {
        extraEnv = meta.env.map(value => String(value));
      }
      if (meta.snippets && typeof meta.snippets === 'object') {
        snippets = {
          imports: meta.snippets.imports,
          preApp: meta.snippets.preApp,
          postApp: meta.snippets.postApp,
          entrypoints: meta.snippets.entrypoints,
          exports: meta.snippets.exports,
          agentOptions: meta.snippets.agentOptions,
        };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Skip feature directories without metadata
        continue;
      }
      throw error;
    }

    descriptors.push({
      id,
      title,
      description,
      files: [],
      entryModule,
      dir,
      dependencies,
      wizard,
      readmePath,
      extraEnv,
      snippets,
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
      ?.map((prompt): WizardPrompt | undefined => {
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

function mergeWizardConfigs(
  ...configs: Array<WizardConfig | undefined>
): WizardConfig | undefined {
  const combinedPrompts =
    configs.flatMap(config => config?.prompts ?? []) ?? [];
  if (combinedPrompts.length === 0) {
    return undefined;
  }

  return normalizeWizardConfig({
    prompts: combinedPrompts,
  });
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

async function resolveSelectedFeatures(params: {
  template: TemplateDescriptor;
  allFeatures: FeatureDescriptor[];
  requestedIds: string[];
  prompt?: PromptApi;
  logger?: RunLogger;
}): Promise<{ selected: FeatureDescriptor[] }> {
  const { template, allFeatures, requestedIds, prompt, logger } = params;
  const featureMap = new Map(allFeatures.map(feature => [feature.id, feature]));
  const selectedIds = new Set<string>();

  if (template.supportsFeatures) {
    const defaults = template.defaultFeatures ?? [];
    if (defaults.length === 0) {
      throw new Error(
        `Template "${template.id}" enables features but does not specify any defaults.`
      );
    }
    for (const id of defaults) {
      const descriptor = featureMap.get(id);
      if (!descriptor) {
        const available = allFeatures.map(feature => feature.id).join(', ');
        throw new Error(
          `Template "${template.id}" references unknown feature "${id}". Available features: ${available}`
        );
      }
      selectedIds.add(descriptor.id);
    }
  } else if (requestedIds.length > 0) {
    throw new Error(
      `Template "${template.id}" does not support --feature selections.`
    );
  }

  for (const requested of requestedIds) {
    const normalized = requested.toLowerCase();
    const descriptor = featureMap.get(normalized);
    if (!descriptor) {
      const available = allFeatures.map(feature => feature.id).join(', ');
      throw new Error(
        `Unknown feature "${requested}". Available features: ${available}`
      );
    }
    selectedIds.add(descriptor.id);
  }

  if (template.supportsFeatures && prompt) {
    const availableToAdd = () =>
      allFeatures.filter(feature => !selectedIds.has(feature.id));

    let available = availableToAdd();
    if (available.length > 0) {
      if (prompt.multiSelect) {
        const selection = await prompt.multiSelect({
          message:
            'Select additional features (space to toggle, enter to confirm):',
          choices: available.map(feature => ({
            value: feature.id,
            title: feature.title,
            description: feature.description,
          })),
        });
        selection.forEach(id => {
          if (featureMap.has(id)) {
            selectedIds.add(id);
          }
        });
      } else {
        logger?.log('Optional features:');
        available.forEach((feature, index) => {
          const description = feature.description
            ? ` – ${feature.description}`
            : '';
          logger?.log(`  ${index + 1}. ${feature.title}${description}`);
        });

        while (available.length > 0) {
          const answer = await prompt.input({
            message:
              'Enter feature numbers separated by commas (press enter to skip):',
            defaultValue: '',
          });
          const trimmed = sanitizeAnswerString(answer);
          if (!trimmed) {
            break;
          }

          const selections = trimmed
            .split(',')
            .map(part => part.trim())
            .filter(Boolean)
            .map(part => Number.parseInt(part, 10))
            .filter(Number.isFinite);

          const invalid = selections.find(
            index => index < 1 || index > available.length
          );
          if (invalid) {
            logger?.warn(
              `Please choose numbers between 1 and ${available.length}.`
            );
            continue;
          }

          const uniqueSelections = Array.from(new Set(selections));

          uniqueSelections.forEach(index => {
            const feature = available[index - 1];
            if (feature) {
              selectedIds.add(feature.id);
            }
          });

          available = availableToAdd();
          if (available.length === 0) {
            break;
          }

          logger?.log('Remaining optional features:');
          available.forEach((feature, index) => {
            const description = feature.description
              ? ` – ${feature.description}`
              : '';
            logger?.log(`  ${index + 1}. ${feature.title}${description}`);
          });
        }
      }
    }
  }

  const selected = Array.from(selectedIds).map(id => {
    const descriptor = featureMap.get(id);
    if (!descriptor) {
      throw new Error(`Feature "${id}" is not defined.`);
    }
    return descriptor;
  });

  if (template.supportsFeatures && selected.length === 0) {
    throw new Error(
      `Template "${template.id}" requires at least one feature to be selected.`
    );
  }

  return { selected };
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

async function buildTemplateReplacements(params: {
  projectDirName: string;
  packageName: string;
  answers: WizardAnswers;
  adapter: AdapterDefinition;
  templateId?: string;
  adapterOptions?: AdapterOptions;
  features: FeatureDescriptor[];
}): Promise<Record<string, string>> {
  const {
    projectDirName,
    packageName,
    adapter,
    answers,
    templateId,
    adapterOptions,
    features,
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

  const featureSnippetReplacements =
    await buildFeatureSnippetReplacements(features);

  return {
    ...answerEntries,
    AGENT_NAME: projectDirName,
    APP_NAME: projectDirName,
    PACKAGE_NAME: packageName,
    ADAPTER_ID: adapter.id,
    ADAPTER_DISPLAY_NAME: adapter.displayName,
    ADAPTER_VARIANT: adapterOptions?.variant ?? adapter.defaultVariant ?? 'default',
    ADAPTER_IMPORTS: snippets.imports,
    ADAPTER_CONFIG_OVERRIDES: snippets.configOverrides,
    ADAPTER_APP_CREATION: snippets.appCreation,
    ADAPTER_ENTRYPOINT_REGISTRATION: snippets.entrypointRegistration,
    ADAPTER_EXPORTS: snippets.exports,
    ...featureSnippetReplacements,
    ...(adapter.buildReplacements
      ? adapter.buildReplacements({
          answers,
          templateId,
          options: adapterOptions,
        })
      : {}),
  };
}

// toEntrypointKey removed - no longer needed without entrypoint customization

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
  // Copy base template files, excluding adapters directory
  const entries = await fs.readdir(templateRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'adapters') continue; // Skip adapters directory

    const sourcePath = join(templateRoot, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await fs.cp(sourcePath, targetPath, {
        recursive: true,
        errorOnExist: false,
      });
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }

  // Copy shared adapter files (framework layer)
  const adapterLayers = getAdapterLayers(adapter, adapterOptions);
  for (const layer of adapterLayers) {
    await copyAdapterLayer(layer, targetDir);
  }

  // Copy template-specific overrides for this adapter
  const overrideDir = join(templateRoot, 'adapters', adapter.id);
  await copyAdapterLayer(overrideDir, targetDir);
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
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

const DEFAULT_PLACEHOLDER_TARGETS = ['src/agent.ts', 'src/lib/agent.ts'];

async function applyTemplateTransforms(
  targetDir: string,
  params: {
    packageName: string;
    replacements: Record<string, string>;
    adapter: AdapterDefinition;
    dependencies?: FeatureDependencies;
  }
) {
  await updatePackageJson(targetDir, {
    packageName: params.packageName,
    dependencies: params.dependencies,
  });

  // Replace tokens in README.md
  await replaceTemplatePlaceholders(
    join(targetDir, 'README.md'),
    params.replacements
  );

  // Replace adapter-specific code in agent files (base locations + adapter overrides)
  const placeholderTargets = new Set<string>();
  for (const target of DEFAULT_PLACEHOLDER_TARGETS) {
    placeholderTargets.add(join(targetDir, target));
  }
  for (const target of params.adapter.placeholderTargets ?? []) {
    placeholderTargets.add(join(targetDir, target));
  }

  for (const filePath of placeholderTargets) {
    await replaceTemplatePlaceholders(filePath, params.replacements);
  }

  await removeTemplateArtifacts(targetDir);
}

async function updatePackageJson(
  targetDir: string,
  params: { packageName: string; dependencies?: FeatureDependencies }
) {
  const { packageName, dependencies } = params;
  const packageJsonPath = join(targetDir, 'package.json');
  const packageJsonRaw = await fs.readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw) as Record<string, unknown>;
  packageJson.name = packageName;
  if (dependencies?.dependencies && Object.keys(dependencies.dependencies).length > 0) {
    packageJson.dependencies = {
      ...(packageJson.dependencies as Record<string, string> | undefined),
      ...dependencies.dependencies,
    };
  }
  if (
    dependencies?.devDependencies &&
    Object.keys(dependencies.devDependencies).length > 0
  ) {
    packageJson.devDependencies = {
      ...(packageJson.devDependencies as Record<string, string> | undefined),
      ...dependencies.devDependencies,
    };
  }
  await fs.writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8'
  );
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

function mergeFeatureDependencies(
  features: FeatureDescriptor[]
): FeatureDependencies | undefined {
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};

  for (const feature of features) {
    Object.assign(dependencies, feature.dependencies?.dependencies ?? {});
    Object.assign(
      devDependencies,
      feature.dependencies?.devDependencies ?? {}
    );
  }

  const hasDependencies = Object.keys(dependencies).length > 0;
  const hasDevDependencies = Object.keys(devDependencies).length > 0;

  if (!hasDependencies && !hasDevDependencies) {
    return undefined;
  }

  return {
    ...(hasDependencies ? { dependencies } : {}),
    ...(hasDevDependencies ? { devDependencies } : {}),
  };
}

async function applyFeatureAssets(params: {
  targetDir: string;
  features: FeatureDescriptor[];
}) {
  const { targetDir, features } = params;
  for (const feature of features) {
    const assetsDir = join(feature.dir, 'files');
    await copyAdapterLayer(assetsDir, targetDir);
  }

  await appendFeatureReadmeSections(targetDir, features);
}

async function appendFeatureReadmeSections(
  targetDir: string,
  features: FeatureDescriptor[]
) {
  const readmePath = join(targetDir, 'README.md');
  try {
    await fs.access(readmePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  let appended = '';
  for (const feature of features) {
    if (!feature.readmePath) continue;
    try {
      const snippet = await fs.readFile(feature.readmePath, 'utf8');
      if (snippet.trim().length > 0) {
        appended += `\n\n${snippet.trim()}\n`;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  if (appended.trim().length === 0) {
    return;
  }

  await fs.appendFile(readmePath, `${appended.trimEnd()}\n`, 'utf8');
}

async function buildFeatureSnippetReplacements(
  features: FeatureDescriptor[]
): Promise<Record<string, string>> {
  const keys: Array<keyof FeatureSnippetPaths> = [
    'imports',
    'preApp',
    'postApp',
    'entrypoints',
    'exports',
    'agentOptions',
  ];
  const parts: Record<keyof FeatureSnippetPaths, string[]> = {
    imports: [],
    preApp: [],
    postApp: [],
    entrypoints: [],
    exports: [],
    agentOptions: [],
  };

  for (const feature of features) {
    const snippetPaths = feature.snippets;
    if (!snippetPaths) continue;
    for (const key of keys) {
      const relative = snippetPaths[key];
      if (!relative) continue;
      const absolute = join(feature.dir, relative);
      try {
        const raw = await fs.readFile(absolute, 'utf8');
        const trimmed = raw.trim();
        if (trimmed.length > 0) {
          parts[key].push(trimmed);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }

  const block = (values: string[]) =>
    values.length > 0 ? values.join('\n\n') + '\n' : '';

  const dedupeImportBlock = (values: string[]) => {
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const block of values) {
      for (const rawLine of block.split('\n')) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        lines.push(trimmed);
      }
    }
    return lines.length > 0 ? lines.join('\n') + '\n' : '';
  };

  return {
    FEATURE_IMPORTS: dedupeImportBlock(parts.imports),
    FEATURE_PRE_APP: block(parts.preApp),
    FEATURE_POST_APP: block(parts.postApp),
    FEATURE_ENTRYPOINTS: block(parts.entrypoints),
    FEATURE_EXPORTS: block(parts.exports),
    FEATURE_AGENT_OPTIONS: block(parts.agentOptions),
  };
}

async function setupEnvironment(params: {
  targetDir: string;
  wizardAnswers: WizardAnswers;
  agentName: string;
  template: TemplateDescriptor;
  extraEnv?: string[];
}) {
  const { targetDir, wizardAnswers, agentName, template, extraEnv } = params;
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

  if (extraEnv && extraEnv.length > 0) {
    const sanitizedExtras = extraEnv
      .map(line => line.trim())
      .filter(line => line.length > 0);
    if (sanitizedExtras.length > 0) {
      lines.push('', ...sanitizedExtras);
    }
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
      '⚠️  Failed to run `bun install`. Please install dependencies manually.'
    );
  }
}

async function createInteractivePrompt(
  logger: RunLogger
): Promise<PromptApi | undefined> {
  if (!defaultInput.isTTY || !defaultOutput.isTTY) {
    return undefined;
  }

  const loadPrompt = async <T extends keyof typeof import('@inquirer/prompts')>(
    key: T
  ) => {
    const prompts = await import('@inquirer/prompts');
    return prompts[key];
  };

  return {
    async select({ message, choices }) {
      const selectPrompt = await loadPrompt('select');
      const value = await selectPrompt({
        message,
        choices: choices.map(choice => ({
          name: choice.title,
          value: choice.value,
          description: choice.description,
        })),
      });
      logger.log(`${message} ${value}`);
      return value as string;
    },
    async confirm({ message, defaultValue = true }) {
      const confirmPrompt = await loadPrompt('confirm');
      return (await confirmPrompt({
        message,
        default: defaultValue,
      })) as boolean;
    },
    async input({ message, defaultValue = '' }) {
      const inputPrompt = await loadPrompt('input');
      const result = await inputPrompt({
        message,
        default: defaultValue,
      });
      return String(result ?? defaultValue);
    },
    async multiSelect({ message, choices }) {
      const checkboxPrompt = await loadPrompt('checkbox');
      const selected = await checkboxPrompt({
        message,
        choices: choices.map(choice => ({
          name: choice.title,
          value: choice.value,
          description: choice.description,
        })),
      });
      return (selected ?? []) as string[];
    },
    async close() {
      // no-op for inquirer-based prompts
    },
  };
}

async function main() {
  const prompt = await createInteractivePrompt(defaultLogger);
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
