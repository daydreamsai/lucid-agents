import type { AgentRuntime } from '@lucid-agents/types/core';
import type { OutgoingPaymentBackend } from '@lucid-agents/types/payments';
import type { WalletConnector } from '@lucid-agents/types/wallets';
import { privateKeyToAccount } from 'viem/accounts';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import type { ClientEvmSigner } from '@x402/evm';
import { sanitizeAddress, ZERO_ADDRESS, type Hex } from './crypto';
import { wrapBaseFetchWithPolicy } from './policy-wrapper';
import type { PaymentTracker } from './payment-tracker';
import type { RateLimiter } from './rate-limiter';

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type TypedDataPayload = {
  domain?: Record<string, unknown>;
  types?: Record<string, Array<{ name: string; type: string }>>;
  message?: Record<string, unknown>;
  primaryType: string;
};

type RuntimeSigner = {
  chain: { id: number };
  account: { address: `0x${string}` | null };
  transport: { type: string };
  signTypedData(payload: TypedDataPayload): Promise<`0x${string}`>;
  signMessage(message: unknown): Promise<`0x${string}`>;
};

export type RuntimePaymentLogger = {
  warn?: (message: string, ...args: unknown[]) => void;
};

export type RuntimePaymentOptions = {
  /**
   * Existing AgentRuntime instance used to fulfil wallet requests.
   * Required unless `privateKey` is provided.
   */
  runtime?: AgentRuntime;
  /**
   * Optional override for the network used to infer the payment chain.
   */
  network?: string;
  /**
   * Optional explicit chain id. When omitted we attempt to infer it from `network`.
   */
  chainId?: number;
  /**
   * Maximum payment in base units (USDC has 6 decimals). Falls back to kit config.
   */
  maxPaymentBaseUnits?: bigint;
  /**
   * Optional direct private key to construct a local signer instead of using runtime wallet APIs.
   */
  privateKey?: Hex | string;
  /**
   * Fetch implementation to wrap. Defaults to `globalThis.fetch`.
   */
  fetch?: FetchLike;
  /**
   * Logger used for non-fatal warnings.
   */
  logger?: RuntimePaymentLogger;
  /**
   * Optional backend selection for outgoing paid calls.
   */
  outgoingBackend?: OutgoingPaymentBackend;
  /**
   * If true, fallback to wallet-signer when awal backend is unavailable.
   */
  fallbackToSigner?: boolean;
};

export type RuntimePaymentContext = {
  fetchWithPayment: FetchLike | null;
  signer: ClientEvmSigner | null;
  walletAddress: `0x${string}` | null;
  chainId: number | null;
};

function logWarning(
  logger: RuntimePaymentLogger | undefined,
  message: string,
  ...args: unknown[]
) {
  if (logger?.warn) {
    logger.warn(message, ...args);
    return;
  }
  console.warn(message, ...args);
}

function attachPreconnect(
  fetchImpl: FetchLike,
  baseFetch: FetchLike
): FetchLike {
  const upstream = baseFetch as FetchLike & {
    preconnect?: (input: Parameters<FetchLike>[0], init?: any) => Promise<void>;
  };
  const fallbackPreconnect = async () => {};
  const preconnectFn =
    typeof upstream.preconnect === 'function'
      ? upstream.preconnect.bind(baseFetch)
      : fallbackPreconnect;

  (
    fetchImpl as FetchLike & {
      preconnect: typeof preconnectFn;
    }
  ).preconnect = preconnectFn;
  return fetchImpl;
}

/**
 * Network configuration for x402 payments.
 */
const NETWORK_CONFIG: Record<string, { chainId: number; caip2: string }> = {
  base: { chainId: 8453, caip2: 'eip155:8453' },
  'base-sepolia': { chainId: 84532, caip2: 'eip155:84532' },
  ethereum: { chainId: 1, caip2: 'eip155:1' },
  sepolia: { chainId: 11155111, caip2: 'eip155:11155111' },
};

function inferChainId(network?: string): number | undefined {
  if (!network) return undefined;
  const normalized = network.toLowerCase();
  // Check for CAIP-2 format first (e.g., eip155:8453)
  const caip2Match = normalized.match(/^eip155:(\d+)$/);
  if (caip2Match) {
    return parseInt(caip2Match[1], 10);
  }
  // Check for named network
  return NETWORK_CONFIG[normalized]?.chainId;
}

