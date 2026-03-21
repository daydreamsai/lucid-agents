import { createFileRoute } from '@tanstack/react-router';
import { useWalletClient } from 'wagmi';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getHealth,
  getManifest,
  invokeEntrypointWithBody,
  streamEntrypointWithBody,
  type AgentHealth,
  type AgentPayments,
} from '@/lib/api';
import { WalletSummary } from '@/components/wallet-summary';
import { getNetworkInfo } from '@/lib/network';
import { cn } from '@/lib/utils';
import { SchemaForm } from '@/components/schema-form';

type DashboardEntry = {
  key: string;
  description?: string | null;
  streaming: boolean;
  price?: string | { invoke?: string | null; stream?: string | null } | null;
  network?: string | null;
  inputSchema?: Record<string, any> | null;
  outputSchema?: Record<string, any> | null;
};

type DashboardData = {
  meta: {
    name: string;
    version: string;
    description?: string | null;
  } | null;
  payments: AgentPayments | null;
  entrypoints: DashboardEntry[];
};

function ensureSerializable<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj)) as T;
  } catch (error) {
    throw new Error(`Object contains non-serializable values: ${error}`);
  }
}

export const Route = createFileRoute('/')({
  loader: async () => {
    'use server';
    const { agent, runtime } = await import('@/lib/agent');

    // Get manifest to extract schemas
    const manifest = runtime.manifest.build('http://localhost');
    const manifestEntrypoints = manifest.entrypoints || {};

    const rawEntrypoints = agent.listEntrypoints();
    const entrypoints: DashboardEntry[] = rawEntrypoints.map(
      (entry: {
        key: string;
        description?: string;
        stream?: boolean;
        price?: any;
        network?: string;
      }) => {
        // Find corresponding manifest entry for schema info
        const manifestEntry = manifestEntrypoints[entry.key];

        return {
          key: String(entry.key),
          description: entry.description ? String(entry.description) : null,
          streaming: Boolean(entry.stream),
          price:
            typeof entry.price === 'string'
              ? String(entry.price)
              : entry.price
                ? {
                    invoke: entry.price.invoke
                      ? String(entry.price.invoke)
                      : null,
                    stream: entry.price.stream
                      ? String(entry.price.stream)
                      : null,
                  }
                : null,
          network: entry.network ? String(entry.network) : null,
          inputSchema: manifestEntry?.input_schema || null,
          outputSchema: manifestEntry?.output_schema || null,
        };
      }
    );

    const configPayments = runtime.payments?.config;
    const payments: AgentPayments | null =
      configPayments !== undefined
        ? {
            network: configPayments.network
              ? String(configPayments.network)
              : null,
            defaultPrice: configPayments.defaultPrice
              ? String(configPayments.defaultPrice)
              : null,
            payTo: configPayments.payTo ? String(configPayments.payTo) : null,
          }
        : null;

    const rawMeta = agent.config.meta;
    const meta = rawMeta
      ? {
          name: String(rawMeta.name || ''),
          version: String(rawMeta.version || ''),
          description: rawMeta.description ? String(rawMeta.description) : null,
        }
      : null;

    const result: DashboardData = { meta, payments, entrypoints };
    return ensureSerializable(result);
  },
  component: HomePage,
});

const DEFAULT_PAYLOAD = JSON.stringify({ input: {} }, null, 2);
const MANIFEST_PATH = '/.well-known/agent-card.json';

type HealthState = 'loading' | 'healthy' | 'error';
type ManifestState = 'idle' | 'loading' | 'loaded' | 'error';

const EntryPriceSchema = (price: DashboardEntry['price']) => {
  if (!price) return undefined;
  if (typeof price === 'string') return { invoke: price, stream: price };
  return {
    invoke: price.invoke ?? undefined,
    stream: price.stream ?? undefined,
  };
};

