import { createFileRoute } from "@tanstack/react-router";
import { useWalletClient } from "wagmi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getHealth,
  getManifest,
  invokeEntrypointWithBody,
  streamEntrypointWithBody,
  type AgentHealth,
  type AgentPayments,
} from "@/lib/api";
import { WalletSummary } from "@/components/wallet-summary";
import { getNetworkInfo } from "@/lib/network";
import { cn } from "@/lib/utils";
import { SchemaForm } from "@/components/schema-form";

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

export const Route = createFileRoute("/")({
  loader: async () => {
    "use server";
    const agentModule = await import("@/agent");
    const { agent } = agentModule;

    // Get manifest to extract schemas
    const manifest = agent.resolveManifest("http://localhost", "/api/agent");
    const manifestEntrypoints = manifest.entrypoints || [];

    const rawEntrypoints = agent.listEntrypoints();
    const entrypoints: DashboardEntry[] = rawEntrypoints.map((entry) => {
      // Find corresponding manifest entry for schema info
      const manifestEntry = manifestEntrypoints.find(
        (e: any) => e.key === entry.key
      );

      return {
        key: String(entry.key),
        description: entry.description ? String(entry.description) : null,
        streaming: Boolean(entry.stream),
        price:
          typeof entry.price === "string"
            ? String(entry.price)
            : entry.price
            ? {
                invoke: entry.price.invoke ? String(entry.price.invoke) : null,
                stream: entry.price.stream ? String(entry.price.stream) : null,
              }
            : null,
        network: entry.network ? String(entry.network) : null,
        inputSchema: manifestEntry?.input || null,
        outputSchema: manifestEntry?.output || null,
      };
    });

    const configPayments = agent.config.payments;
    const payments: AgentPayments | null =
      configPayments !== false && configPayments !== undefined
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
          name: String(rawMeta.name || ""),
          version: String(rawMeta.version || ""),
          description: rawMeta.description ? String(rawMeta.description) : null,
        }
      : null;

    const result: DashboardData = { meta, payments, entrypoints };
    return ensureSerializable(result);
  },
  component: HomePage,
});

const DEFAULT_PAYLOAD = JSON.stringify({ input: {} }, null, 2);
const MANIFEST_PATH = "/.well-known/agent-card.json";

type HealthState = "loading" | "healthy" | "error";
type ManifestState = "idle" | "loading" | "loaded" | "error";

const EntryPriceSchema = (price: DashboardEntry["price"]) => {
  if (!price) return undefined;
  if (typeof price === "string") return { invoke: price, stream: price };
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
    ? breakdown?.stream ?? defaultPrice
    : breakdown?.stream ?? undefined;

  if (!invokePrice && !streamPrice) {
    return "Free";
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
    .split("\n")
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n");

const buildEntrypointCards = (
  origin: string,
  entrypoints: DashboardEntry[],
  payments?: AgentPayments | null
): EntrypointCard[] => {
  const payloadIndented = indentPayload(DEFAULT_PAYLOAD);

  return entrypoints?.map((entrypoint) => {
    const streaming = Boolean(entrypoint.streaming);
    const invokePath = `/api/agent/entrypoints/${entrypoint.key}/invoke`;
    const streamPath = streaming
      ? `/api/agent/entrypoints/${entrypoint.key}/stream`
      : undefined;
    const priceLabel = derivePriceLabel(entrypoint, payments);
    const requiresPayment = priceLabel !== "Free";

    const invokeCurl = [
      "curl -s -X POST \\",
      `  '${origin}${invokePath}' \\`,
      "  -H 'Content-Type: application/json' \\",
      "  -d '",
      payloadIndented,
      "  '",
    ].join("\n");

    const streamCurl = streamPath
      ? [
          "curl -sN -X POST \\",
          `  '${origin}${streamPath}' \\`,
          "  -H 'Content-Type: application/json' \\",
          "  -H 'Accept: text/event-stream' \\",
          "  -d '",
          payloadIndented,
          "  '",
        ].join("\n")
      : undefined;

    return {
      key: entrypoint.key,
      description: entrypoint.description ?? "No description provided.",
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
      label: "Healthy",
      icon: "✓",
      className: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
    },
    loading: {
      label: "Checking",
      icon: "●",
      className:
        "border-amber-500/50 bg-amber-500/10 text-amber-400 animate-pulse",
    },
    error: {
      label: "Error",
      icon: "✕",
      className: "border-rose-500/50 bg-rose-500/10 text-rose-400",
    },
  };

  const { label, icon, className } = config[state];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        className
      )}
    >
      <span className="text-sm">{icon}</span>
      {label}
    </span>
  );
};

