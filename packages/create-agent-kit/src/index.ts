import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import process, {
  stdin as defaultInput,
  stdout as defaultOutput,
} from "node:process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

type CliOptions = {
  install: boolean;
  templateId?: string;
  envMode: "prompt" | "yes" | "no";
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

type OnboardingCondition = {
  key: string;
  equals?: string | boolean;
  in?: Array<string | boolean>;
};

type OnboardingPrompt = {
  key: string;
  type: "input" | "confirm" | "select";
  message: string;
  defaultValue?: string | boolean;
  choices?: PromptChoice[];
  when?: OnboardingCondition;
};

type OnboardingConfig = {
  prompts?: OnboardingPrompt[];
};

type TemplateMeta = {
  id?: string;
  name?: string;
  description?: string;
  onboarding?: OnboardingConfig;
};

type TemplateDescriptor = {
  id: string;
  title: string;
  description?: string;
  path: string;
  onboarding?: OnboardingConfig;
};

type OnboardingAnswers = Map<string, string | boolean>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_ROOT = resolve(__dirname, "../templates");

const LUCID_BANNER = [
  "____   ____     ___   ____   ___________   ",

  "",
  "",
  "MM'   `MM'     `M'  6MMMMb/ `MM`MMMMMMMb. ",
  "MM     MM       M  8P    YM  MM MM    `Mb ",
  "MM     MM       M 6M      Y  MM MM     MM ",
  "MM     MM       M MM         MM MM     MM ",
  "MM     MM       M MM         MM MM     MM ",
  "MM     MM       M MM         MM MM     MM ",
  "MM     YM       M YM      6  MM MM     MM ",
  "MM    / 8b     d8  8b    d9  MM MM    .M9 ",
  "_MMMMMMM  YMMMMM9    YMMMM9  _MM_MMMMMMM9'",

  "",
  "       L U C I D  DREAMS   ",
  "   Agent scaffolding toolkit  ",
];

const DEFAULT_TEMPLATE_VALUES = {
  AGENT_VERSION: "0.1.0",
  AGENT_DESCRIPTION: "Starter agent generated with create-agent-kit",
  AGENT_DOMAIN: "agent.example.com",
  ENTRYPOINT_KEY: "echo",
  ENTRYPOINT_DESCRIPTION: "Returns text that you send to the agent.",
  PAYMENTS_FACILITATOR_URL: "https://facilitator.daydreams.systems",
  PAYMENTS_PAY_TO: "0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429",
  PAYMENTS_NETWORK: "base-sepolia",
  PAYMENTS_DEFAULT_PRICE: "1000",
};

const DEFAULT_PROJECT_NAME = "agent-app";
const PROJECT_NAME_PROMPT = "Project directory name:";

const defaultLogger: RunLogger = {
  log: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
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

  const template = await resolveTemplate({
    templates,
    requestedId: parsed.options.templateId,
    prompt,
    logger,
  });

  logger.log(`Using template: ${template.title}`);

  const projectName = await resolveProjectName({
    parsed,
    prompt,
    logger,
    template,
  });

  const targetDir = projectName === "." ? cwd : resolve(cwd, projectName);
  const projectDirName = basename(targetDir);
  const packageName = toPackageName(projectDirName);

  await assertTemplatePresent(template.path);
  await assertTargetDirectory(targetDir);
  const onboardingAnswers = await collectOnboardingValues({
    template,
    prompt,
    context: {
      APP_NAME: projectDirName,
      PACKAGE_NAME: packageName,
    },
  });
  const replacements = buildTemplateReplacements({
    projectDirName,
    packageName,
    answers: onboardingAnswers,
  });
  await copyTemplate(template.path, targetDir);
  await applyTemplateTransforms(targetDir, {
    packageName,
    projectDirName,
    replacements,
  });

  await setupEnvironment({
    targetDir,
    envMode: parsed.options.envMode,
    prompt,
    logger,
    onboardingAnswers: replacements,
  });

  if (parsed.options.install) {
    await runInstall(targetDir, logger);
  }

  const relativeTarget = relative(cwd, targetDir) || ".";
  const nextSteps = [
    relativeTarget !== "." ? `cd ${relativeTarget}` : null,
    !parsed.options.install ? "bun install" : null,
    "bun run dev",
  ].filter(Boolean);

  logger.log("");
  logger.log(`✨  Created agent app in ${relativeTarget}`);
  logger.log("Next steps:");
  nextSteps.forEach((step, index) => {
    logger.log(`  ${index + 1}. ${step}`);
  });
  logger.log("");
  logger.log("Happy hacking!");
}

export type { PromptApi, RunLogger };

function parseArgs(args: string[]): ParsedArgs {
  const options: CliOptions = { install: false, envMode: "prompt" };
  const positional: string[] = [];
  let showHelp = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--install" || arg === "-i") {
      options.install = true;
    } else if (arg === "--no-install") {
      options.install = false;
    } else if (arg === "--help" || arg === "-h") {
      showHelp = true;
    } else if (arg === "--env") {
      options.envMode = "yes";
    } else if (arg === "--no-env") {
      options.envMode = "no";
    } else if (arg?.startsWith("--env=")) {
      const value = arg.slice("--env=".length);
      options.envMode = parseEnvMode(value);
    } else if (arg === "--template" || arg === "-t") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Expected value after --template");
      }
      options.templateId = value;
      i += 1;
    } else if (arg?.startsWith("--template=")) {
      options.templateId = arg.slice("--template=".length);
    } else {
      positional.push(arg ?? "");
    }
  }

  return { options, target: positional[0] ?? null, showHelp };
}

