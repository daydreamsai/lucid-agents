import { HealthCard } from '@/components/health-card';
import { ManifestViewer } from '@/components/manifest-viewer';
import { SnippetCard } from '@/components/snippet-card';
import {
  EntrypointCard,
  type EntrypointCardData,
} from '@/components/entrypoint-card';
import { WalletSummary } from '@/components/wallet-summary';
import type { DashboardData } from '@/lib/dashboard-types';
import type { AgentPayments } from '@/lib/api';
import type { AgentHealth } from '@/lib/api';
import { getNetworkInfo } from '@/lib/network';

const DEFAULT_PAYLOAD = JSON.stringify({ input: {} }, null, 2);
const MANIFEST_PATH = '/.well-known/agent-card.json';

const indentPayload = (payload: string) =>
  payload
    .split('\n')
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join('\n');

const derivePriceLabel = (
  entrypoint: DashboardData['entrypoints'][number],
  payments?: AgentPayments | null
) => {
  const price = entrypoint.price;
  const defaultPrice = payments?.defaultPrice ?? undefined;

  const normalize = (value?: string | null) =>
    typeof value === 'string' && value.length > 0 ? value : undefined;

  const invokePrice =
    typeof price === 'string'
      ? price
      : (normalize(price?.invoke) ?? defaultPrice);

  const streamPrice = entrypoint.streaming
    ? typeof price === 'string'
      ? price
      : (normalize(price?.stream) ?? defaultPrice)
    : undefined;

  if (!invokePrice && !streamPrice) return 'Free';
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

const buildEntrypointCards = (
  origin: string,
  entrypoints: DashboardData['entrypoints'],
  payments?: AgentPayments | null
): EntrypointCardData[] => {
  const payloadIndented = indentPayload(DEFAULT_PAYLOAD);

  return entrypoints.map(entrypoint => {
    const invokePath = `/api/agent/entrypoints/${entrypoint.key}/invoke`;
    const streamPath = entrypoint.streaming
      ? `/api/agent/entrypoints/${entrypoint.key}/stream`
      : undefined;
    const streaming = Boolean(entrypoint.streaming);
    const priceLabel = derivePriceLabel(entrypoint, payments);
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
      key: String(entrypoint.key),
      description: entrypoint.description ?? 'No description provided.',
      streaming,
      priceLabel,
      networkId: entrypoint.network ?? payments?.network ?? null,
      invokePath,
      streamPath,
      invokeCurl,
      streamCurl,
      requiresPayment: priceLabel !== 'Free',
      inputSchema: entrypoint.inputSchema,
      outputSchema: entrypoint.outputSchema,
      defaultPayload: DEFAULT_PAYLOAD,
    };
  });
};

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

