#!/usr/bin/env node
import { spawn } from 'child_process';
import { realpathSync, existsSync } from 'fs';
import fs from 'fs/promises';
import { dirname, resolve, basename, relative, join } from 'path';
import process, { stdin, stdout } from 'process';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline/promises';

var ADAPTER_DISPLAY_NAMES = {
  hono: "Hono",
  tanstack: "TanStack Start"
};
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var TEMPLATE_ROOT = resolve(__dirname, "../templates");
var LUCID_BANNER = [
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
  "   Agent scaffolding toolkit  "
];
var DEFAULT_TEMPLATE_VALUES = {
  AGENT_VERSION: "0.1.0",
  AGENT_DESCRIPTION: "Starter agent generated with create-agent-kit",
  ENTRYPOINT_KEY: "echo",
  ENTRYPOINT_DESCRIPTION: "Returns text that you send to the agent.",
  PAYMENTS_FACILITATOR_URL: "https://facilitator.daydreams.systems",
  PAYMENTS_PAY_TO: "0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429",
  PAYMENTS_NETWORK: "base-sepolia",
  PAYMENTS_DEFAULT_PRICE: "1000",
  WALLET_CONNECT_PROJECT_ID: "demo-project-id"
};
var DEFAULT_PROJECT_NAME = "agent-app";
var PROJECT_NAME_PROMPT = "Project directory name:";
var defaultLogger = {
  log: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message)
};
async function runCli(argv, options = {}) {
  const logger = options.logger ?? defaultLogger;
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const templateRoot = options.templateRoot ? resolve(options.templateRoot) : TEMPLATE_ROOT;
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
    logger
  });
  logger.log(
    `Using runtime adapter: ${formatAdapterName(template.adapter)}`
  );
  logger.log(`Using template: ${template.title}`);
  const projectName = await resolveProjectName({
    parsed,
    prompt,
    logger,
    template
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
      PACKAGE_NAME: packageName
    }
  });
  const replacements = buildTemplateReplacements({
    projectDirName,
    packageName,
    answers: onboardingAnswers
  });
  await copyTemplate(template.path, targetDir);
  await applyTemplateTransforms(targetDir, {
    packageName,
    projectDirName,
    replacements
  });
  await setupEnvironment({
    targetDir,
    envMode: parsed.options.envMode,
    prompt,
    logger
  });
  if (parsed.options.install) {
    await runInstall(targetDir, logger);
  }
  const relativeTarget = relative(cwd, targetDir) || ".";
  const nextSteps = [
    relativeTarget !== "." ? `cd ${relativeTarget}` : null,
    !parsed.options.install ? "bun install" : null,
    "bun run dev"
  ].filter(Boolean);
  logger.log("");
  logger.log(`\u2728  Created agent app in ${relativeTarget}`);
  logger.log("Next steps:");
  nextSteps.forEach((step, index) => {
    logger.log(`  ${index + 1}. ${step}`);
  });
  logger.log("");
  logger.log("Happy hacking!");
}
function parseArgs(args) {
  const options = { install: false, envMode: "prompt" };
  const positional = [];
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
function parseEnvMode(value) {
  if (value === "yes" || value === "true" || value === "auto") return "yes";
  if (value === "no" || value === "false" || value === "skip") return "no";
  if (value === "prompt" || value === "ask") return "prompt";
  throw new Error(
    `Invalid value for --env: ${value}. Expected one of: prompt, yes, no.`
  );
}
function printHelp(logger) {
  logger.log("Usage: npx create-agent-kit <app-name> [options]");
  logger.log("");
  logger.log("Options:");
  logger.log("  --install, -i        Run `bun install` after scaffolding");
  logger.log("  --no-install         Skip dependency installation (default)");
  logger.log("  --template, -t NAME  Use a specific template directory");
  logger.log("  --env[=MODE]         Configure env setup (prompt|yes|no)");
  logger.log("  --no-env             Skip env setup");
}
function printBanner(logger) {
  LUCID_BANNER.forEach((line) => logger.log(line));
}
async function loadTemplates(templateRoot) {
  const entries = await fs.readdir(templateRoot, { withFileTypes: true });
  const descriptors = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const path = join(templateRoot, id);
    const metaPath = join(path, "template.json");
    let title = toTitleCase(id);
    let description;
    let onboarding;
    let adapter = "default";
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      const meta = JSON.parse(raw);
      title = meta.name ?? toTitleCase(id);
      description = meta.description;
      onboarding = normalizeOnboardingConfig(meta.onboarding);
      if (meta.adapter) {
        adapter = meta.adapter.toLowerCase();
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    descriptors.push({
      id,
      adapter,
      title,
      description,
      path,
      onboarding
    });
  }
  return descriptors.sort((a, b) => a.id.localeCompare(b.id));
}
function formatAdapterName(adapter) {
  return ADAPTER_DISPLAY_NAMES[adapter] ?? toTitleCase(adapter);
}
function normalizeOnboardingConfig(config) {
  if (!config) return void 0;
  const prompts = config.prompts?.map((prompt) => {
    if (!prompt || !prompt.key || !prompt.type) {
      return void 0;
    }
    if (prompt.type !== "input" && prompt.type !== "confirm" && prompt.type !== "select") {
      return void 0;
    }
    return { ...prompt };
  }).filter((prompt) => Boolean(prompt)) ?? [];
  if (prompts.length === 0) {
    return void 0;
  }
  return { prompts };
}
async function resolveTemplate(params) {
  const { templates, requestedId, prompt, logger } = params;
  if (requestedId) {
    const match2 = templates.find((t) => t.id === requestedId);
    if (!match2) {
      const available = templates.map((t) => t.id).join(", ");
      throw new Error(
        `Unknown template "${requestedId}". Available templates: ${available}`
      );
    }
    return match2;
  }
  const adapters = Array.from(new Set(templates.map((t) => t.adapter)));
  let selectedAdapter = adapters[0];
  if (adapters.length > 1) {
    if (!prompt) {
      const available = adapters.map((adapter) => formatAdapterName(adapter)).join(", ");
      throw new Error(
        `Multiple runtime adapters available (${available}). Re-run with --template <name>.`
      );
    }
    const adapterChoices = adapters.map((adapter) => ({
      value: adapter,
      title: formatAdapterName(adapter)
    }));
    selectedAdapter = await prompt.select({
      message: "Select a runtime adapter:",
      choices: adapterChoices
    });
  }
  const candidates = templates.filter((t) => t.adapter === selectedAdapter);
  if (candidates.length === 0) {
    logger.warn(
      `No templates found for adapter "${selectedAdapter}". Falling back to default template list.`
    );
    return templates[0];
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (!prompt) {
    const available = candidates.map((t) => t.id).join(", ");
    throw new Error(
      `Multiple templates available for adapter "${selectedAdapter}" (${available}). Re-run with --template <name>.`
    );
  }
  const choices = candidates.map((template) => ({
    value: template.id,
    title: template.title,
    description: template.description
  }));
  const selection = await prompt.select({
    message: "Select a template variant:",
    choices
  });
  const match = candidates.find((t) => t.id === selection);
  if (!match) {
    logger.warn(
      `Template "${selection}" not found; falling back to first option.`
    );
    return candidates[0];
  }
  return match;
}
function toTitleCase(value) {
  return value.split(/[-_]/g).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function toPackageName(input) {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  return normalized.length > 0 ? normalized : "agent-app";
}
async function resolveProjectName(params) {
  const { parsed, prompt, logger, template } = params;
  if (parsed.target && parsed.target.trim().length > 0) {
    return parsed.target;
  }
  const defaultName = buildDefaultProjectName({ parsed, template });
  if (prompt) {
    const response = await prompt.input({
      message: PROJECT_NAME_PROMPT,
      defaultValue: defaultName
    });
    const sanitized = sanitizeAnswerString(response);
    return sanitized.length > 0 ? sanitized : defaultName;
  }
  logger.log(`No <app-name> supplied; defaulting to "${defaultName}".`);
  return defaultName;
}
function buildDefaultProjectName(params) {
  const templateId = params.parsed.options.templateId ?? params.template?.id;
  const candidateSource = typeof templateId === "string" && templateId.length > 0 ? templateId : DEFAULT_PROJECT_NAME;
  let candidate = toPackageName(candidateSource);
  if (!candidate || candidate.length === 0) {
    candidate = DEFAULT_PROJECT_NAME;
  }
  if (candidate !== DEFAULT_PROJECT_NAME && !candidate.endsWith("-agent")) {
    candidate = `${candidate}-agent`;
  }
  return candidate;
}
async function collectOnboardingValues(params) {
  const { template, prompt, context } = params;
  const answers = /* @__PURE__ */ new Map();
  const prompts = template.onboarding?.prompts ?? [];
  for (const question of prompts) {
    if (!shouldAskOnboardingPrompt(question, answers)) {
      continue;
    }
    const defaultValue = resolveOnboardingDefault({
      question,
      context,
      answers
    });
    const response = await askOnboardingPrompt({
      promptApi: prompt,
      question,
      defaultValue
    });
    if (question.type === "confirm") {
      answers.set(question.key, Boolean(response));
    } else {
      answers.set(question.key, sanitizeAnswerString(String(response)));
    }
  }
  return answers;
}
function shouldAskOnboardingPrompt(question, answers) {
  if (!question.when) return true;
  const gateValue = answers.get(question.when.key);
  if (question.when.equals !== void 0) {
    return gateValue === question.when.equals;
  }
  if (question.when.in?.length) {
    return question.when.in.includes(gateValue);
  }
  return true;
}
function resolveOnboardingDefault(params) {
  const { question, context, answers } = params;
  const baseContext = {
    ...DEFAULT_TEMPLATE_VALUES,
    ...context
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
    return void 0;
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
  return void 0;
}
async function askOnboardingPrompt(params) {
  const { promptApi, question, defaultValue } = params;
  if (!promptApi) {
    return getNonInteractiveAnswer(question, defaultValue);
  }
  if (question.type === "input") {
    const defaultString = typeof defaultValue === "string" ? defaultValue : void 0;
    const answer = await promptApi.input({
      message: question.message,
      defaultValue: defaultString
    });
    return sanitizeAnswerString(answer);
  }
  if (question.type === "confirm") {
    const defaultBool = typeof defaultValue === "boolean" ? defaultValue : typeof defaultValue === "string" ? ["true", "yes", "y", "1"].includes(
      defaultValue.trim().toLowerCase()
    ) : false;
    return promptApi.confirm({
      message: question.message,
      defaultValue: defaultBool
    });
  }
  const choices = question.choices ?? [];
  if (choices.length === 0) {
    throw new Error(`Prompt "${question.key}" is missing choices.`);
  }
  const selected = await promptApi.select({
    message: question.message,
    choices
  });
  return sanitizeAnswerString(selected);
}
function getNonInteractiveAnswer(question, defaultValue) {
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
function interpolateTemplateString(template, context, answers) {
  return template.replace(/{{([A-Z0-9_]+)}}/g, (_, token) => {
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
    const defaultValue = DEFAULT_TEMPLATE_VALUES[token];
    if (typeof defaultValue === "string") {
      return defaultValue;
    }
    return "";
  });
}
function sanitizeAnswerString(value) {
  return value.replace(/\r/g, "").trim();
}
function buildTemplateReplacements(params) {
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
  const walletConnectProjectId = getStringAnswer(
    answers,
    "WALLET_CONNECT_PROJECT_ID",
    DEFAULT_TEMPLATE_VALUES.WALLET_CONNECT_PROJECT_ID
  );
  const agentOptions = enablePayments ? [
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
    "}"
  ].join("\n") : "{}";
  const entrypointPriceLine = enablePayments ? `  price: "${entrypointPrice}",
` : `  // price: "${entrypointPrice}",
`;
  const entrypointPriceNote = enablePayments ? ` (price: ${entrypointPrice} base units)` : "";
  return {
    APP_NAME: projectDirName,
    PACKAGE_NAME: packageName,
    AGENT_DESCRIPTION: agentDescription,
    AGENT_VERSION: agentVersion,
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
    WALLET_CONNECT_PROJECT_ID: walletConnectProjectId
  };
}
function getStringAnswer(answers, key, fallback) {
  const value = answers.get(key);
  if (typeof value === "string" && value.trim().length > 0) {
    return sanitizeAnswerString(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return fallback;
}
function getBooleanAnswer(answers, key, fallback) {
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
function toEntrypointKey(value) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  return normalized.length > 0 ? normalized : DEFAULT_TEMPLATE_VALUES.ENTRYPOINT_KEY;
}
async function assertTemplatePresent(templatePath) {
  const exists = existsSync(templatePath);
  if (!exists) {
    throw new Error(`Template not found at ${templatePath}`);
  }
}
async function assertTargetDirectory(targetDir) {
  try {
    await fs.mkdir(targetDir, { recursive: true });
  } catch (error) {
    if (error.code !== "EEXIST") {
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
async function copyTemplate(templateRoot, targetDir) {
  await fs.cp(templateRoot, targetDir, {
    recursive: true,
    errorOnExist: false
  });
}
async function applyTemplateTransforms(targetDir, params) {
  await updatePackageJson(targetDir, params.packageName);
  const replacements = {
    APP_NAME: params.projectDirName,
    PACKAGE_NAME: params.packageName,
    ...params.replacements
  };
  await replaceTemplatePlaceholders(join(targetDir, "README.md"), replacements);
  await replaceTemplatePlaceholders(
    join(targetDir, "src/agent.ts"),
    replacements
  );
  await replaceTemplatePlaceholders(
    join(targetDir, ".env.example"),
    replacements
  );
  await replaceTemplatePlaceholders(
    join(targetDir, "src/lib/agent.ts"),
    replacements
  );
  await removeTemplateArtifacts(targetDir);
}
async function updatePackageJson(targetDir, packageName) {
  const packageJsonPath = join(targetDir, "package.json");
  const packageJsonRaw = await fs.readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonRaw);
  packageJson.name = packageName;
  await fs.writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}
`,
    "utf8"
  );
}
async function replaceTemplatePlaceholders(filePath, replacements) {
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
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}
async function removeTemplateArtifacts(targetDir) {
  const metaPath = join(targetDir, "template.json");
  await fs.rm(metaPath, { force: true });
}
async function setupEnvironment(params) {
  const { targetDir, envMode, prompt, logger } = params;
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
    defaultValue: true
  });
  if (!shouldCreate) {
    logger.log("Skipping env setup.");
    return;
  }
  const templateContent = await fs.readFile(examplePath, "utf8");
  const entries = parseEnvTemplate(templateContent);
  const answers = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (entry.type !== "entry") continue;
    const response = await prompt.input({
      message: `${entry.key}`,
      defaultValue: entry.value ?? ""
    });
    answers.set(entry.key, response);
  }
  const rendered = renderEnvTemplate(entries, answers);
  await fs.writeFile(envPath, rendered, "utf8");
  logger.log("Created .env with your values.");
}
function parseEnvTemplate(content) {
  const lines = content.split(/\r?\n/);
  return lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "") {
      return { type: "comment", raw: line };
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
function renderEnvTemplate(entries, answers) {
  return entries.map((entry) => {
    if (entry.type === "entry") {
      const answer = answers.get(entry.key) ?? entry.value ?? "";
      return `${entry.key}=${answer}`;
    }
    return entry.raw;
  }).join("\n") + "\n";
}
async function runInstall(cwd, logger) {
  logger.log("Running `bun install`...");
  try {
    await new Promise((resolve2, reject) => {
      const child = spawn("bun", ["install"], {
        cwd,
        stdio: "inherit"
      });
      child.on("error", (error) => reject(error));
      child.on("exit", (code) => {
        if (code === 0) {
          resolve2();
        } else {
          reject(
            new Error(`bun install exited with code ${code ?? "unknown"}`)
          );
        }
      });
    });
  } catch (error) {
    logger.warn(
      "\u26A0\uFE0F  Failed to run `bun install`. Please install dependencies manually."
    );
  }
}
function createInteractivePrompt(logger) {
  if (!stdin.isTTY || !stdout.isTTY) {
    return void 0;
  }
  const rl = createInterface({
    input: stdin,
    output: stdout
  });
  return {
    async select({ message, choices }) {
      logger.log(message);
      choices.forEach((choice, index) => {
        const detail = choice.description ? ` \u2013 ${choice.description}` : "";
        logger.log(`  ${index + 1}. ${choice.title}${detail}`);
      });
      const range = `1-${choices.length}`;
      while (true) {
        const answer = await rl.question(`Select an option [${range}]: `);
        const parsed = Number.parseInt(answer, 10);
        if (Number.isInteger(parsed) && parsed >= 1 && parsed <= choices.length) {
          return choices[parsed - 1].value;
        }
        logger.log("Please enter a valid option number.");
      }
    },
    async confirm({ message, defaultValue = true }) {
      const suffix = defaultValue ? "Y/n" : "y/N";
      while (true) {
        const answer = await rl.question(`${message} (${suffix}) `);
        const normalized = answer.trim().toLowerCase();
        if (normalized === "" && defaultValue !== void 0) {
          return defaultValue;
        }
        if (["y", "yes"].includes(normalized)) return true;
        if (["n", "no"].includes(normalized)) return false;
        logger.log("Please respond with y or n.");
      }
    },
    async input({ message, defaultValue = "" }) {
      const promptMessage = defaultValue && defaultValue.length > 0 ? `${message} (${defaultValue}): ` : `${message}: `;
      const answer = await rl.question(promptMessage);
      return answer === "" ? defaultValue : answer;
    },
    async close() {
      await rl.close();
    }
  };
}
async function main() {
  const prompt = createInteractivePrompt(defaultLogger);
  try {
    await runCli(process.argv.slice(2), {
      prompt
    });
  } catch (error) {
    defaultLogger.error(`
Error: ${error.message}`);
    process.exit(1);
  } finally {
    await prompt?.close?.();
  }
}
var isCliEntryPoint = (() => {
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
  main();
}

export { runCli };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map