import type { AgentRuntime } from '@lucid-agents/types/core';
import type { WalletConnector } from '@lucid-agents/types/wallets';
import type { Signer } from 'x402/types';
import { createSigner, type Hex, wrapFetchWithPayment } from 'x402-fetch';
import { sanitizeAddress, ZERO_ADDRESS } from './crypto';
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
};

export type RuntimePaymentContext = {
  fetchWithPayment: FetchLike | null;
  signer: Signer | null;
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

function inferChainId(network?: string): number | undefined {
  if (!network) return undefined;
  const normalized = network.toLowerCase();
  if (normalized === 'base' || normalized === 'eip155:8453') return 8453;
  if (
    normalized === 'base-sepolia' ||
    normalized === 'eip155:84532' ||
    normalized === 'base_testnet'
  )
    return 84532;
  return undefined;
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

    try {
      const signer = await createSigner(
        options.network as any,
        options.privateKey as any
      );
      const fetchWithPayment = attachPreconnect(
        wrapFetchWithPayment(
          baseFetch as typeof fetch,
          signer,
          resolveMaxPaymentBaseUnits(options.maxPaymentBaseUnits)
        ) as FetchLike,
        baseFetch
      );
      return {
        fetchWithPayment,
        signer,
        walletAddress: normalizeAddressOrNull(
          (signer as any)?.account?.address
        ),
        chainId:
          typeof (signer as any)?.chain?.id === 'number'
            ? (signer as any).chain.id
            : null,
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
  const signer = createRuntimeSigner({
    wallet: wallet.connector,
    initialAddress: walletAddress,
    chainId,
  });

  try {
    // Wrap base fetch with policy checking if policies are configured
    let fetchWithPolicy = baseFetch;
    const policyGroups = runtime.payments?.policyGroups;
    const paymentTracker = runtime.payments?.paymentTracker as
      | PaymentTracker
      | undefined;
    const rateLimiter = runtime.payments?.rateLimiter as
      | RateLimiter
      | undefined;

    if (
      policyGroups &&
      policyGroups.length > 0 &&
      paymentTracker &&
      rateLimiter
    ) {
      fetchWithPolicy = wrapBaseFetchWithPolicy(
        baseFetch,
        policyGroups,
        paymentTracker,
        rateLimiter
      );
    }

    const fetchWithPayment = attachPreconnect(
      wrapFetchWithPayment(
        fetchWithPolicy as typeof fetch,
        signer as unknown as Signer,
        resolveMaxPaymentBaseUnits(options.maxPaymentBaseUnits)
      ) as FetchLike,
      baseFetch
    );
    return {
      fetchWithPayment,
      signer: signer as unknown as Signer,
      walletAddress: signer.account.address,
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