function parseEnvMode(value: string): CliOptions["envMode"] {
  if (value === "yes" || value === "true" || value === "auto") return "yes";
  if (value === "no" || value === "false" || value === "skip") return "no";
  if (value === "prompt" || value === "ask") return "prompt";
  throw new Error(
    `Invalid value for --env: ${value}. Expected one of: prompt, yes, no.`
  );
}

function printHelp(logger: RunLogger) {
  logger.log("Usage: npx create-agent-kit <app-name> [options]");
  logger.log("");
  logger.log("Options:");
  logger.log("  --install, -i        Run `bun install` after scaffolding");
  logger.log("  --no-install         Skip dependency installation (default)");
  logger.log("  --template, -t NAME  Use a specific template directory");
  logger.log("  --env[=MODE]         Configure env setup (prompt|yes|no)");
  logger.log("  --no-env             Skip env setup");
}

function printBanner(logger: RunLogger) {
  LUCID_BANNER.forEach((line) => logger.log(line));
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
    const metaPath = join(path, "template.json");
    let title = toTitleCase(id);
    let description: string | undefined;
    let onboarding: OnboardingConfig | undefined;

    try {
      const raw = await fs.readFile(metaPath, "utf8");
      const meta = JSON.parse(raw) as TemplateMeta;
      title = meta.name ?? toTitleCase(id);
      description = meta.description;
      onboarding = normalizeOnboardingConfig(meta.onboarding);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    descriptors.push({
      id,
      title,
      description,
      path,
      onboarding,
    });
  }

  return descriptors.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeOnboardingConfig(
  config?: OnboardingConfig
): OnboardingConfig | undefined {
  if (!config) return undefined;
  const prompts =
    config.prompts
      ?.map((prompt) => {
        if (!prompt || !prompt.key || !prompt.type) {
          return undefined;
        }
        if (
          prompt.type !== "input" &&
          prompt.type !== "confirm" &&
          prompt.type !== "select"
        ) {
          return undefined;
        }
        return { ...prompt };
      })
      .filter((prompt): prompt is OnboardingPrompt => Boolean(prompt)) ?? [];

  if (prompts.length === 0) {
    return undefined;
  }

  return { prompts };
}

async function resolveTemplate(params: {
  templates: TemplateDescriptor[];
  requestedId?: string;
  prompt?: PromptApi;
  logger: RunLogger;
}): Promise<TemplateDescriptor> {
  const { templates, requestedId, prompt, logger } = params;

  if (requestedId) {
    const match = templates.find((t) => t.id === requestedId);
    if (!match) {
      const available = templates.map((t) => t.id).join(", ");
      throw new Error(
        `Unknown template "${requestedId}". Available templates: ${available}`
      );
    }
    return match;
  }

  if (templates.length === 1) {
    return templates[0]!;
  }

  if (!prompt) {
    const available = templates.map((t) => t.id).join(", ");
    throw new Error(
      `Multiple templates available (${available}). Re-run with --template <name>.`
    );
  }

  const choices: PromptChoice[] = templates.map((template) => ({
    value: template.id,
    title: template.title,
    description: template.description,
  }));

  const selection = await prompt.select({
    message: "Select a template:",
    choices,
  });

  const match = templates.find((t) => t.id === selection);
  if (!match) {
    logger.warn(
      `Template "${selection}" not found; falling back to first option.`
    );
    return templates[0]!;
  }
  return match;
}

function toTitleCase(value: string) {
  return value
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toPackageName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return normalized.length > 0 ? normalized : "agent-app";
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
    typeof templateId === "string" && templateId.length > 0
      ? templateId
      : DEFAULT_PROJECT_NAME;

  let candidate = toPackageName(candidateSource);
  if (!candidate || candidate.length === 0) {
    candidate = DEFAULT_PROJECT_NAME;
  }

  if (candidate !== DEFAULT_PROJECT_NAME && !candidate.endsWith("-agent")) {
    candidate = `${candidate}-agent`;
  }

  return candidate;
}

async function collectOnboardingValues(params: {
  template: TemplateDescriptor;
  prompt?: PromptApi;
  context: Record<string, string>;
}): Promise<OnboardingAnswers> {
  const { template, prompt, context } = params;
  const answers: OnboardingAnswers = new Map();
  const prompts = template.onboarding?.prompts ?? [];

  for (const question of prompts) {
    if (!shouldAskOnboardingPrompt(question, answers)) {
      continue;
    }

    const defaultValue = resolveOnboardingDefault({
      question,
      context,
      answers,
    });

    const response = await askOnboardingPrompt({
      promptApi: prompt,
      question,
      defaultValue,
    });

    if (question.type === "confirm") {
      answers.set(question.key, Boolean(response));
    } else {
      answers.set(question.key, sanitizeAnswerString(String(response)));
    }
  }

  return answers;
}

function shouldAskOnboardingPrompt(
  question: OnboardingPrompt,
  answers: OnboardingAnswers
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

function resolveOnboardingDefault(params: {
  question: OnboardingPrompt;
  context: Record<string, string>;
  answers: OnboardingAnswers;
}): string | boolean | undefined {
  const { question, context, answers } = params;
  const baseContext = {
    ...DEFAULT_TEMPLATE_VALUES,
    ...context,
  };

  if (question.type === "confirm") {
    if (typeof question.defaultValue === "boolean") {
      return question.defaultValue;
    }
    if (typeof question.defaultValue === "string") {
      const normalized = question.defaultValue.trim().toLowerCase();
      if (["true", "yes", "y", "1"].includes(normalized)) return true;
      if (["false", "no", "n", "0"].includes(normalized)) return false;
    }
    return undefined;
  }

  if (typeof question.defaultValue === "string") {
    return interpolateTemplateString(
      question.defaultValue,
      baseContext,
      answers
    );
  }
  if (typeof question.defaultValue === "boolean") {
    return question.defaultValue ? "true" : "false";
  }

  return undefined;
}

async function askOnboardingPrompt(params: {
  promptApi?: PromptApi;
  question: OnboardingPrompt;
  defaultValue: string | boolean | undefined;
}): Promise<string | boolean> {
  const { promptApi, question, defaultValue } = params;

  if (!promptApi) {
    return getNonInteractiveAnswer(question, defaultValue);
  }

  if (question.type === "input") {
    const defaultString =
      typeof defaultValue === "string" ? defaultValue : undefined;
    const answer = await promptApi.input({
      message: question.message,
      defaultValue: defaultString,
    });
    return sanitizeAnswerString(answer);
  }

  if (question.type === "confirm") {
    const defaultBool =
      typeof defaultValue === "boolean"
        ? defaultValue
        : typeof defaultValue === "string"
        ? ["true", "yes", "y", "1"].includes(defaultValue.trim().toLowerCase())
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
  question: OnboardingPrompt,
  defaultValue: string | boolean | undefined
): string | boolean {
  if (question.type === "confirm") {
    if (typeof defaultValue === "boolean") {
      return defaultValue;
    }
    if (typeof defaultValue === "string") {
      const normalized = defaultValue.trim().toLowerCase();
      if (["true", "yes", "y", "1"].includes(normalized)) return true;
      if (["false", "no", "n", "0"].includes(normalized)) return false;
    }
    return false;
  }

  if (question.type === "select") {
    if (typeof defaultValue === "string" && defaultValue.length > 0) {
      return sanitizeAnswerString(defaultValue);
    }
    const choice = question.choices?.[0];
    if (!choice) {
      throw new Error(`Prompt "${question.key}" is missing choices.`);
    }
    return sanitizeAnswerString(choice.value);
  }

  if (typeof defaultValue === "string") {
    return sanitizeAnswerString(defaultValue);
  }

  return "";
}

function interpolateTemplateString(
  template: string,
  context: Record<string, string>,
  answers: OnboardingAnswers
): string {
  return template.replace(/{{([A-Z0-9_]+)}}/g, (_, token: string) => {
    const fromAnswers = answers.get(token);
    if (typeof fromAnswers === "string") {
      return fromAnswers;
    }
    if (typeof fromAnswers === "boolean") {
      return fromAnswers ? "true" : "false";
    }

    if (Object.prototype.hasOwnProperty.call(context, token)) {
      return context[token] ?? "";
    }

    const defaultValue =
      DEFAULT_TEMPLATE_VALUES[token as keyof typeof DEFAULT_TEMPLATE_VALUES];
    if (typeof defaultValue === "string") {
      return defaultValue;
    }
    return "";
  });
}

function sanitizeAnswerString(value: string): string {
  return value.replace(/\r/g, "").trim();
}

function buildTemplateReplacements(params: {
  projectDirName: string;
  packageName: string;
  answers: OnboardingAnswers;
}): Record<string, string> {
  const { projectDirName, packageName, answers } = params;

  const agentDescription = getStringAnswer(
    answers,
    "AGENT_DESCRIPTION",
    DEFAULT_TEMPLATE_VALUES.AGENT_DESCRIPTION
  );
  const agentVersion = getStringAnswer(
    answers,
    "AGENT_VERSION",
    DEFAULT_TEMPLATE_VALUES.AGENT_VERSION
  );
  const agentDomain = getStringAnswer(
    answers,
    "AGENT_DOMAIN",
    DEFAULT_TEMPLATE_VALUES.AGENT_DOMAIN
  );
  const entrypointKey = toEntrypointKey(
    getStringAnswer(
      answers,
      "ENTRYPOINT_KEY",
      DEFAULT_TEMPLATE_VALUES.ENTRYPOINT_KEY
    )
  );
  const entrypointDescription = getStringAnswer(
    answers,
    "ENTRYPOINT_DESCRIPTION",
    DEFAULT_TEMPLATE_VALUES.ENTRYPOINT_DESCRIPTION
  );

  const enablePayments = getBooleanAnswer(answers, "ENABLE_PAYMENTS", false);
  const paymentsFacilitator = getStringAnswer(
    answers,
    "PAYMENTS_FACILITATOR_URL",
    DEFAULT_TEMPLATE_VALUES.PAYMENTS_FACILITATOR_URL
  );
  const paymentsNetwork = getStringAnswer(
    answers,
    "PAYMENTS_NETWORK",
    DEFAULT_TEMPLATE_VALUES.PAYMENTS_NETWORK
  );
  const paymentsPayTo = getStringAnswer(
    answers,
    "PAYMENTS_PAY_TO",
    DEFAULT_TEMPLATE_VALUES.PAYMENTS_PAY_TO
  );
  const paymentsDefaultPrice = getStringAnswer(
    answers,
    "PAYMENTS_DEFAULT_PRICE",
    DEFAULT_TEMPLATE_VALUES.PAYMENTS_DEFAULT_PRICE
  );
  const entrypointPrice = getStringAnswer(
    answers,
    "ENTRYPOINT_PRICE",
    paymentsDefaultPrice
  );

  const agentOptions = enablePayments
    ? [
        "{",
        "  config: {",
        "    payments: {",
        `      facilitatorUrl: "${paymentsFacilitator}",`,
        `      payTo: "${paymentsPayTo}",`,
        `      network: "${paymentsNetwork}",`,
        `      defaultPrice: "${paymentsDefaultPrice}",`,
        "    },",
        "  },",
        "  useConfigPayments: true,",
        "}",
      ].join("\n")
    : "{}";

  const entrypointPriceLine = enablePayments
    ? `  price: "${entrypointPrice}",\n`
    : `  // price: "${entrypointPrice}",\n`;

  const entrypointPriceNote = enablePayments
    ? ` (price: ${entrypointPrice} base units)`
    : "";

  const autoRegister = getBooleanAnswer(answers, "AUTO_REGISTER", true);

  return {
    APP_NAME: projectDirName,
    PACKAGE_NAME: packageName,
    AGENT_DESCRIPTION: agentDescription,
    AGENT_VERSION: agentVersion,
    AGENT_DOMAIN: agentDomain,
    ENTRYPOINT_KEY: entrypointKey,
    ENTRYPOINT_DESCRIPTION: entrypointDescription,
    ENTRYPOINT_PRICE: entrypointPrice,
    ENTRYPOINT_PRICE_LINE: entrypointPriceLine,
    ENTRYPOINT_PRICE_NOTE: entrypointPriceNote,
    AGENT_OPTIONS: agentOptions,
    PAYMENTS_FACILITATOR_URL: paymentsFacilitator,
    PAYMENTS_NETWORK: paymentsNetwork,
    PAYMENTS_PAY_TO: paymentsPayTo,
    PAYMENTS_DEFAULT_PRICE: paymentsDefaultPrice,
    AUTO_REGISTER: String(autoRegister),
  };
}

function getStringAnswer(
  answers: OnboardingAnswers,
  key: string,
  fallback: string
): string {
  const value = answers.get(key);
  if (typeof value === "string" && value.trim().length > 0) {
    return sanitizeAnswerString(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return fallback;
}

function getBooleanAnswer(
  answers: OnboardingAnswers,
  key: string,
  fallback: boolean
): boolean {
  const value = answers.get(key);
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(normalized)) return true;
    if (["false", "no", "n", "0"].includes(normalized)) return false;
  }
  return fallback;
}

function toEntrypointKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  return normalized.length > 0
    ? normalized
    : DEFAULT_TEMPLATE_VALUES.ENTRYPOINT_KEY;
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
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }

  const entries = await fs.readdir(targetDir);
  const filtered = entries.filter((name) => name !== ".DS_Store");
  if (filtered.length > 0) {
    throw new Error(
      `Target directory ${targetDir} already exists and is not empty.`
    );
  }
}

async function copyTemplate(templateRoot: string, targetDir: string) {
  await fs.cp(templateRoot, targetDir, {
    recursive: true,
    errorOnExist: false,
  });
}

async function applyTemplateTransforms(
  targetDir: string,
  params: {
    packageName: string;
    projectDirName: string;
    replacements: Record<string, string>;
  }
) {
  await updatePackageJson(targetDir, params.packageName);

  const replacements = {
    APP_NAME: params.projectDirName,
    PACKAGE_NAME: params.packageName,
    ...params.replacements,
  };

  await replaceTemplatePlaceholders(join(targetDir, "README.md"), replacements);
  await replaceTemplatePlaceholders(
    join(targetDir, "src/agent.ts"),
    replacements
  );

  await removeTemplateArtifacts(targetDir);
}

async function updatePackageJson(targetDir: string, packageName: string) {
  const packageJsonPath = join(targetDir, "package.json");
  const packageJsonRaw = await fs.readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonRaw) as Record<string, unknown>;
  packageJson.name = packageName;
  await fs.writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8"
  );
}

