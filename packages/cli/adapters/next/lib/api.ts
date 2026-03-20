export type AgentEntrypoint = {
  key: string;
  description?: string | null;
  streaming: boolean;
  price?: string | { invoke?: string | null; stream?: string | null } | null;
  network?: string | null;
};

export type AgentPayments = {
  network?: string | null;
  defaultPrice?: string | null;
  payTo?: string | null;
};

export type AgentHealth = {
  ok?: boolean;
  status?: string;
  timestamp?: string;
};

export async function getEntrypoints() {
  const response = await fetch('/api/agent/entrypoints');
  if (!response.ok) {
    throw new Error('Unable to load entrypoints');
  }
  const payload = await response.json();
  if (Array.isArray(payload.entrypoints)) {
    return payload.entrypoints;
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  return [];
}

export async function getManifest() {
  const response = await fetch('/.well-known/agent-card.json');
  if (!response.ok) {
    throw new Error('Unable to load manifest');
  }
  return response.json();
}

let paymentModulePromise: Promise<typeof import('@x402/fetch') | null> | null =
  null;

let siwxModulePromise: Promise<
  typeof import('@lucid-agents/payments') | null
> | null = null;

type SIWxSignerOption = {
  signMessage: (message: string) => Promise<string>;
  getAddress: () => Promise<string>;
  getChainId: () => Promise<string>;
};

async function resolveFetcher(signer?: any, siwxSigner?: SIWxSignerOption) {
  let baseFetcher: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response> = fetch;

  // Wrap with SIWX first so it gets tried before payment
  if (siwxSigner) {
    if (!siwxModulePromise) {
      siwxModulePromise = import('@lucid-agents/payments')
        .then(mod => mod)
        .catch(error => {
          console.warn(
            '@lucid-agents/payments could not be loaded for SIWX, skipping',
            error
          );
          return null;
        });
    }
    const siwxMod = await siwxModulePromise;
    if (siwxMod) {
      baseFetcher = siwxMod.wrapFetchWithSIWx(baseFetcher, siwxSigner);
    }
  }

  if (!signer) return baseFetcher;

  if (!paymentModulePromise) {
    paymentModulePromise = import('@x402/fetch')
      .then(mod => mod)
      .catch(error => {
        console.warn(
          '@x402/fetch could not be loaded, falling back to plain fetch',
          error
        );
        return null;
      });
  }

  const mod = await paymentModulePromise;
  if (!mod) return baseFetcher;
  return mod.wrapFetchWithPayment(baseFetcher, signer);
}

export async function invokeEntrypoint({
  key,
  input,
  signer,
  siwxSigner,
}: {
  key: string;
  input: unknown;
  signer?: any;
  siwxSigner?: SIWxSignerOption;
}) {
  return invokeEntrypointWithBody({
    key,
    body: { input },
    signer,
    siwxSigner,
  });
}

type StreamCallbacks = {
  onChunk?: (chunk: unknown) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
};

export async function streamEntrypoint({
  key,
  input,
  signer,
  siwxSigner,
  ...callbacks
}: {
  key: string;
  input: unknown;
  signer?: any;
  siwxSigner?: SIWxSignerOption;
} & StreamCallbacks): Promise<{ cancel: () => void }> {
  return streamEntrypointWithBody({
    key,
    body: { input },
    signer,
    siwxSigner,
    ...callbacks,
  });
}

export async function invokeEntrypointWithBody({
  key,
  body,
  signer,
  siwxSigner,
}: {
  key: string;
  body: unknown;
  signer?: any;
  siwxSigner?: SIWxSignerOption;
}) {
  const fetcher = await resolveFetcher(signer, siwxSigner);

  const response = await fetcher(`/api/agent/entrypoints/${key}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? 'Entrypoint invocation failed');
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export async function streamEntrypointWithBody({
  key,
  body,
  signer,
  siwxSigner,
  ...callbacks
}: {
  key: string;
  body: unknown;
  signer?: any;
  siwxSigner?: SIWxSignerOption;
} & StreamCallbacks): Promise<{ cancel: () => void }> {
  const fetcher = await resolveFetcher(signer, siwxSigner);

  const controller = new AbortController();

  const response = await fetcher(`/api/agent/entrypoints/${key}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: controller.signal,
  });

  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? 'Entrypoint stream failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let closed = false;

  const finish = () => {
    if (closed) return;
    closed = true;
    callbacks.onDone?.();
  };

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n');
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const payload = part.slice(6);
          if (payload === '[DONE]') {
            finish();
            return;
          }
          try {
            const parsed = JSON.parse(payload);
            callbacks.onChunk?.(parsed);
          } catch (error) {
            console.warn('Failed to parse stream chunk', error);
          }
        }
      }
      finish();
    } catch (error) {
      if (!controller.signal.aborted) {
        callbacks.onError?.(error as Error);
      }
      finish();
    }
  })();

  return {
    cancel: () => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
      finish();
    },
  };
}

export async function getHealth(): Promise<AgentHealth> {
  const response = await fetch('/api/agent/health', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load agent health');
  }
  return response.json();
}