function networkToCaip2(network: string): string | undefined {
  const normalized = network.toLowerCase();
  // Already CAIP-2 format
  if (normalized.startsWith('eip155:')) {
    return normalized;
  }
  return NETWORK_CONFIG[normalized]?.caip2;
}

function normalizeTypedData(input: TypedDataPayload) {
  if (!input.primaryType) {
    throw new Error('[agent-kit] Typed data missing primaryType');
  }
  return {
    domain: input.domain ?? {},
    types: input.types ?? {},
    message: input.message ?? {},
    primaryType: input.primaryType,
  };
}

const toStringMessage = (message: unknown): string => {
  if (typeof message === 'string') return message;
  if (typeof (message as any)?.raw === 'string') {
    return String((message as any).raw);
  }
  if (message instanceof Uint8Array) {
    return Array.from(message)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  if (typeof message === 'object') {
    return JSON.stringify(message ?? '');
  }
  return String(message ?? '');
};

async function fetchWalletAddress(
  wallet: WalletConnector
): Promise<string | null> {
  try {
    const metadata = await wallet.getWalletMetadata();
    return metadata?.address ?? null;
  } catch {
    return null;
  }
}

function resolveMaxPaymentBaseUnits(
  override?: bigint,
  configOverride?: { maxPaymentBaseUnits?: bigint; maxPaymentUsd?: number }
): bigint | undefined {
  if (typeof override === 'bigint') return override;
  if (!configOverride) return undefined;

  if (typeof configOverride.maxPaymentBaseUnits === 'bigint') {
    return configOverride.maxPaymentBaseUnits;
  }
  if (
    typeof configOverride.maxPaymentUsd === 'number' &&
    Number.isFinite(configOverride.maxPaymentUsd)
  ) {
    const scaled = Math.floor(configOverride.maxPaymentUsd * 1_000_000);
    return scaled > 0 ? BigInt(scaled) : undefined;
  }
  return undefined;
}

type OutgoingBackendType = 'wallet-signer' | 'awal';

function resolveOutgoingBackend(
  options: RuntimePaymentOptions
): OutgoingBackendType {
  if (options.outgoingBackend?.type) {
    return options.outgoingBackend.type;
  }

  if (options.runtime?.awal) {
    return 'awal';
  }

  return 'wallet-signer';
}

function resolvePolicyWrappedFetch(
  baseFetch: FetchLike,
  runtime: AgentRuntime
): FetchLike {
  const policyGroups = runtime.payments?.policyGroups;
  const paymentTracker = runtime.payments?.paymentTracker as
    | PaymentTracker
    | undefined;
  const rateLimiter = runtime.payments?.rateLimiter as RateLimiter | undefined;

  if (
    policyGroups &&
    policyGroups.length > 0 &&
    paymentTracker &&
    rateLimiter
  ) {
    return wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      paymentTracker,
      rateLimiter
    );
  }

  return baseFetch;
}

const normalizeAddressOrNull = (
  value?: string | null
): `0x${string}` | null => {
  const sanitized = sanitizeAddress(value ?? undefined);
  return sanitized === ZERO_ADDRESS ? null : sanitized;
};