async function replaceTemplatePlaceholders(
  filePath: string,
  replacements: Record<string, string>
) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    let replaced = raw;
    for (const [key, value] of Object.entries(replacements)) {
      replaced = replaced.replaceAll(`{{${key}}}`, value);
    }
    if (replaced === raw) {
      return;
    }
    await fs.writeFile(filePath, replaced, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function removeTemplateArtifacts(targetDir: string) {
  const metaPath = join(targetDir, "template.json");
  await fs.rm(metaPath, { force: true });
}

async function setupEnvironment(params: {
  targetDir: string;
  envMode: CliOptions["envMode"];
  prompt?: PromptApi;
  logger: RunLogger;
  onboardingAnswers?: Record<string, string>;
}) {
  const { targetDir, envMode, prompt, logger, onboardingAnswers = {} } = params;
  const examplePath = join(targetDir, ".env.example");
  const envPath = join(targetDir, ".env");

  const exampleExists = existsSync(examplePath);
  if (!exampleExists) {
    return;
  }

  if (envMode === "no") {
    logger.log("Skipping env setup (requested).");
    return;
  }

  if (envMode === "yes") {
    await fs.copyFile(examplePath, envPath);
    logger.log("Generated .env from .env.example.");
    return;
  }

  if (!prompt) {
    logger.log("Skipping env setup (non-interactive).");
    return;
  }

  const shouldCreate = await prompt.confirm({
    message: "Create a .env file now?",
    defaultValue: true,
  });

  if (!shouldCreate) {
    logger.log("Skipping env setup.");
    return;
  }

  const templateContent = await fs.readFile(examplePath, "utf8");
  const entries = parseEnvTemplate(templateContent);
  const answers = new Map<string, string>();

  // Map onboarding answer keys to env variable names
  const envKeyMapping: Record<string, string> = {
    FACILITATOR_URL: "PAYMENTS_FACILITATOR_URL",
    ADDRESS: "PAYMENTS_PAY_TO",
    NETWORK: "PAYMENTS_NETWORK",
    DEFAULT_PRICE: "PAYMENTS_DEFAULT_PRICE",
  };

  for (const entry of entries) {
    if (entry.type !== "entry") continue;
    // Check if we already have this value from onboarding
    const onboardingKey = envKeyMapping[entry.key] ?? entry.key;
    const defaultFromOnboarding = onboardingAnswers[onboardingKey];

    if (defaultFromOnboarding) {
      // Already collected during onboarding - use it directly without prompting
      answers.set(entry.key, defaultFromOnboarding);
    } else {
      // Not in onboarding - prompt user for this value
      const response = await prompt.input({
        message: `${entry.key}`,
        defaultValue: entry.value ?? "",
      });
      answers.set(entry.key, response);
    }
  }

  const rendered = renderEnvTemplate(entries, answers);
  await fs.writeFile(envPath, rendered, "utf8");
  logger.log("Created .env with your values.");
}

type EnvTemplateEntry =
  | { type: "entry"; key: string; value?: string }
  | { type: "comment"; raw: string }
  | { type: "other"; raw: string };

function parseEnvTemplate(content: string): EnvTemplateEntry[] {
  const lines = content.split(/\r?\n/);
  return lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "") {
      return { type: "comment", raw: line } as EnvTemplateEntry;
    }
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      return { type: "other", raw: line };
    }

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1);
    return { type: "entry", key, value };
  });
}

