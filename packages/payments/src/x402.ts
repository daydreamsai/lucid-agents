import { ai } from '@ax-llm/ax';
import { privateKeyToAccount, type LocalAccount } from 'viem/accounts';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import type { Hex } from './crypto';

// Re-export Circle Gateway fetch alongside standard x402 fetch
export { createGatewayFetch, type GatewayFetch } from './gateway/fetch';

const DEFAULT_MODEL = 'gpt-5';
const DEFAULT_PROVIDER = 'openai';
const DEFAULT_API_URL = 'https://api-beta.daydreams.systems/v1';

export type WrappedFetch = typeof fetch & {
  preconnect?: () => Promise<void>;
};

export type X402Account = LocalAccount;

/**
 * Supported EVM networks for x402 payments.
 * Maps network names to CAIP-2 chain identifiers.
 */
const SUPPORTED_EVM_NETWORKS: Record<string, string> = {
  base: 'eip155:8453',
  'base-sepolia': 'eip155:84532',
  ethereum: 'eip155:1',
  sepolia: 'eip155:11155111',
};

export type CreateX402FetchOptions = {
  account: X402Account;
  fetchImpl?: typeof fetch;
  /** Networks to register. Defaults to all supported EVM networks. */
  networks?: string[];
};

export const createX402Fetch = ({
  account,
  fetchImpl,
  networks,
}: CreateX402FetchOptions): WrappedFetch => {
  if (!account) {
    throw new Error('[agent-kit-payments] createX402Fetch requires an account');
  }

  console.info(
    '[agent-kit-payments:x402] creating paid fetch',
    account.address ? `for ${account.address}` : '(account address unavailable)'
  );

  // Create EVM signer from the account
  const signer = toClientEvmSigner(account);

  // Create x402 client and register networks
  const client = new x402Client();
  const networksToRegister = networks ?? Object.keys(SUPPORTED_EVM_NETWORKS);

  for (const network of networksToRegister) {
    const caip2Id = SUPPORTED_EVM_NETWORKS[network];
    if (caip2Id) {
      client.register(caip2Id as `${string}:${string}`, new ExactEvmScheme(signer));
    }
  }

  console.info(
    '[agent-kit-payments:x402] registered networks:',
    networksToRegister.join(', ')
  );

  // Wrap fetch with payment handling
  const paymentFetch = wrapFetchWithPayment(fetchImpl ?? fetch, client);
  console.info('[agent-kit-payments:x402] wrapFetchWithPayment initialised');

  const describeInput = (input: Parameters<typeof fetch>[0]) => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    if (typeof (input as Request)?.url === 'string') {
      return (input as Request).url;
    }
    return '[object Request]';
  };

  const wrappedFetch: WrappedFetch = Object.assign(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => {
      const requestUrl = describeInput(input);
      const requestMethod =
        init?.method ??
        (input instanceof Request ? input.method : undefined) ??
        'POST';
      console.info(
        '[agent-kit-payments:x402] fetch request',
        requestUrl,
        requestMethod
      );
      try {
        const response = await paymentFetch(input, init ?? {});
        const paymentHeader =
          response.headers.get('PAYMENT-RESPONSE') ??
          response.headers.get('X-PAYMENT-RESPONSE');
        console.info(
          '[agent-kit-payments:x402] fetch response',
          requestUrl,
          response.status,
          paymentHeader ? '(paid)' : '(no x402 header)'
        );
        return response;
      } catch (error) {
        console.warn(
          '[agent-kit-payments:x402] fetch failed',
          requestUrl,
          (error as Error)?.message ?? error
        );
        throw error;
      }
    },
    {
      preconnect: async () => {},
    }
  );
  return wrappedFetch;
};

export const accountFromPrivateKey = (privateKey: Hex): X402Account => {
  if (!privateKey || privateKey.trim().length === 0) {
    throw new Error(
      '[agent-kit-payments] accountFromPrivateKey requires a non-empty private key'
    );
  }
  return privateKeyToAccount(privateKey);
};

// ============================================================================
// AxLLM Integration (x402 payment-enabled LLM client)
// ============================================================================

