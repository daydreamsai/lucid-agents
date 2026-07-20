import type { FetchFunction } from '@lucid-agents/types/http';

type WalletClientLike = {
  account?: { address?: string };
  chain?: { id?: number };
  signMessage?: (input: {
    account?: unknown;
    message: string;
  }) => Promise<`0x${string}`>;
  signTypedData?: (input: Record<string, unknown>) => Promise<`0x${string}`>;
};

export type SolanaWalletLike = {
  address?: string;
  network?: string;
  provider?: {
    signTransaction: (transaction: unknown) => Promise<unknown>;
  };
};

type RequestOptions = {
  walletClient?: unknown;
  solanaWallet?: SolanaWalletLike;
  network?: string;
  siwxNetwork?: string;
  useSIWx?: boolean;
  useX402?: boolean;
  mppCredential?: string;
};

export class ServiceRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly challenge?: string;

  constructor(
    message: string,
    options: { status: number; code?: string; challenge?: string }
  ) {
    super(message);
    this.name = 'ServiceRequestError';
    this.status = options.status;
    this.code = options.code;
    this.challenge = options.challenge;
  }
}

let paymentModulePromise: Promise<typeof import('@x402/fetch') | null> | null =
  null;
let evmPaymentModulePromise: Promise<typeof import('@x402/evm') | null> | null =
  null;
let svmPaymentModulePromise: Promise<typeof import('@x402/svm') | null> | null =
  null;
let solanaKitModulePromise: Promise<
  typeof import('@solana/kit') | null
> | null = null;
let solanaWeb3ModulePromise: Promise<
  typeof import('@solana/web3.js') | null
> | null = null;
let siwxModulePromise: Promise<
  typeof import('@lucid-agents/payments') | null
> | null = null;

function walletAddress(walletClient: WalletClientLike): string | undefined {
  return walletClient.account?.address;
}

/** Returns a user-facing error when a connected wallet is on the wrong CAIP-2 network. */
export function paymentNetworkMismatch(
  expectedNetwork: string | undefined,
  context: { evmChainId?: number; solanaNetwork?: string }
): string | undefined {
  if (!expectedNetwork) return undefined;
  if (expectedNetwork.startsWith('eip155:')) {
    const expectedChainId = Number(expectedNetwork.slice('eip155:'.length));
    if (!Number.isSafeInteger(expectedChainId)) {
      return `The service published an invalid payment network: ${expectedNetwork}.`;
    }
    if (
      context.evmChainId !== undefined &&
      context.evmChainId !== expectedChainId
    ) {
      return `Switch the connected wallet to ${expectedNetwork} before continuing.`;
    }
    return undefined;
  }
  if (expectedNetwork.startsWith('solana:')) {
    if (context.solanaNetwork && context.solanaNetwork !== expectedNetwork) {
      return `Switch the connected wallet to ${expectedNetwork} before continuing.`;
    }
    return undefined;
  }
  return `This storefront does not support payment network ${expectedNetwork}.`;
}

/** Adapts an AppKit Solana provider to the signer contract used by x402. */
export async function createSolanaSigner(wallet: SolanaWalletLike) {
  if (!wallet.address || !wallet.provider) return undefined;
  if (!solanaKitModulePromise) {
    solanaKitModulePromise = import('@solana/kit').catch(() => null);
  }
  if (!solanaWeb3ModulePromise) {
    solanaWeb3ModulePromise = import('@solana/web3.js').catch(() => null);
  }
  const [kit, web3] = await Promise.all([
    solanaKitModulePromise,
    solanaWeb3ModulePromise,
  ]);
  if (!kit || !web3) return undefined;

  const signerAddress = kit.address(wallet.address);
  return {
    address: signerAddress,
    signTransactions: async (
      transactions: readonly import('@solana/kit').Transaction[]
    ) =>
      Promise.all(
        transactions.map(async transaction => {
          const wireBytes = new Uint8Array(
            kit.getTransactionEncoder().encode(transaction)
          );
          const unsigned = web3.VersionedTransaction.deserialize(wireBytes);
          const candidate = await wallet.provider!.signTransaction(unsigned);
          const signed =
            candidate instanceof web3.VersionedTransaction
              ? candidate
              : unsigned;
          const signerIndex = signed.message.staticAccountKeys.findIndex(
            key => key.toBase58() === wallet.address
          );
          const signature = signed.signatures[signerIndex];
          if (
            signerIndex < 0 ||
            !signature ||
            signature.every(byte => byte === 0)
          ) {
            throw new Error(
              'The connected Solana wallet did not sign the payment transaction.'
            );
          }
          return {
            [signerAddress]: signature as import('@solana/kit').SignatureBytes,
          };
        })
      ),
  } satisfies import('@solana/kit').TransactionPartialSigner;
}