const derivePriceLabel = (
  entrypoint: DashboardEntry,
  payments?: AgentPayments | null
) => {
  const breakdown = EntryPriceSchema(entrypoint.price);
  const defaultPrice = payments?.defaultPrice ?? undefined;

  const invokePrice = breakdown?.invoke ?? defaultPrice;
  const streamPrice = entrypoint.streaming
    ? (breakdown?.stream ?? defaultPrice)
    : (breakdown?.stream ?? undefined);

  if (!invokePrice && !streamPrice) {
    return 'Free';
  }
  if (invokePrice && streamPrice && invokePrice !== streamPrice) {
    return `Invoke: ${invokePrice} · Stream: ${streamPrice}`;
  }
  if (invokePrice && !streamPrice) {
    return `Invoke: ${invokePrice}`;
  }
  if (streamPrice && !invokePrice) {
    return `Stream: ${streamPrice}`;
  }
  return `Invoke · Stream: ${invokePrice ?? streamPrice}`;
};

type EntrypointCard = {
  key: string;
  description: string;
  streaming: boolean;
  priceLabel: string;
  networkId?: string | null;
  invokePath: string;
  streamPath?: string;
  invokeCurl: string;
  streamCurl?: string;
  requiresPayment: boolean;
  inputSchema?: Record<string, any> | null;
  outputSchema?: Record<string, any> | null;
};

const indentPayload = (payload: string) =>
  payload
    .split('\n')
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join('\n');

const buildEntrypointCards = (
  origin: string,
  entrypoints: DashboardEntry[],
  payments?: AgentPayments | null
): EntrypointCard[] => {
  const payloadIndented = indentPayload(DEFAULT_PAYLOAD);

  return entrypoints?.map(entrypoint => {
    const streaming = Boolean(entrypoint.streaming);
    const invokePath = `/api/agent/entrypoints/${entrypoint.key}/invoke`;
    const streamPath = streaming
      ? `/api/agent/entrypoints/${entrypoint.key}/stream`
      : undefined;
    const priceLabel = derivePriceLabel(entrypoint, payments);
    const requiresPayment = priceLabel !== 'Free';

    const invokeCurl = [
      'curl -s -X POST \\',
      `  '${origin}${invokePath}' \\`,
      "  -H 'Content-Type: application/json' \\",
      "  -d '",
      payloadIndented,
      "  '",
    ].join('\n');

    const streamCurl = streamPath
      ? [
          'curl -sN -X POST \\',
          `  '${origin}${streamPath}' \\`,
          "  -H 'Content-Type: application/json' \\",
          "  -H 'Accept: text/event-stream' \\",
          "  -d '",
          payloadIndented,
          "  '",
        ].join('\n')
      : undefined;

    return {
      key: entrypoint.key,
      description: entrypoint.description ?? 'No description provided.',
      streaming,
      priceLabel,
      networkId: entrypoint.network ?? payments?.network ?? null,
      invokePath,
      streamPath,
      invokeCurl,
      streamCurl,
      requiresPayment,
      inputSchema: entrypoint.inputSchema,
      outputSchema: entrypoint.outputSchema,
    };
  });
};

const StatusChip = ({ state }: { state: HealthState }) => {
  const config = {
    healthy: {
      label: 'Healthy',
      icon: '✓',
      className: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
    },
    loading: {
      label: 'Checking',
      icon: '●',
      className:
        'border-amber-500/50 bg-amber-500/10 text-amber-400 animate-pulse',
    },
    error: {
      label: 'Error',
      icon: '✕',
      className: 'border-rose-500/50 bg-rose-500/10 text-rose-400',
    },
  };

  const { label, icon, className } = config[state];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-3 py-1 text-xs font-semibold uppercase tracking-wide font-mono',
        className
      )}
    >
      <span className="text-sm">{icon}</span>
      {label}
    </span>
  );
};

const formatResult = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (!value) return 'No response body';
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
};