export default function Dashboard({
  initialData,
  origin,
  manifestText,
  initialHealth,
}: {
  initialData: DashboardData;
  origin: string;
  manifestText: string;
  initialHealth: AgentHealth | null;
}) {
  const cards = buildEntrypointCards(
    origin,
    initialData.entrypoints,
    initialData.payments ?? undefined
  );
  const entrypointCount = cards.length;
  const entrypointLabel = entrypointCount === 1 ? 'Entrypoint' : 'Entrypoints';
  const networkInfo = getNetworkInfo(
    initialData.payments?.network ?? undefined
  );

  return (
    <div className="min-h-screen bg-zinc-950 font-mono text-zinc-200 antialiased">
      <div className="mx-auto max-w-[960px] w-full px-6 flex flex-col min-h-screen">

        {/* ── Header ── */}
        <header className="flex items-center justify-between py-8 border-b border-zinc-900">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-[0.2em] uppercase text-zinc-200">
              {initialData.meta?.name ?? 'Lucid Agent'}
            </span>
            <span className="text-emerald-500">.</span>
            <span className="text-xs text-zinc-600">
              v{initialData.meta?.version ?? '0.0.0'}
            </span>
          </div>
          <div className="flex items-center gap-6">
            <HealthCard
              className="!rounded-none !border-0 !bg-transparent !p-0 !shadow-none !backdrop-blur-none"
              initialHealth={initialHealth}
            />
            <WalletSummary className="!rounded-none !border-0 !bg-transparent !p-0 max-w-none" />
          </div>
        </header>

        {/* ── Hero ── */}
        <section className="py-16 border-b border-zinc-900">
          <h1 className="font-sans text-4xl sm:text-5xl font-bold tracking-tight leading-tight text-zinc-100 mb-4">
            {initialData.meta?.description ?? 'Agent commerce infrastructure'}
          </h1>
          <p className="text-sm text-zinc-500 max-w-lg leading-relaxed">
            {entrypointCount} {entrypointLabel.toLowerCase()} available.{' '}
            {initialData.payments?.defaultPrice
              ? `Default price: ${initialData.payments.defaultPrice}.`
              : 'Free tier.'}{' '}
            Network: {networkInfo.label}.
          </p>
          {initialData.payments?.payTo && (
            <div
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-900 text-xs text-zinc-500 cursor-pointer transition-colors hover:border-zinc-800 hover:text-zinc-300"
              title="Payment recipient"
            >
              <span className="text-zinc-600">payTo</span>
              <span className="font-mono text-emerald-500 truncate max-w-[320px]">
                {initialData.payments.payTo}
              </span>
            </div>
          )}
        </section>

        {/* ── Entrypoints Table ── */}
        <section className="flex-1">
          <div className="grid grid-cols-[1fr_120px_100px] py-4 border-b border-zinc-900 text-[10px] uppercase tracking-[0.15em] text-zinc-600">
            <span>entrypoint</span>
            <span className="text-right">price</span>
            <span className="text-right">type</span>
          </div>

          {cards.map((card, index) => (
            <details key={card.key} className="group border-b border-zinc-900">
              <summary className="grid grid-cols-[1fr_120px_100px] items-center cursor-pointer transition-colors hover:bg-emerald-500/[0.04] hover:border-zinc-800">
                <div className="flex items-center gap-3 py-5">
                  <span className="text-[10px] text-zinc-700 w-5 shrink-0 tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm font-medium text-zinc-200">
                    {card.key}
                  </span>
                  <span className="text-[11px] text-zinc-600 hidden md:inline">
                    {card.description}
                  </span>
                </div>
                <div className="text-[13px] font-medium text-right text-emerald-500 tabular-nums">
                  {card.priceLabel}
                </div>
                <div className="text-right pr-1 flex items-center justify-end gap-2">
                  {card.streaming && (
                    <span className="text-[10px] uppercase tracking-wider text-zinc-600 border border-zinc-800 px-1.5 py-0.5">
                      stream
                    </span>
                  )}
                  <span className="text-sm text-zinc-700 transition-colors group-hover:text-emerald-500 inline-block transition-transform group-hover:translate-x-0.5">
                    &rarr;
                  </span>
                </div>
              </summary>

              {/* ── Expanded entrypoint card ── */}
              <div className="border-t border-zinc-900 bg-zinc-950 p-0">
                <EntrypointCard
                  card={card}
                  payments={initialData.payments ?? undefined}
                />
              </div>
            </details>
          ))}
        </section>

        {/* ── Manifest ── */}
        <div className="py-12 border-t border-zinc-900">
          <ManifestViewer
            initialManifest={manifestText}
            manifestPath={MANIFEST_PATH}
          />
        </div>

        {/* ── Code Examples ── */}
        <section className="py-12 border-t border-zinc-900">
          <div className="mb-5 text-[10px] uppercase tracking-[0.15em] text-zinc-600">
            integration
          </div>
          <div className="grid gap-px bg-zinc-900 border border-zinc-900">
            <div className="bg-zinc-950">
              <SnippetCard
                snippet={appKitSnippet}
                title="WalletConnect"
                badge="AppKit"
              />
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="py-6 border-t border-zinc-900 flex justify-between items-center text-[11px] text-zinc-700">
          <span>
            Powered by Lucid Agents Framework
          </span>
          <span>
            {networkInfo.label}
          </span>
        </footer>
      </div>
    </div>
  );
}