async function resolveFetcher(options: RequestOptions) {
  let resolvedFetch: FetchFunction = globalThis.fetch.bind(globalThis);
  const walletClient = options.walletClient as WalletClientLike | undefined;

  if (options.useSIWx && walletClient) {
    if (!siwxModulePromise) {
      siwxModulePromise = import('@lucid-agents/payments').catch(() => null);
    }
    const siwx = await siwxModulePromise;
    const address = walletAddress(walletClient);
    if (siwx && address && walletClient.signMessage) {
      resolvedFetch = siwx.wrapFetchWithSIWx(resolvedFetch, {
        getAddress: async () => address,
        getChainId: async () =>
          options.siwxNetwork ??
          (walletClient.chain?.id ? `eip155:${walletClient.chain.id}` : ''),
        signMessage: message =>
          walletClient.signMessage!({
            account: walletClient.account,
            message,
          }),
      });
    }
  }

  if (!options.useX402) return resolvedFetch;
  if (!paymentModulePromise) {
    paymentModulePromise = import('@x402/fetch').catch(() => null);
  }
  const payment = await paymentModulePromise;
  if (!payment) {
    throw new Error('The x402 browser client is unavailable.');
  }

  if (options.network?.startsWith('solana:')) {
    if (!svmPaymentModulePromise) {
      svmPaymentModulePromise = import('@x402/svm').catch(() => null);
    }
    const [svm, signer] = await Promise.all([
      svmPaymentModulePromise,
      createSolanaSigner(options.solanaWallet ?? {}),
    ]);
    if (!svm || !signer) {
      throw new Error('Connect a compatible Solana wallet to continue.');
    }
    const client = new payment.x402Client().register(
      'solana:*',
      new svm.ExactSvmScheme(signer)
    );
    return payment.wrapFetchWithPayment(resolvedFetch as typeof fetch, client);
  }

  if (options.network && !options.network.startsWith('eip155:')) {
    throw new Error(`Unsupported x402 network: ${options.network}.`);
  }
  if (!walletClient) {
    throw new Error('Connect an EVM wallet to continue.');
  }
  if (!evmPaymentModulePromise) {
    evmPaymentModulePromise = import('@x402/evm').catch(() => null);
  }
  const evm = await evmPaymentModulePromise;
  const address = walletAddress(walletClient);
  if (!evm || !address || !walletClient.signTypedData) {
    throw new Error('The connected EVM wallet cannot sign x402 payments.');
  }
  if (!/^0x[0-9a-f]{40}$/iu.test(address)) {
    throw new Error('The connected wallet does not expose an EVM address.');
  }
  const client = new payment.x402Client().register(
    'eip155:*',
    new evm.ExactEvmScheme({
      address: address as `0x${string}`,
      signTypedData: message =>
        walletClient.signTypedData!({
          ...message,
          account: walletClient.account,
        }),
    })
  );
  return payment.wrapFetchWithPayment(resolvedFetch as typeof fetch, client);
}

async function responseError(response: Response): Promise<ServiceRequestError> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string | { code?: string; message?: string; details?: unknown };
  } | null;
  const error = payload?.error;
  const code = typeof error === 'object' ? error.code : undefined;
  const message =
    typeof error === 'string'
      ? error
      : (error?.message ??
        (response.status === 402
          ? 'This operation requires authorization or payment.'
          : `The service returned HTTP ${response.status}.`));
  return new ServiceRequestError(message, {
    status: response.status,
    ...(code ? { code } : {}),
    ...(response.headers.get('Payment-Authenticate')
      ? { challenge: response.headers.get('Payment-Authenticate')! }
      : {}),
  });
}

function requestHeaders(options: RequestOptions): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (options.mppCredential?.trim()) {
    headers.set('Authorization', `Payment ${options.mppCredential.trim()}`);
  }
  return headers;
}

export async function invokeServiceOperation(options: {
  url: string;
  body: unknown;
  request: RequestOptions;
}): Promise<unknown> {
  const fetcher = await resolveFetcher(options.request);
  const response = await fetcher(options.url, {
    method: 'POST',
    headers: requestHeaders(options.request),
    body: JSON.stringify(options.body ?? {}),
  });
  if (!response.ok) throw await responseError(response);
  return (response.headers.get('content-type') ?? '').includes(
    'application/json'
  )
    ? response.json()
    : response.text();
}

export async function streamServiceOperation(options: {
  url: string;
  body: unknown;
  request: RequestOptions;
  onChunk: (chunk: unknown) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}): Promise<{ cancel: () => void }> {
  const controller = new AbortController();
  const fetcher = await resolveFetcher(options.request);
  const response = await fetcher(options.url, {
    method: 'POST',
    headers: requestHeaders(options.request),
    body: JSON.stringify(options.body ?? {}),
    signal: controller.signal,
  });
  if (!response.ok || !response.body) throw await responseError(response);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    options.onDone();
  };

  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder
          .decode(value, { stream: true })
          .replace(/\r\n/g, '\n');
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const event of events) {
          const payload = event
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trimStart())
            .join('\n');
          if (!payload) continue;
          if (payload === '[DONE]') {
            finish();
            return;
          }
          try {
            options.onChunk(JSON.parse(payload));
          } catch {
            options.onChunk(payload);
          }
        }
      }
      finish();
    } catch (error) {
      if (!controller.signal.aborted) options.onError(error as Error);
      finish();
    }
  })();

  return {
    cancel: () => {
      controller.abort();
      finish();
    },
  };
}

export async function createServiceTask(options: {
  url: string;
  skillId: string;
  input: unknown;
  request: RequestOptions;
}): Promise<{ taskId: string; accessToken: string; status: 'running' }> {
  const fetcher = await resolveFetcher(options.request);
  const response = await fetcher(options.url, {
    method: 'POST',
    headers: requestHeaders(options.request),
    body: JSON.stringify({
      skillId: options.skillId,
      message: {
        role: 'user',
        content: { text: JSON.stringify(options.input) },
      },
    }),
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function getServiceTask(options: {
  tasksUrl: string;
  taskId: string;
  accessToken: string;
}): Promise<{
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  result?: unknown;
  error?: { message?: string };
}> {
  const response = await fetch(
    `${options.tasksUrl}/${encodeURIComponent(options.taskId)}`,
    { headers: { 'Task-Access-Token': options.accessToken } }
  );
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function cancelServiceTask(options: {
  tasksUrl: string;
  taskId: string;
  accessToken: string;
}): Promise<void> {
  const response = await fetch(
    `${options.tasksUrl}/${encodeURIComponent(options.taskId)}/cancel`,
    { method: 'POST', headers: { 'Task-Access-Token': options.accessToken } }
  );
  if (!response.ok) throw await responseError(response);
}