function useCopyFeedback() {
  const [flag, setFlag] = useState(false);
  const copyValue = useCallback(async (value?: string) => {
    if (!value) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setFlag(true);
      setTimeout(() => setFlag(false), 2_000);
    } catch (error) {
      // Silently fail - user can manually copy if needed
    }
  }, []);

  return { copyValue, flag };
}

type InvocationState = {
  payload: string;
  error: string | null;
  result: unknown;
  paymentUsed: boolean;
  streamingEvents: string[];
  streamingError: string | null;
  streamingStatus: 'idle' | 'streaming' | 'error';
};

const defaultInvocationState = (): InvocationState => ({
  payload: DEFAULT_PAYLOAD,
  error: null,
  result: null,
  paymentUsed: false,
  streamingEvents: [],
  streamingError: null,
  streamingStatus: 'idle',
});

function HomePage() {
  const dashboard = Route.useLoaderData() as DashboardData;
  const entrypoints = dashboard.entrypoints;
  const payments = dashboard.payments;
  const meta = dashboard.meta;

  const { data: walletClient } = useWalletClient();

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost';

  const cards = useMemo(
    () => buildEntrypointCards(origin, entrypoints, payments),
    [origin, entrypoints, payments]
  );

  const entrypointCount = cards?.length ?? 0;
  const entrypointLabel = entrypointCount === 1 ? 'Entrypoint' : 'Entrypoints';

  const [healthState, setHealthState] = useState<HealthState>('loading');
  const [healthData, setHealthData] = useState<AgentHealth | null>(null);
  const [manifestState, setManifestState] = useState<ManifestState>('idle');
  const [manifestText, setManifestText] = useState<string>(
    'Manifest unavailable.'
  );

  const [invocationStates, setInvocationStates] = useState<
    Record<string, InvocationState>
  >({});
  const streamCancelRef = useRef<Record<string, () => void>>({});

  const getEntryState = useCallback(
    (key: string) => invocationStates[key] ?? defaultInvocationState(),
    [invocationStates]
  );

  const updateEntryState = useCallback(
    (
      key: string,
      updates:
        | Partial<InvocationState>
        | ((prev: InvocationState) => InvocationState)
    ) => {
      setInvocationStates(prev => {
        const base = prev[key] ?? defaultInvocationState();
        const next =
          typeof updates === 'function'
            ? updates(base)
            : { ...base, ...updates };
        return {
          ...prev,
          [key]: next,
        };
      });
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    const fetchHealth = async () => {
      try {
        const health = await getHealth();
        if (cancelled) return;
        setHealthData(health);
        const ok =
          health.ok === true ||
          (health.status && health.status.toLowerCase().includes('ok')) ||
          (health.status && health.status.toLowerCase().includes('healthy'));
        setHealthState(ok ? 'healthy' : 'error');
      } catch (error) {
        if (!cancelled) {
          setHealthState('error');
        }
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchManifest = async () => {
      setManifestState('loading');
      try {
        const manifest = await getManifest();
        if (cancelled) return;
        const text =
          manifest && typeof manifest === 'object'
            ? JSON.stringify(manifest, null, 2)
            : typeof manifest === 'string'
              ? manifest
              : 'Manifest unavailable.';
        setManifestText(text);
        setManifestState('loaded');
      } catch (error) {
        if (!cancelled) {
          setManifestText('Failed to load manifest.');
          setManifestState('error');
        }
      }
    };

    fetchManifest();

    return () => {
      cancelled = true;
    };
  }, []);

  const { copyValue: copyCurl, flag: curlCopied } = useCopyFeedback();
  const { copyValue: copyManifest, flag: manifestCopied } = useCopyFeedback();
  const { copyValue: copyAppKitSnippet, flag: appKitSnippetCopied } =
    useCopyFeedback();

  const handleInvoke = useCallback(
    async (entry: EntrypointCard, payloadInput: string) => {
      let parsedBody: unknown = {};

      try {
        parsedBody = payloadInput.trim() ? JSON.parse(payloadInput) : {};
        updateEntryState(entry.key, { error: null });
      } catch (error) {
        updateEntryState(entry.key, { error: 'Payload must be valid JSON' });
        return;
      }

      let signer: unknown = undefined;
      let paymentUsed = false;

      if (entry.requiresPayment) {
        try {
          getNetworkInfo(entry.networkId ?? payments?.network ?? undefined);

          if (walletClient) {
            signer = walletClient;
            paymentUsed = true;
          }
        } catch {
          // Payment signer unavailable - continue without payment
        }
      }

      try {
        const result = await invokeEntrypointWithBody({
          key: entry.key,
          body: parsedBody,
          signer,
        });
        updateEntryState(entry.key, {
          result,
          paymentUsed,
        });
      } catch (error) {
        updateEntryState(entry.key, {
          error: (error as Error).message,
          paymentUsed: false,
        });
      }
    },
    [payments?.network, updateEntryState, walletClient]
  );

  const handleStream = useCallback(
    async (entry: EntrypointCard, payloadInput: string) => {
      streamCancelRef.current[entry.key]?.();
      updateEntryState(entry.key, {
        streamingEvents: [],
        streamingError: null,
        streamingStatus: 'streaming',
      });

      let parsedBody: unknown = {};
      try {
        parsedBody = payloadInput.trim() ? JSON.parse(payloadInput) : {};
      } catch {
        updateEntryState(entry.key, {
          streamingStatus: 'error',
          streamingError: 'Payload must be valid JSON',
        });
        return;
      }

      let signer: unknown = undefined;
      if (entry.requiresPayment) {
        try {
          getNetworkInfo(entry.networkId ?? payments?.network ?? undefined);
          if (walletClient) {
            signer = walletClient;
            // Streaming does not mark payment used up-front; chunk handlers show success.
          }
        } catch {
          // Payment signer unavailable - continue without payment
        }
      }

      try {
        const { cancel } = await streamEntrypointWithBody({
          key: entry.key,
          body: parsedBody,
          signer,
          onChunk: chunk => {
            if (chunk && typeof chunk === 'object' && 'kind' in chunk) {
              if ((chunk as any).kind === 'text') {
                updateEntryState(entry.key, prev => ({
                  ...prev,
                  streamingEvents: [
                    ...prev.streamingEvents,
                    String((chunk as any).text ?? ''),
                  ],
                }));
              }
              if ((chunk as any).kind === 'run-end') {
                updateEntryState(entry.key, { streamingStatus: 'idle' });
              }
            }
          },
          onError: error => {
            updateEntryState(entry.key, {
              streamingStatus: 'error',
              streamingError: error.message,
            });
          },
          onDone: () => {
            updateEntryState(entry.key, {
              streamingStatus: 'idle',
            });
          },
        });

        streamCancelRef.current[entry.key] = cancel;
      } catch (error) {
        updateEntryState(entry.key, {
          streamingStatus: 'error',
          streamingError: (error as Error).message,
        });
      }
    },
    [payments?.network, updateEntryState, walletClient]
  );

  useEffect(() => {
    return () => {
      Object.values(streamCancelRef.current).forEach(cancel => cancel?.());
    };
  }, []);

  const networkInfo = getNetworkInfo(payments?.network ?? undefined);

  const appKitSnippet = [
    'import { useWalletClient } from "wagmi";',
    'import { wrapFetchWithPayment } from "x402-fetch";',
    '',
    'const { data: walletClient } = useWalletClient();',
    '',
    'if (walletClient) {',
    '  const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);',
    '  // await fetchWithPayment(...)',
    '}',
    '',
    '// Ensure WALLET_CONNECT_PROJECT_ID is configured to use WalletConnect.',
  ].join('\n');

  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-zinc-950 font-mono text-zinc-300">
      <div className="mx-auto max-w-[960px] w-full px-6 flex flex-col min-h-screen">

        {/* ── Header ── */}
        <header className="flex items-center justify-between py-8 border-b border-zinc-800">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-semibold tracking-[0.2em] uppercase text-zinc-100">
              {meta?.name ?? 'agent'}<span className="text-emerald-500">.</span>
            </h1>
            <span className="text-xs text-zinc-600">
              v{meta?.version ?? '0.0.0'}
            </span>
            <StatusChip state={healthState} />
          </div>
          <div className="flex items-center gap-6">
            <WalletSummary className="text-xs" />
          </div>
        </header>

        {/* ── Description ── */}
        {meta?.description && (
          <div className="py-6 border-b border-zinc-800">
            <p className="text-sm text-zinc-500 max-w-[480px] leading-relaxed">
              {meta.description}
            </p>
          </div>
        )}

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-4 border-b border-zinc-800">
          <div className="py-5 pr-4">
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 mb-1">entrypoints</div>
            <div className="text-sm font-medium text-zinc-100">{entrypointCount}</div>
          </div>
          <div className="py-5 px-4 border-l border-zinc-800">
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 mb-1">network</div>
            <div className="text-sm text-zinc-300">{networkInfo.label}</div>
          </div>
          <div className="py-5 px-4 border-l border-zinc-800">
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 mb-1">default price</div>
            <div className="text-sm font-medium text-emerald-500">{payments?.defaultPrice ?? 'Free'}</div>
          </div>
          <div className="py-5 pl-4 border-l border-zinc-800">
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 mb-1">pay to</div>
            <div className="text-xs text-emerald-500 truncate">{payments?.payTo ?? '--'}</div>
          </div>
        </div>

        {/* ── Entrypoints Table ── */}
        <section className="flex-1">
          <div className="grid grid-cols-[1fr_120px_100px] py-4 border-b border-zinc-800 text-[10px] uppercase tracking-[0.15em] text-zinc-600">
            <span>entrypoint</span>
            <span className="text-right">price</span>
            <span className="text-right">type</span>
          </div>

          {cards?.map((card, index) => {
            const state = getEntryState(card.key);
            const isExpanded = expandedEntry === card.key;

            return (
              <div key={card.key} className="border-b border-zinc-800">
                {/* ── Row ── */}
                <div
                  className="grid grid-cols-[1fr_120px_100px] items-center cursor-pointer transition-colors hover:bg-emerald-500/[0.04]"
                  onClick={() => setExpandedEntry(isExpanded ? null : card.key)}
                >
                  <div className="flex items-center gap-3 py-5">
                    <span className="text-[10px] text-zinc-600 w-5 flex-shrink-0">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-sm font-medium text-zinc-100">{card.key}</span>
                    <span className="text-[11px] text-zinc-600 hidden md:inline">{card.description}</span>
                  </div>
                  <div className="text-[13px] font-medium text-emerald-500 text-right tabular-nums">
                    {card.priceLabel}
                  </div>
                  <div className="text-right pr-1">
                    <span className={cn(
                      'text-[10px] uppercase tracking-wider font-semibold',
                      card.streaming ? 'text-emerald-500' : 'text-blue-400'
                    )}>
                      {card.streaming ? 'stream' : 'invoke'}
                    </span>
                  </div>
                </div>

                {/* ── Expanded Detail ── */}
                {isExpanded && (
                  <div className="border-t border-zinc-800/50 bg-zinc-900/30 px-8 py-6 space-y-5">

                    {/* Paths */}
                    <div className="space-y-2 text-xs">
                      <div className="flex gap-4">
                        <span className="text-zinc-600 w-20 flex-shrink-0">invoke</span>
                        <code className="text-zinc-400">{card.invokePath}</code>
                      </div>
                      {card.streamPath && (
                        <div className="flex gap-4">
                          <span className="text-zinc-600 w-20 flex-shrink-0">stream</span>
                          <code className="text-zinc-400">{card.streamPath}</code>
                        </div>
                      )}
                      <div className="flex gap-4">
                        <span className="text-zinc-600 w-20 flex-shrink-0">network</span>
                        <span className="text-zinc-400">
                          {getNetworkInfo(card.networkId ?? payments?.network ?? undefined).label}
                        </span>
                      </div>
                    </div>

                    {/* Schema Form */}
                    <SchemaForm
                      schema={card.inputSchema as any}
                      value={state.payload}
                      onChange={value =>
                        updateEntryState(card.key, { payload: value })
                      }
                    />

                    {/* Output Schema */}
                    {card.outputSchema && card.outputSchema.properties && (
                      <details className="group">
                        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition">
                          <span className="inline-block group-open:rotate-90 transition-transform mr-1">
                            &rarr;
                          </span>
                          output schema
                        </summary>
                        <div className="mt-2 border border-zinc-800 bg-black/30 p-3">
                          <dl className="space-y-1 text-xs">
                            {Object.entries(card.outputSchema.properties).map(
                              ([name, schema]: [string, any]) => (
                                <div key={name} className="flex gap-2">
                                  <dt className="font-medium text-zinc-300 min-w-[100px]">
                                    {name}:
                                  </dt>
                                  <dd className="text-zinc-500">
                                    {schema.type}
                                    {schema.description && ` -- ${schema.description}`}
                                  </dd>
                                </div>
                              )
                            )}
                          </dl>
                        </div>
                      </details>
                    )}

                    {/* Error */}
                    {state.error && (
                      <div className="border border-rose-500/40 bg-rose-500/5 p-3 text-sm text-rose-300">
                        {state.error}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() =>
                          handleInvoke(card, getEntryState(card.key).payload)
                        }
                        className="inline-flex items-center gap-2 border border-emerald-500 bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 transition hover:bg-emerald-500/20"
                      >
                        invoke
                      </button>
                      {card.streaming && (
                        <button
                          onClick={() =>
                            handleStream(card, getEntryState(card.key).payload)
                          }
                          disabled={state.streamingStatus === 'streaming'}
                          className="inline-flex items-center gap-2 border border-zinc-700 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {state.streamingStatus === 'streaming'
                            ? 'streaming...'
                            : 'stream'}
                        </button>
                      )}
                      {card.streaming &&
                        state.streamingStatus === 'streaming' && (
                          <button
                            onClick={() => {
                              streamCancelRef.current[card.key]?.();
                              updateEntryState(card.key, {
                                streamingStatus: 'idle',
                              });
                            }}
                            className="inline-flex items-center gap-2 border border-rose-500/50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-rose-400 transition hover:border-rose-500 hover:bg-rose-500/10"
                          >
                            stop
                          </button>
                        )}
                      <button
                        onClick={() => copyCurl(card.invokeCurl)}
                        className="ml-auto border border-zinc-800 px-3 py-2 text-[11px] text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300"
                      >
                        {curlCopied ? '✓ copied' : 'copy curl'}
                      </button>
                    </div>

                    {/* cURL preview */}
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400 transition">
                        <span className="inline-block group-open:rotate-90 transition-transform mr-1">
                          &rarr;
                        </span>
                        curl command
                      </summary>
                      <pre className="mt-2 border border-zinc-800 bg-black/40 p-3 text-[11px] text-zinc-400 overflow-x-auto whitespace-pre">
                        {card.invokeCurl}
                      </pre>
                      {card.streamCurl && (
                        <pre className="mt-1 border border-zinc-800 bg-black/40 p-3 text-[11px] text-zinc-400 overflow-x-auto whitespace-pre">
                          {card.streamCurl}
                        </pre>
                      )}
                    </details>

                    {/* Response */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-600">
                          response
                        </span>
                        {state.paymentUsed && (
                          <span className="border border-emerald-500/50 bg-emerald-500/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
                            paid
                          </span>
                        )}
                      </div>
                      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words border border-zinc-800 bg-black/40 p-3 font-mono text-xs leading-relaxed text-zinc-300">
                        {formatResult(state.result) || (
                          <span className="text-zinc-700">
                            -- invoke to see response --
                          </span>
                        )}
                      </pre>
                    </div>

                    {/* Stream Events */}
                    {card.streaming && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-600">
                            stream events
                          </span>
                          <span
                            className={cn(
                              'text-xs font-medium font-mono',
                              state.streamingStatus === 'streaming'
                                ? 'text-emerald-500'
                                : 'text-zinc-700'
                            )}
                          >
                            {state.streamingStatus === 'streaming'
                              ? '● live'
                              : '○ idle'}
                          </span>
                        </div>
                        <div className="max-h-32 overflow-y-auto border border-zinc-800 bg-black/40 p-3">
                          {state.streamingEvents.length === 0 ? (
                            <p className="text-xs text-zinc-700">
                              -- stream to see events --
                            </p>
                          ) : (
                            <ul className="space-y-1">
                              {state.streamingEvents.map((event, idx) => (
                                <li
                                  key={`${card.key}-event-${idx}`}
                                  className="border-l-2 border-emerald-500/30 pl-3 py-1 text-xs text-zinc-300"
                                >
                                  {event}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {state.streamingStatus === 'error' &&
                          state.streamingError && (
                            <div className="border border-rose-500/40 bg-rose-500/5 p-2 text-xs text-rose-300">
                              {state.streamingError}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* ── Manifest ── */}
        <section className="border-t border-zinc-800 py-6">
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between text-xs text-zinc-500 hover:text-zinc-300 transition">
              <div className="flex items-center gap-2">
                <span className="inline-block transition-transform group-open:rotate-90">
                  &rarr;
                </span>
                <span>manifest</span>
                <code className="text-emerald-500 text-[10px]">{MANIFEST_PATH}</code>
                {manifestState === 'loading' && (
                  <span className="text-zinc-600 animate-pulse">loading...</span>
                )}
              </div>
              <button
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  copyManifest(manifestText);
                }}
                className="border border-zinc-800 px-3 py-1 text-[11px] text-zinc-600 transition hover:border-zinc-600 hover:text-zinc-300"
              >
                {manifestCopied ? '✓ copied' : 'copy'}
              </button>
            </summary>
            <div className="mt-3">
              <pre className="max-h-[500px] overflow-auto border border-zinc-800 bg-black/40 p-4 font-mono text-xs leading-relaxed text-zinc-400">
                {manifestState === 'loading' ? (
                  <span className="text-zinc-600 animate-pulse">loading manifest...</span>
                ) : (
                  manifestText
                )}
              </pre>
            </div>
          </details>
        </section>

        {/* ── Code Examples ── */}
        <section className="border-t border-zinc-800 py-6">
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between text-xs text-zinc-500 hover:text-zinc-300 transition">
              <div className="flex items-center gap-2">
                <span className="inline-block transition-transform group-open:rotate-90">
                  &rarr;
                </span>
                <span>walletconnect integration</span>
                <span className="border border-blue-500/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-blue-400">appkit</span>
              </div>
              <button
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  copyAppKitSnippet(appKitSnippet);
                }}
                className="border border-zinc-800 px-3 py-1 text-[11px] text-zinc-600 transition hover:border-zinc-600 hover:text-zinc-300"
              >
                {appKitSnippetCopied ? '✓ copied' : 'copy'}
              </button>
            </summary>
            <div className="mt-3">
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap border border-zinc-800 bg-black/40 p-4 font-mono text-xs leading-relaxed text-zinc-400">
                {appKitSnippet}
              </pre>
            </div>
          </details>
        </section>

        {/* ── Footer ── */}
        <footer className="py-6 border-t border-zinc-800 flex justify-between items-center text-[11px] text-zinc-700">
          <span>{networkInfo.label}</span>
          <span>lucid-agents</span>
        </footer>

      </div>
    </div>
  );
}
