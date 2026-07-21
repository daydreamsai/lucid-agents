import { realpathSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import {
  readEnvironmentFile,
  selectUploadEnvironment,
  type UploadEnvironment,
} from './environment';
import {
  type DeployManifest,
  loadDeployManifest,
  type ManifestEnvironment,
} from './manifest';
import { PREVIEW_SAFETY_VARIABLES } from './preview-policy';
import {
  assertNoInheritedRemoteSecrets,
  registerProviderCredentialValues,
  uploadPreview,
  verifyAuthentication,
} from './provider';
import { validateProviderConfig } from './provider-config';
import { errorMessage, redact } from './redaction';
import { verifyDeployment } from './verify';

type CliOptions = {
  destroyPreview: boolean;
  help: boolean;
  production: boolean;
  yes: boolean;
};

export type CliRunOptions = {
  args: string[];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  interactive: boolean;
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  confirm?: (question: string) => Promise<boolean>;
  allowLocalPreview?: boolean;
};

type CommandContext = CliRunOptions & {
  sensitiveValues: Set<string>;
};

const MANIFEST_NAME = 'lucid.deploy.json';

export async function runCli(options: CliRunOptions): Promise<number> {
  const context: CommandContext = {
    ...options,
    sensitiveValues: new Set<string>(),
  };
  try {
    await executeDeployment(context);
    return 0;
  } catch (error) {
    context.error(
      `Error: ${redact(errorMessage(error), context.sensitiveValues)}`
    );
    return 1;
  }
}

async function executeDeployment(context: CommandContext): Promise<void> {
  const options = parseArgs(context.args);
  if (options.help) {
    printHelp(context.log);
    return;
  }

  const projectRoot = context.cwd;
  const manifestPath = resolve(projectRoot, MANIFEST_NAME);
  const manifest = await loadDeployManifest(manifestPath, MANIFEST_NAME);
  assertSupportedOperation(options, manifest.provider);

  const paths = {
    entrypoint: resolveProjectPath(
      projectRoot,
      manifest.paths.entrypoint,
      'paths.entrypoint'
    ),
    providerConfig: resolveProjectPath(
      projectRoot,
      manifest.paths.providerConfig,
      'paths.providerConfig'
    ),
    environmentFile: resolveProjectPath(
      projectRoot,
      manifest.paths.environmentFile,
      'paths.environmentFile'
    ),
  };
  await Promise.all([access(paths.entrypoint), access(paths.providerConfig)]);
  await validateProviderConfig(paths.providerConfig);

  registerProviderCredentialValues(
    context.environment,
    context.sensitiveValues
  );
  const providerToken = context.environment.CLOUDFLARE_API_TOKEN?.trim() ?? '';
  if (providerToken) context.sensitiveValues.add(providerToken);
  assertExecutionMode({
    ci: Boolean(context.environment.CI),
    interactive: context.interactive,
    options,
    providerToken,
  });

  const fileEnvironment = await readEnvironmentFile(
    paths.environmentFile,
    new Set(manifest.environment.allowlist)
  );
  const uploadEnvironment = selectUploadEnvironment(
    manifest.environment,
    fileEnvironment,
    context.environment
  );
  for (const value of uploadEnvironment.secrets.values()) {
    context.sensitiveValues.add(value);
  }

  await confirmSensitiveDeployment({
    context,
    manifest: manifest.environment,
    options,
    values: new Map([...uploadEnvironment.plain, ...uploadEnvironment.secrets]),
  });
  printUploadPlan(uploadEnvironment, context.log);

  await verifyAuthentication(paths.providerConfig, context);
  await assertNoInheritedRemoteSecrets({
    providerConfig: paths.providerConfig,
    uploadedSecretNames: new Set(uploadEnvironment.secrets.keys()),
    context,
  });
  const previewUrl = await uploadPreview({
    context,
    paths,
    uploadEnvironment,
  });
  context.log(`Preview URL: ${redact(previewUrl, context.sensitiveValues)}`);
  await verifyDeployment(previewUrl, context);
  context.log('Cloudflare preview is ready. Production was not modified.');
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    destroyPreview: false,
    help: false,
    production: false,
    yes: false,
  };

  for (const arg of args) {
    if (arg === '--yes') options.yes = true;
    else if (arg === '--prod') options.production = true;
    else if (arg === '--destroy-preview') options.destroyPreview = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option "${arg}". Run lucid-deploy --help.`);
  }

  if (options.production && options.destroyPreview) {
    throw new Error('--prod and --destroy-preview cannot be used together.');
  }
  return options;
}

function printHelp(log: (message: string) => void): void {
  log('Usage: lucid-deploy [options]');
  log('');
  log('Deploy the project described by lucid.deploy.json.');
  log('');
  log('Options:');
  log('  --yes              Confirm safeguards for non-interactive use');
  log('  --prod             Deploy production (not available yet)');
  log('  --destroy-preview  Delete the preview (not available yet)');
  log('  -h, --help         Show this help');
}

function assertSupportedOperation(
  options: CliOptions,
  provider: DeployManifest['provider']
): void {
  if (options.production) {
    throw new Error(
      `Production deployment is not supported by the ${provider} preview tracer yet.`
    );
  }
  if (options.destroyPreview) {
    throw new Error(
      `Preview cleanup is not supported by the ${provider} preview tracer yet.`
    );
  }
}

function assertExecutionMode(params: {
  ci: boolean;
  interactive: boolean;
  options: CliOptions;
  providerToken: string;
}): void {
  if (params.interactive && !params.ci) return;
  if (!params.options.yes || params.providerToken.length === 0) {
    throw new Error(
      'Non-interactive deployment requires both --yes and CLOUDFLARE_API_TOKEN.'
    );
  }
}

function resolveProjectPath(
  projectRoot: string,
  path: string,
  label: string
): string {
  if (isAbsolute(path)) {
    throw new Error(`${label} must be relative to the project root.`);
  }
  const resolved = resolve(projectRoot, path);
  const projectRelative = relative(projectRoot, resolved);
  if (
    projectRelative.length === 0 ||
    projectRelative === '..' ||
    projectRelative.startsWith(
      `..${process.platform === 'win32' ? '\\' : '/'}`
    ) ||
    isAbsolute(projectRelative)
  ) {
    throw new Error(`${label} must stay inside the project root.`);
  }
  return resolved;
}

async function confirmSensitiveDeployment(params: {
  context: CommandContext;
  manifest: ManifestEnvironment;
  options: CliOptions;
  values: Map<string, string>;
}): Promise<void> {
  const signingKeys = params.manifest.signingKeys.filter(name =>
    params.values.has(name)
  );
  const mainnetKeys = Object.entries(params.manifest.mainnet)
    .filter(([name, mainnetValues]) => {
      const selected = params.values.get(name)?.trim().toLowerCase();
      return Boolean(
        selected &&
        mainnetValues.some(value => value.toLowerCase() === selected)
      );
    })
    .map(([name]) => name);
  const warnings: string[] = [];
  if (signingKeys.length > 0) {
    warnings.push(`private signing material (${signingKeys.join(', ')})`);
  }
  if (mainnetKeys.length > 0) {
    warnings.push(`mainnet configuration (${mainnetKeys.join(', ')})`);
  }
  if (warnings.length === 0) return;

  params.context.warn(`Sensitive deployment detected: ${warnings.join('; ')}.`);
  if (params.options.yes) {
    params.context.warn('Sensitive deployment confirmed by --yes.');
    return;
  }
  if (!params.context.interactive) {
    throw new Error('Sensitive deployment requires explicit confirmation.');
  }

  const confirmed = await confirmDeployment(params.context);
  if (!confirmed) throw new Error('Deployment cancelled.');
}

async function confirmDeployment(context: CommandContext): Promise<boolean> {
  const question = 'Continue with this preview? [y/N] ';
  if (context.confirm) return context.confirm(question);
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await prompt.question(question);
    return ['y', 'yes'].includes(answer.trim().toLowerCase());
  } finally {
    prompt.close();
  }
}

function printUploadPlan(
  environment: UploadEnvironment,
  log: (message: string) => void
): void {
  const names = [
    ...environment.plain.keys(),
    ...environment.secrets.keys(),
  ].sort();
  if (names.length === 0) {
    log('No allowlisted environment values are set.');
  } else {
    log('Uploading allowlisted environment values:');
    for (const name of names) log(`  ${name}=<redacted>`);
  }
  for (const name of PREVIEW_SAFETY_VARIABLES.keys()) {
    log(`  ${name}=<redacted> (forced off for preview)`);
  }
}

function isDirectExecution(): boolean {
  if (import.meta.main) return true;
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  try {
    return (
      realpathSync(invokedPath) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return resolve(invokedPath) === fileURLToPath(import.meta.url);
  }
}

if (isDirectExecution()) {
  void runCli({
    args: process.argv.slice(2),
    cwd: process.cwd(),
    environment: process.env,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    log: message => console.log(message),
    warn: message => console.warn(message),
    error: message => console.error(message),
  }).then(exitCode => {
    process.exitCode = exitCode;
  });
}