function createRuntimeSigner(opts: {
  wallet: WalletConnector;
  initialAddress?: string | null;
  chainId: number;
}): RuntimeSigner {
  let currentAddress = normalizeAddressOrNull(opts.initialAddress);
  let currentChainId = opts.chainId;

  const signer: RuntimeSigner = {
    chain: { id: currentChainId },
    account: { address: currentAddress },
    transport: { type: 'agent-runtime' },
    async signTypedData(data: TypedDataPayload) {
      const typedData = normalizeTypedData(data);
      const domainChain =
        (typedData.domain as any)?.chainId ??
        (typedData.domain as any)?.chain_id;
      if (typeof domainChain !== 'undefined') {
        const parsed = Number(domainChain);
        if (Number.isFinite(parsed) && parsed > 0) {
          currentChainId = parsed;
          signer.chain.id = parsed;
        }
      }

      // Create a challenge-like payload for typed data signing
      // The payload should have typedData field for typed data signing
      const challengePayload = {
        typedData: {
          domain: typedData.domain,
          types: typedData.types,
          message: typedData.message,
          primaryType: typedData.primaryType,
        },
      };

      // Use signChallenge with a synthetic challenge for typed data
      const challenge = {
        id:
          typeof crypto?.randomUUID === 'function'
            ? crypto.randomUUID()
            : globalThis?.crypto?.randomUUID
              ? globalThis.crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
        nonce: `${Date.now()}-${Math.random()}`,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        payload: challengePayload,
        scopes: ['wallet.sign'],
      };

      const signature = await opts.wallet.signChallenge(challenge);

      // Update address from wallet metadata if available
      const metadata = await opts.wallet.getWalletMetadata();
      if (metadata?.address) {
        const nextAddress = normalizeAddressOrNull(metadata.address);
        currentAddress = nextAddress ?? currentAddress;
        signer.account.address = currentAddress;
      }

      return signature as `0x${string}`;
    },
    async signMessage(message: unknown) {
      const payload = toStringMessage(message);

      // Create a challenge-like payload for message signing
      // The payload can be a string message directly, or an object with message field
      const challengePayload = payload;

      // Use signChallenge with a synthetic challenge for message signing
      const challenge = {
        id:
          typeof crypto?.randomUUID === 'function'
            ? crypto.randomUUID()
            : globalThis?.crypto?.randomUUID
              ? globalThis.crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
        nonce: `${Date.now()}-${Math.random()}`,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        payload: challengePayload,
        scopes: ['wallet.sign'],
      };

      const signature = await opts.wallet.signChallenge(challenge);

      // Update address from wallet metadata if available
      const metadata = await opts.wallet.getWalletMetadata();
      if (metadata?.address) {
        const nextAddress = normalizeAddressOrNull(metadata.address);
        currentAddress = nextAddress ?? currentAddress;
        signer.account.address = currentAddress;
      }

      return signature as `0x${string}`;
    },
  };

  return signer;
}

