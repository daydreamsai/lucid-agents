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
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-12">
        <section className="flex flex-col gap-8 rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-8 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/20">
                  <span className="text-2xl">🤖</span>
                </div>
                <div>
                  <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
                    {initialData.meta?.name ?? 'Lucid Agent'}
                  </h1>
                  <p className="text-sm text-zinc-500">
                    v{initialData.meta?.version ?? '0.0.0'}
                  </p>
                </div>
              </div>
              <p className="max-w-2xl text-base text-zinc-400 leading-relaxed">
                {initialData.meta?.description ??
                  'Monitor agent health, review entrypoints, and interact with invoke and streaming flows.'}
              </p>
            </div>
            <WalletSummary className="max-w-xl" />
          </div>
          <HealthCard
            className="w-full max-w-md"
            initialHealth={initialHealth}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
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
                  {initialData.payments?.defaultPrice ?? 'Free'}
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
                  {initialData.payments?.payTo ?? '—'}
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
            {cards.map(card => (
              <EntrypointCard
                key={card.key}
                card={card}
                payments={initialData.payments ?? undefined}
              />
            ))}
          </div>
        </section>

        <ManifestViewer
          initialManifest={manifestText}
          manifestPath={MANIFEST_PATH}
        />

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
            <SnippetCard
              snippet={appKitSnippet}
              title="WalletConnect"
              badge="AppKit"
            />
          </div>
        </section>

        <footer className="mt-12 border-t border-zinc-800/50 pt-8 pb-4">
          <div className="flex items-center justify-between text-xs text-zinc-600">
            <p>Powered by Lucid Agents Framework</p>
            <p>Built with Next.js</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
