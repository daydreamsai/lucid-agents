import {
  createX402LLM,
  type CreateX402LLMOptions,
} from '@lucid-agents/payments';
import type { Hex } from 'viem';

export type AxLLMClientOptions = {
  provider?: string;
  model?: string;
  apiKey?: string;
  apiUrl?: string;
  temperature?: number;
  debug?: boolean;
  env?: Record<string, string | undefined>;
  client?: ReturnType<typeof createX402LLM>;
  clientFactory?: () => ReturnType<typeof createX402LLM> | null;
  x402?: CreateX402LLMOptions;
  logger?: {
    warn?: (message: string, error?: unknown) => void;
  };
};

export type AxLLMClient = {
  ax: ReturnType<typeof createX402LLM> | null;
  isConfigured(): boolean;
};

const DEFAULT_PROVIDER = 'openai';
const DEFAULT_MODEL = 'gpt-5';

export function createAxLLMClient(
  options: AxLLMClientOptions = {}
): AxLLMClient {
  const resolved = resolveOptions(options);
  const logger = options.logger;

  const axInstance = (() => {
    if (options.client) return options.client;

    const fromFactory = options.clientFactory?.();
    if (fromFactory) return fromFactory;

    try {
      return createX402LLM(buildCreateOptions(resolved, options.x402));
    } catch (error) {
      logger?.warn?.(
        `[agent-kit] failed to initialise Ax LLM client: ${
          (error as Error).message
        }`,
        error
      );
      return null;
    }
  })();

  return {
    ax: axInstance,
    isConfigured() {
      return Boolean(axInstance);
    },
  };
}

function resolveOptions(options: AxLLMClientOptions) {
  const env = readEnv(options.env);

  const provider =
    options.provider ??
    env.AX_PROVIDER ??
    env.AXLLM_PROVIDER ??
    env.OPENAI_PROVIDER ??
    DEFAULT_PROVIDER;

  const model =
    options.model ??
    env.AX_MODEL ??
    env.AXLLM_MODEL ??
    env.OPENAI_MODEL ??
    DEFAULT_MODEL;

  const apiKey = options.apiKey ?? env.OPENAI_API_KEY;

  const apiUrl =
    options.apiUrl ?? env.AX_API_URL ?? env.AXLLM_API_URL ?? env.OPENAI_API_URL;

  const temperature =
    options.temperature ??
    parseNumber(
      env.AX_TEMPERATURE ?? env.AXLLM_TEMPERATURE ?? env.OPENAI_TEMPERATURE
    );

  const debug =
    options.debug ?? parseBoolean(env.AX_DEBUG ?? env.AXLLM_DEBUG) ?? false;

  return { provider, model, apiKey, apiUrl, temperature, debug };
}

function buildCreateOptions(
  resolved: ReturnType<typeof resolveOptions>,
  overrides: CreateX402LLMOptions | undefined
): CreateX402LLMOptions {
  const x402 = overrides ? { ...overrides } : {};
  const aiOverrides = overrides?.ai ? { ...overrides.ai } : {};
  const aiConfigOverrides =
    aiOverrides.config && typeof aiOverrides.config === 'object'
      ? { ...aiOverrides.config }
      : undefined;
  const aiOptionOverrides =
    aiOverrides.options && typeof aiOverrides.options === 'object'
      ? { ...aiOverrides.options }
      : undefined;

  const finalTemperature =
    aiConfigOverrides && 'temperature' in aiConfigOverrides
      ? aiConfigOverrides.temperature
      : resolved.temperature;

  const finalConfig = {
    stream: false,
    model: aiConfigOverrides?.model ?? x402.model ?? resolved.model,
    ...(aiConfigOverrides ?? {}),
    ...(finalTemperature !== undefined
      ? { temperature: finalTemperature }
      : {}),
  };

  const finalOptions = {
    ...(aiOptionOverrides ?? {}),
    ...(resolved.debug ? { debug: resolved.debug } : {}),
  };

  const apiKey =
    aiOverrides.apiKey ??
    resolved.apiKey ??
    (typeof process !== 'undefined' ? process.env.OPENAI_API_KEY : undefined);

  if (!apiKey) {
    throw new Error(
      '[agent-kit] createAxLLMClient requires an OpenAI API key (set apiKey or OPENAI_API_KEY)'
    );
  }

  const name = aiOverrides.name ?? resolved.provider;
  const apiURL = aiOverrides.apiURL ?? resolved.apiUrl;

  const finalAi = {
    ...aiOverrides,
    name,
    apiKey,
    ...(apiURL ? { apiURL } : {}),
    config: finalConfig,
    options: finalOptions,
  } as NonNullable<CreateX402LLMOptions['ai']>;

  const createOptions: CreateX402LLMOptions = {
    ...x402,
    model: x402.model ?? resolved.model,
    ai: finalAi,
  };

  if (!createOptions.account && !createOptions.privateKey) {
    const envPrivateKey =
      typeof process !== 'undefined'
        ? (process.env.PRIVATE_KEY as Hex | undefined)
        : undefined;
    if (envPrivateKey) {
      createOptions.privateKey = envPrivateKey;
    }
  }

  return createOptions;
}

function readEnv(
  env: Record<string, string | undefined> | undefined
): Record<string, string | undefined> {
  if (env) return env;
  if (typeof process !== 'undefined' && process?.env) {
    return process.env as Record<string, string | undefined>;
  }
  return {};
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === '') return undefined;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