function renderEnvTemplate(
  entries: EnvTemplateEntry[],
  answers: Map<string, string>
) {
  return (
    entries
      .map((entry) => {
        if (entry.type === "entry") {
          const answer = answers.get(entry.key) ?? entry.value ?? "";
          return `${entry.key}=${answer}`;
        }
        return entry.raw;
      })
      .join("\n") + "\n"
  );
}

async function runInstall(cwd: string, logger: RunLogger) {
  logger.log("Running `bun install`...");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("bun", ["install"], {
        cwd,
        stdio: "inherit",
      });

      child.on("error", (error) => reject(error));
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`bun install exited with code ${code ?? "unknown"}`)
          );
        }
      });
    });
  } catch (error) {
    logger.warn(
      "⚠️  Failed to run `bun install`. Please install dependencies manually."
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
        const detail = choice.description ? ` – ${choice.description}` : "";
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
        logger.log("Please enter a valid option number.");
      }
    },
    async confirm({ message, defaultValue = true }) {
      const suffix = defaultValue ? "Y/n" : "y/N";
      while (true) {
        const answer = await rl.question(`${message} (${suffix}) `);
        const normalized = answer.trim().toLowerCase();
        if (normalized === "" && defaultValue !== undefined) {
          return defaultValue;
        }
        if (["y", "yes"].includes(normalized)) return true;
        if (["n", "no"].includes(normalized)) return false;
        logger.log("Please respond with y or n.");
      }
    },
    async input({ message, defaultValue = "" }) {
      const promptMessage =
        defaultValue && defaultValue.length > 0
          ? `${message} (${defaultValue}): `
          : `${message}: `;
      const answer = await rl.question(promptMessage);
      return answer === "" ? defaultValue : answer;
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