const formatResult = (value: unknown) => {
  if (typeof value === "string") return value;
  if (!value) return "No response body";
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
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "readonly");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
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
  streamingStatus: "idle" | "streaming" | "error";
};

const defaultInvocationState = (): InvocationState => ({
  payload: DEFAULT_PAYLOAD,
  error: null,
  result: null,
  paymentUsed: false,
  streamingEvents: [],
  streamingError: null,
  streamingStatus: "idle",
});

function HomePage() {
  const dashboard = Route.useLoaderData() as DashboardData;
  const entrypoints = dashboard.entrypoints;
  const payments = dashboard.payments;
  const meta = dashboard.meta;

  const { data: walletClient } = useWalletClient();

  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";

  const cards = useMemo(
    () => buildEntrypointCards(origin, entrypoints, payments),
    [origin, entrypoints, payments]
  );

  const entrypointCount = cards?.length ?? 0;
  const entrypointLabel = entrypointCount === 1 ? "Entrypoint" : "Entrypoints";

  const [healthState, setHealthState] = useState<HealthState>("loading");
  const [healthData, setHealthData] = useState<AgentHealth | null>(null);
  const [manifestState, setManifestState] = useState<ManifestState>("idle");
  const [manifestText, setManifestText] = useState<string>(
    "Manifest unavailable."
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
      setInvocationStates((prev) => {
        const base = prev[key] ?? defaultInvocationState();
        const next =
          typeof updates === "function"
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
          (health.status && health.status.toLowerCase().includes("ok")) ||
          (health.status && health.status.toLowerCase().includes("healthy"));
        setHealthState(ok ? "healthy" : "error");
      } catch (error) {
        if (!cancelled) {
          setHealthState("error");
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
      setManifestState("loading");
      try {
        const manifest = await getManifest();
        if (cancelled) return;
        const text =
          manifest && typeof manifest === "object"
            ? JSON.stringify(manifest, null, 2)
            : typeof manifest === "string"
            ? manifest
            : "Manifest unavailable.";
        setManifestText(text);
        setManifestState("loaded");
      } catch (error) {
        if (!cancelled) {
          setManifestText("Failed to load manifest.");
          setManifestState("error");
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
        updateEntryState(entry.key, { error: "Payload must be valid JSON" });
        return;
      }

      let signer: unknown = undefined;
      let paymentUsed = false;

      if (entry.requiresPayment) {
        try {
          const network = getNetworkInfo(
            entry.networkId ?? payments?.network ?? undefined
          );

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
        streamingStatus: "streaming",
      });

      let parsedBody: unknown = {};
      try {
        parsedBody = payloadInput.trim() ? JSON.parse(payloadInput) : {};
      } catch {
        updateEntryState(entry.key, {
          streamingStatus: "error",
          streamingError: "Payload must be valid JSON",
        });
        return;
      }

      let signer: unknown = undefined;
      if (entry.requiresPayment) {
        try {
          const network = getNetworkInfo(
            entry.networkId ?? payments?.network ?? undefined
          );
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
          onChunk: (chunk) => {
            if (chunk && typeof chunk === "object" && "kind" in chunk) {
              if ((chunk as any).kind === "text") {
                updateEntryState(entry.key, (prev) => ({
                  ...prev,
                  streamingEvents: [
                    ...prev.streamingEvents,
                    String((chunk as any).text ?? ""),
                  ],
                }));
              }
              if ((chunk as any).kind === "run-end") {
                updateEntryState(entry.key, { streamingStatus: "idle" });
              }
            }
          },
          onError: (error) => {
            updateEntryState(entry.key, {
              streamingStatus: "error",
              streamingError: error.message,
            });
          },
          onDone: () => {
            updateEntryState(entry.key, {
              streamingStatus: "idle",
            });
          },
        });

        streamCancelRef.current[entry.key] = cancel;
      } catch (error) {
        updateEntryState(entry.key, {
          streamingStatus: "error",
          streamingError: (error as Error).message,
        });
      }
    },
    [payments?.network, updateEntryState, walletClient]
  );

  useEffect(() => {
    return () => {
      Object.values(streamCancelRef.current).forEach((cancel) => cancel?.());
    };
  }, []);

  const exampleCard = cards?.[0];
  const exampleInvokeUrl = exampleCard
    ? `${origin}${exampleCard.invokePath}`
    : `${origin}/api/agent/entrypoints/{key}/invoke`;
  const networkInfo = getNetworkInfo(payments?.network ?? undefined);

  const appKitSnippet = [
    'import { useWalletClient } from "wagmi";',
    'import { wrapFetchWithPayment } from "x402-fetch";',
    "",
    "const { data: walletClient } = useWalletClient();",
    "",
    "if (walletClient) {",
    "  const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);",
    "  // await fetchWithPayment(...)",
    "}",
    "",
    "// Ensure WALLET_CONNECT_PROJECT_ID is configured to use WalletConnect.",
  ].join("\n");

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-12">
        <section className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/20">
                <span className="text-2xl">🤖</span>
              </div>
              <div>
                <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
                  {meta?.name ?? "Lucid Agent"}
                </h1>
                <p className="text-sm text-zinc-500">
                  v{meta?.version ?? "0.0.0"}
                </p>
              </div>
            </div>
            <p className="max-w-2xl text-base text-zinc-400 leading-relaxed">
              {meta?.description ??
                "Monitor agent health, review entrypoints, and interact with invoke and streaming flows."}
            </p>
          </div>
          <WalletSummary className="max-w-xl" />
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="group rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 p-6 backdrop-blur-sm transition hover:border-zinc-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
                  <span className="text-lg">💚</span>
                </div>
                <h2 className="text-base font-semibold text-zinc-100">
                  Health
                </h2>
              </div>
              <StatusChip state={healthState} />
            </div>
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <dt className="text-zinc-400">Status</dt>
                <dd className="font-medium text-zinc-100">
                  {healthData?.status ??
                    (healthState === "healthy" ? "ok" : "unknown")}
                </dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-zinc-400">Last Checked</dt>
                <dd className="text-zinc-300">
                  {healthData?.timestamp ?? "Just now"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="group rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 p-6 backdrop-blur-sm transition hover:border-zinc-700">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
                <span className="text-lg">📊</span>
              </div>
              <h2 className="text-base font-semibold text-zinc-100">
                Configuration
              </h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <dt className="text-zinc-400">Entrypoints</dt>
                <dd className="font-medium text-zinc-100">{entrypointCount}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-zinc-400">Network</dt>
                <dd className="text-zinc-300">{networkInfo.label}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-zinc-400">Default Price</dt>
                <dd className="font-medium text-emerald-400">
                  {payments?.defaultPrice ?? "Free"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="group rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 p-6 backdrop-blur-sm transition hover:border-zinc-700">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
                <span className="text-lg">💰</span>
              </div>
              <h2 className="text-base font-semibold text-zinc-100">Payment</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex flex-col gap-1">
                <dt className="text-zinc-400">Recipient</dt>
                <dd className="truncate font-mono text-xs text-emerald-400 bg-zinc-800/50 px-2 py-1 rounded">
                  {payments?.payTo ?? "—"}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="space-y-6">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800">
                <span className="text-sm">⚡</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">
                  {entrypointCount} {entrypointLabel}
                </h2>
                <p className="text-sm text-zinc-500">
                  Configure payloads and test your agent endpoints
                </p>
              </div>
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-2">
            {cards?.map((card) => {
              const state = getEntryState(card.key);
              return (
                <article
                  key={card.key}
                  className="group flex flex-col gap-6 rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 p-6 shadow-xl shadow-black/20 backdrop-blur-sm transition hover:border-zinc-700 hover:shadow-2xl hover:shadow-black/30"
                >
                  <header className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-xl font-bold text-zinc-50 truncate">
                          {card.key}
                        </h3>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            card.streaming
                              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                              : "border-blue-500/50 bg-blue-500/10 text-blue-400"
                          )}
                        >
                          {card.streaming ? "Stream" : "Invoke"}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        {card.description}
                      </p>
                    </div>
                  </header>

                  <div className="grid gap-3 rounded-lg border border-zinc-800/50 bg-zinc-950/50 p-4 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Pricing</span>
                      <span className="font-medium text-emerald-400">
                        {card.priceLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Network</span>
                      <span className="text-zinc-300">
                        {
                          getNetworkInfo(
                            card.networkId ?? payments?.network ?? undefined
                          ).label
                        }
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-zinc-500">Invoke Path</span>
                      <code className="text-[10px] text-zinc-400 bg-zinc-900/50 px-2 py-1 rounded">
                        {card.invokePath}
                      </code>
                    </div>
                    {card.streamPath && (
                      <div className="flex flex-col gap-1">
                        <span className="text-zinc-500">Stream Path</span>
                        <code className="text-[10px] text-zinc-400 bg-zinc-900/50 px-2 py-1 rounded">
                          {card.streamPath}
                        </code>
                      </div>
                    )}
                  </div>

                  <SchemaForm
                    schema={card.inputSchema}
                    value={state.payload}
                    onChange={(value) =>
                      updateEntryState(card.key, { payload: value })
                    }
                  />

                  {card.outputSchema && card.outputSchema.properties && (
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 transition">
                        <span className="inline-block group-open:rotate-90 transition-transform mr-1">
                          ▶
                        </span>
                        Expected Output Schema
                      </summary>
                      <div className="mt-2 rounded-lg border border-zinc-800 bg-black/30 p-3">
                        <dl className="space-y-2 text-xs">
                          {Object.entries(card.outputSchema.properties).map(
                            ([name, schema]: [string, any]) => (
                              <div key={name} className="flex gap-2">
                                <dt className="font-medium text-zinc-300 min-w-[100px]">
                                  {name}:
                                </dt>
                                <dd className="text-zinc-400">
                                  {schema.type}
                                  {schema.description &&
                                    ` - ${schema.description}`}
                                </dd>
                              </div>
                            )
                          )}
                        </dl>
                      </div>
                    </details>
                  )}

                  {state.error && (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
                      <span className="text-rose-400">⚠</span>
                      <p className="flex-1 text-sm text-rose-300">
                        {state.error}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() =>
                        handleInvoke(card, getEntryState(card.key).payload)
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-emerald-700 hover:shadow-xl hover:shadow-emerald-500/30 active:scale-95"
                    >
                      <span>▶</span>
                      Invoke
                    </button>
                    {card.streaming && (
                      <button
                        onClick={() =>
                          handleStream(card, getEntryState(card.key).payload)
                        }
                        disabled={state.streamingStatus === "streaming"}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-emerald-500/50 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-400 transition hover:border-emerald-500 hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span>⚡</span>
                        {state.streamingStatus === "streaming"
                          ? "Streaming..."
                          : "Start Stream"}
                      </button>
                    )}
                    {card.streaming &&
                      state.streamingStatus === "streaming" && (
                        <button
                          onClick={() => {
                            streamCancelRef.current[card.key]?.();
                            updateEntryState(card.key, {
                              streamingStatus: "idle",
                            });
                          }}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-500/50 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-400 transition hover:border-rose-500 hover:bg-rose-500/20 active:scale-95"
                        >
                          <span>⬛</span>
                          Stop
                        </button>
                      )}
                    <button
                      onClick={() => copyCurl(card.invokeCurl)}
                      className="ml-auto inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
                    >
                      {curlCopied ? "✓ Copied!" : "📋 Copy cURL"}
                    </button>
                  </div>

                  <section className="space-y-4 rounded-xl border border-zinc-800/50 bg-zinc-950/50 p-4">
                    <header className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                          Response
                        </span>
                        {Boolean(state.result) && (
                          <span className="flex h-2 w-2 items-center justify-center">
                            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                          </span>
                        )}
                      </div>
                      {state.paymentUsed && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                          <span>💰</span>
                          Paid
                        </span>
                      )}
                    </header>
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-3 font-mono text-xs leading-relaxed text-zinc-300">
                      {formatResult(state.result) || (
                        <span className="text-zinc-600">
                          Click "Invoke" to see the response here...
                        </span>
                      )}
                    </pre>

                    {card.streaming && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                              Stream Events
                            </span>
                            {state.streamingStatus === "streaming" && (
                              <span className="flex h-2 w-2 items-center justify-center">
                                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                              </span>
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-xs font-medium",
                              state.streamingStatus === "streaming"
                                ? "text-emerald-400"
                                : "text-zinc-500"
                            )}
                          >
                            {state.streamingStatus === "streaming"
                              ? "● Live"
                              : "○ Idle"}
                          </span>
                        </div>
                        <div className="max-h-32 overflow-y-auto rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-3">
                          {state.streamingEvents.length === 0 ? (
                            <p className="text-xs text-zinc-600">
                              Click "Start Stream" to see live events here...
                            </p>
                          ) : (
                            <ul className="space-y-2">
                              {state.streamingEvents.map((event, index) => (
                                <li
                                  key={`${card.key}-event-${index}`}
                                  className="animate-fadeIn rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-zinc-200"
                                >
                                  {event}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {state.streamingStatus === "error" &&
                          state.streamingError && (
                            <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2">
                              <span className="text-rose-400">⚠</span>
                              <p className="flex-1 text-xs text-rose-300">
                                {state.streamingError}
                              </p>
                            </div>
                          )}
                      </div>
                    )}
                  </section>
                </article>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800">
              <span className="text-sm">📄</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">
                Agent Manifest
              </h2>
              <p className="text-sm text-zinc-500">
                Complete agent specification served from{" "}
                <code className="text-xs text-emerald-400">
                  {MANIFEST_PATH}
                </code>
              </p>
            </div>
          </div>

          <details className="group rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 backdrop-blur-sm transition hover:border-zinc-700">
            <summary className="flex cursor-pointer items-center justify-between p-6 text-sm font-medium text-zinc-300 hover:text-zinc-100">
              <div className="flex items-center gap-2">
                <span className="inline-block transition-transform group-open:rotate-90">
                  ▶
                </span>
                <span>View Full Manifest JSON</span>
                {manifestState === "loading" && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                )}
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  copyManifest(manifestText);
                }}
                className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
              >
                {manifestCopied ? "✓ Copied!" : "Copy JSON"}
              </button>
            </summary>
            <div className="border-t border-zinc-800/50 p-6">
              <pre className="max-h-[500px] overflow-auto rounded-lg border border-zinc-800/50 bg-zinc-950/80 p-4 font-mono text-xs leading-relaxed text-zinc-300 shadow-inner">
                {manifestState === "loading" ? (
                  <div className="flex items-center gap-2 text-zinc-500">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                    Loading manifest…
                  </div>
                ) : (
                  manifestText
                )}
              </pre>
            </div>
          </details>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800">
              <span className="text-sm">💻</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">
                Code Examples
              </h2>
              <p className="text-sm text-zinc-500">
                Integration snippets for your applications
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <article className="group rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 p-6 backdrop-blur-sm transition hover:border-zinc-700">
              <header className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-100">
                    WalletConnect
                  </span>
                  <span className="rounded-full border border-blue-500/50 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                    AppKit
                  </span>
                </div>
                <button
                  onClick={() => copyAppKitSnippet(appKitSnippet)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  {appKitSnippetCopied ? "✓ Copied!" : "Copy"}
                </button>
              </header>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-800/50 bg-zinc-950/80 p-4 font-mono text-xs leading-relaxed text-zinc-300 shadow-inner">
                {appKitSnippet}
              </pre>
            </article>
          </div>
        </section>

        <footer className="mt-12 border-t border-zinc-800/50 pt-8 pb-4">
          <div className="flex items-center justify-between text-xs text-zinc-600">
            <p>Powered by Lucid Agents Framework</p>
            <p>Built with TanStack Start</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