export async function createRuntimePaymentContext(
  options: RuntimePaymentOptions
): Promise<RuntimePaymentContext> {
  const baseFetch = options.fetch ?? globalThis.fetch;
  if (!baseFetch) {
    logWarning(
      options.logger,
      '[agent-kit] No fetch implementation available; skipping payment wrapping'
    );
    return {
      fetchWithPayment: null,
      signer: null,
      walletAddress: null,
      chainId: null,
    };
  }

  if (options.privateKey) {
    if (!options.network) {
      logWarning(
        options.logger,
        '[agent-kit-payments] Private key payment context requires options.network'
      );
      return {
        fetchWithPayment: null,
        signer: null,
        walletAddress: null,
        chainId: null,
      };
    }

    const caip2Network = networkToCaip2(options.network);
    if (!caip2Network) {
      logWarning(
        options.logger,
        `[agent-kit-payments] Unsupported network: ${options.network}`
      );
      return {
        fetchWithPayment: null,
        signer: null,
        walletAddress: null,
        chainId: null,
      };
    }

    try {
      // Create account from private key
      const account = privateKeyToAccount(options.privateKey as Hex);
      const signer = toClientEvmSigner(account);

      // Create x402 client and register the network
      const client = new x402Client();
      client.register(caip2Network as `${string}:${string}`, new ExactEvmScheme(signer));

      const fetchWithPayment = attachPreconnect(
        wrapFetchWithPayment(baseFetch as typeof fetch, client) as FetchLike,
        baseFetch
      );

      const chainId = inferChainId(options.network);

      return {
        fetchWithPayment,
        signer,
        walletAddress: account.address,
        chainId: chainId ?? null,
      };
    } catch (error) {
      logWarning(
        options.logger,
        `[agent-kit-payments] Failed to initialise paid fetch with private key: ${
          (error as Error)?.message ?? error
        }`
      );
      return {
        fetchWithPayment: null,
        signer: null,
        walletAddress: null,
        chainId: null,
      };
    }
  }

  if (!options.runtime) {
    logWarning(
      options.logger,
      '[agent-kit-payments] Runtime payment context requires either a runtime or private key'
    );
    return {
      fetchWithPayment: null,
      signer: null,
      walletAddress: null,
      chainId: null,
    };
  }

  const runtime = options.runtime;

  const outgoingBackend = resolveOutgoingBackend(options);
  if (outgoingBackend === 'awal') {
    if (!runtime.awal) {
      if (!options.fallbackToSigner) {
        logWarning(
          options.logger,
          '[agent-kit-payments] Outgoing backend set to awal but runtime.awal is not configured'
        );
        return {
          fetchWithPayment: null,
          signer: null,
          walletAddress: null,
          chainId: options.chainId ?? inferChainId(options.network) ?? null,
        };
      }

      logWarning(
        options.logger,
        '[agent-kit-payments] runtime.awal unavailable; falling back to wallet-signer backend'
      );
    } else {
      const fetchWithPolicy = resolvePolicyWrappedFetch(baseFetch, runtime);
      const fetchWithAwal = attachPreconnect(async (input, init) => {
        const request = new Request(input, init);
        const unpaidResponse = await fetchWithPolicy(request.clone());

        if (
          unpaidResponse.status !== 402 ||
          !unpaidResponse.headers.get('PAYMENT-REQUIRED')
        ) {
          return unpaidResponse;
        }

        const method = request.method.toUpperCase();
        const body =
          method === 'GET' || method === 'HEAD'
            ? undefined
            : await request.clone().arrayBuffer();

        return runtime.awal.payX402Request(request.url, {
          method: request.method,
          headers: request.headers,
          body,
        });
      }, baseFetch);

      return {
        fetchWithPayment: fetchWithAwal,
        signer: null,
        walletAddress: null,
        chainId: options.chainId ?? inferChainId(options.network) ?? null,
      };
    }
  }

  if (!runtime.wallets?.agent) {
    logWarning(
      options.logger,
      '[agent-kit-payments] Runtime does not have an agent wallet configured'
    );
    return {
      fetchWithPayment: null,
      signer: null,
      walletAddress: null,
      chainId: null,
    };
  }

  const wallet = runtime.wallets.agent;

  const chainId = options.chainId ?? inferChainId(options.network);
  if (!chainId) {
    logWarning(
      options.logger,
      '[agent-kit-payments] Unable to derive chainId for runtime payments; provide options.chainId or options.network'
    );
    return {
      fetchWithPayment: null,
      signer: null,
      walletAddress: null,
      chainId: null,
    };
  }

  const walletAddress = await fetchWalletAddress(wallet.connector);

  // If no valid wallet address is available, we can't create a signer
  if (!walletAddress || walletAddress === ZERO_ADDRESS) {
    logWarning(
      options.logger,
      '[agent-kit-payments] Wallet address not available; cannot create payment signer'
    );
    return {
      fetchWithPayment: null,
      signer: null,
      walletAddress: null,
      chainId,
    };
  }

  const runtimeSigner = createRuntimeSigner({
    wallet: wallet.connector,
    initialAddress: walletAddress,
    chainId,
  });

  // Adapt RuntimeSigner to ClientEvmSigner interface using a Proxy
  // to ensure address always reflects the current runtimeSigner.account.address
  const signerTarget = {
    address: '' as `0x${string}`,
    signTypedData: async (message: {
      domain: unknown;
      types: unknown;
      message: unknown;
      primaryType: string;
    }) => {
      return runtimeSigner.signTypedData({
        domain: message.domain as Record<string, unknown>,
        types: message.types as Record<
          string,
          Array<{ name: string; type: string }>
        >,
        message: message.message as Record<string, unknown>,
        primaryType: message.primaryType,
      });
    },
  };

  const signer: ClientEvmSigner = new Proxy(signerTarget, {
    get(target, prop) {
      if (prop === 'address') {
        // Always return the current address from runtimeSigner
        return runtimeSigner.account.address ?? (ZERO_ADDRESS as `0x${string}`);
      }
      return Reflect.get(target, prop);
    },
  });

  // Get CAIP-2 network identifier
  const caip2Network = options.network
    ? networkToCaip2(options.network)
    : `eip155:${chainId}`;

  if (!caip2Network) {
    logWarning(
      options.logger,
      `[agent-kit-payments] Unable to derive CAIP-2 network for chainId ${chainId}`
    );
    return {
      fetchWithPayment: null,
      signer: null,
      walletAddress: normalizeAddressOrNull(walletAddress),
      chainId,
    };
  }

  try {
    const fetchWithPolicy = resolvePolicyWrappedFetch(baseFetch, runtime);

    // Create x402 client and register the network
    const client = new x402Client();
    client.register(caip2Network as `${string}:${string}`, new ExactEvmScheme(signer));

    const fetchWithPayment = attachPreconnect(
      wrapFetchWithPayment(fetchWithPolicy as typeof fetch, client) as FetchLike,
      baseFetch
    );

    return {
      fetchWithPayment,
      signer,
      walletAddress: runtimeSigner.account.address,
      chainId,
    };
  } catch (error) {
    logWarning(
      options.logger,
      `[agent-kit-payments] Failed to initialise runtime-backed paid fetch: ${
        (error as Error)?.message ?? error
      }`
    );
    return {
      fetchWithPayment: null,
      signer: null,
      walletAddress: normalizeAddressOrNull(walletAddress),
      chainId,
    };
  }
}