type AiFactoryArgs = Parameters<typeof ai>[0];
type AiFactoryConfig = NonNullable<AiFactoryArgs['config']>;
type AiFactoryOptions = NonNullable<AiFactoryArgs['options']>;

export type CreateX402LLMOptions = {
  account?: X402Account;
  privateKey?: Hex;
  fetch?: WrappedFetch;
  fetchImpl?: typeof fetch;
  model?: string;
  ai?:
    | (Record<string, unknown> & {
        options?: Partial<AiFactoryOptions>;
        config?: Partial<AiFactoryConfig>;
      })
    | undefined;
};

export const createX402LLM = (
  options: CreateX402LLMOptions = {}
): ReturnType<typeof ai> => {
  if (options.account) {
    console.info(
      '[agent-kit-payments:x402] initialising LLM with provided account'
    );
  } else if (options.privateKey) {
    console.info(
      '[agent-kit-payments:x402] deriving account from supplied private key'
    );
  } else {
    console.info(
      '[agent-kit-payments:x402] no explicit account/private key supplied; falling back to env or downstream defaults'
    );
  }

  const account =
    options.account ??
    (options.privateKey
      ? accountFromPrivateKey(options.privateKey)
      : undefined);

  if (!account) {
    throw new Error(
      '[agent-kit-payments] createX402LLM requires either an account or a private key'
    );
  }

  const paymentFetch =
    options.fetch ?? createX402Fetch({ account, fetchImpl: options.fetchImpl });
  console.info('[agent-kit-payments:x402] payment-enabled fetch ready for LLM');

  const aiOverrides = options.ai ?? {};
  const {
    config: configOverridesRaw,
    options: optionOverridesRaw,
    apiKey: apiKeyOverrideRaw,
    apiURL: apiUrlOverrideRaw,
    name: nameOverrideRaw,
    ...restAiProps
  } = aiOverrides;

  const configOverrides =
    configOverridesRaw && typeof configOverridesRaw === 'object'
      ? (configOverridesRaw as Partial<AiFactoryConfig>)
      : undefined;
  const optionOverrides =
    optionOverridesRaw && typeof optionOverridesRaw === 'object'
      ? (optionOverridesRaw as Partial<AiFactoryOptions>)
      : undefined;
  const explicitApiKey =
    typeof apiKeyOverrideRaw === 'string' && apiKeyOverrideRaw.trim().length > 0
      ? apiKeyOverrideRaw
      : undefined;
  const nameOverride =
    typeof nameOverrideRaw === 'string' && nameOverrideRaw.trim().length > 0
      ? nameOverrideRaw
      : undefined;
  const apiUrlOverride =
    typeof apiUrlOverrideRaw === 'string' && apiUrlOverrideRaw.trim().length > 0
      ? apiUrlOverrideRaw
      : undefined;

  const apiKey = (explicitApiKey ?? process.env.OPENAI_API_KEY) as
    | string
    | undefined;

  if (!apiKey) {
    throw new Error(
      '[agent-kit-payments] createX402LLM requires an OpenAI API key (set options.ai.apiKey or OPENAI_API_KEY)'
    );
  }

  const baseConfig: AiFactoryConfig = {
    stream: false,
  };

  const finalConfig = {
    ...baseConfig,
    ...(configOverrides ?? {}),
  } as AiFactoryConfig;

  const finalOptions = {
    ...(optionOverrides ?? {}),
    fetch: paymentFetch,
  } as AiFactoryOptions;

  const aiArgs = {
    ...restAiProps,
    name: nameOverride ?? DEFAULT_PROVIDER,
    apiKey,
    apiURL: apiUrlOverride ?? DEFAULT_API_URL,
    config: finalConfig,
    options: finalOptions,
  } as AiFactoryArgs;

  console.info(
    '[agent-kit-payments:x402] creating Ax client',
    `provider=${aiArgs.name}`,
    `model=${finalConfig.model}`
  );

  return ai(aiArgs);
};

export const x402LLM = ({
  privateKey = process.env.PRIVATE_KEY as Hex,
  model = DEFAULT_MODEL,
  apiURL = DEFAULT_API_URL,
}: {
  privateKey: Hex;
  model?: string;
  apiURL?: string;
}) =>
  createX402LLM({
    privateKey,
    model,
    ai: { apiURL },
  });
