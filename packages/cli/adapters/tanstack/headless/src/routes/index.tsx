import { createFileRoute } from '@tanstack/react-router';

import { getNetworkInfo } from '@/lib/network';

export const Route = createFileRoute('/')({
  loader: async () => {
    'use server';
    const { agent, runtime } = await import('@/lib/agent');
    const manifest = runtime.manifest.build('http://localhost');
    const manifestEntrypoints = manifest.entrypoints || {};
    const entrypoints = agent
      .listEntrypoints()
      .map(
        (entry: {
          key: string;
          description?: string;
          stream?: boolean;
          price?: any;
        }) => {
          const manifestEntry = manifestEntrypoints[entry.key];
          return {
            key: String(entry.key),
            description: entry.description ? String(entry.description) : null,
            streaming: Boolean(entry.stream),
            price: entry.price ?? manifestEntry?.pricing?.invoke ?? null,
          };
        }
      );

    return {
      meta: {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? null,
      },
      entrypoints,
    };
  },
  component: HeadlessDashboard,
});

function HeadlessDashboard() {
  const loaderData = Route.useLoaderData();
  const network = getNetworkInfo();

  const agentName = loaderData.meta?.name ?? 'Agent';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] font-mono antialiased flex flex-col">
      <div className="max-w-[960px] w-full mx-auto px-6 flex-1 flex flex-col">

        {/* Header */}
        <header className="flex items-center justify-between py-8 border-b border-[#1a1a1a]">
          <div className="text-sm font-semibold uppercase tracking-[0.2em]">
            {agentName}
          </div>
          <nav className="flex items-center gap-6 text-xs text-[#666]">
            {loaderData.meta?.version && (
              <span>v{loaderData.meta.version}</span>
            )}
            <div className="flex items-center gap-1.5 text-xs text-[#666]">
              <span className="w-[5px] h-[5px] rounded-full bg-[#22c55e] animate-pulse" />
              {network.label}
            </div>
          </nav>
        </header>

        {/* Hero */}
        <section className="py-20 pb-16 border-b border-[#1a1a1a]">
          <h1 className="font-sans text-[clamp(32px,5vw,48px)] font-bold tracking-tight leading-[1.1] mb-4">
            {agentName}
          </h1>
          {loaderData.meta?.description && (
            <p className="text-sm text-[#666] max-w-[480px] leading-relaxed">
              {loaderData.meta.description}
            </p>
          )}
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-[#111] border border-[#1a1a1a] text-xs text-[#666] hover:border-[#2a2a2a] hover:text-[#e5e5e5] transition-colors cursor-pointer">
            <span className="text-[#444]">$</span>
            {`curl -X POST /api/agent/entrypoints/<key>/invoke`}
          </div>
        </section>

        {/* Entrypoints Table */}
        <section className="flex-1">
          <div className="grid grid-cols-[1fr_120px_100px] py-4 border-b border-[#1a1a1a] text-[10px] uppercase tracking-[0.15em] text-[#444]">
            <span>entrypoint</span>
            <span className="text-right">price</span>
            <span />
          </div>

          {loaderData.entrypoints.map(
            (
              entry: {
                key: string;
                description?: string | null;
                streaming: boolean;
                price?: string | null;
              },
              i: number
            ) => (
              <div
                key={entry.key}
                className="grid grid-cols-[1fr_120px_100px] items-center border-b border-[#1a1a1a] transition-colors hover:bg-[rgba(34,197,94,0.08)] hover:border-[#2a2a2a]"
              >
                <div className="flex items-center gap-3 py-5 text-sm font-medium">
                  <span className="text-[10px] text-[#444] w-5 shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[#e5e5e5]">{entry.key}</span>
                  {entry.description && (
                    <span className="text-[11px] text-[#666] ml-2 hidden md:inline">
                      {entry.description}
                    </span>
                  )}
                </div>
                <div className="text-[13px] font-medium text-right text-[#22c55e] tabular-nums">
                  {entry.price != null ? `$${entry.price}` : 'free'}
                </div>
                <div className="text-right pr-1">
                  <span className="text-sm text-[#444] inline-block transition-all hover:text-[#22c55e] hover:translate-x-0.5">
                    &rarr;
                  </span>
                </div>
              </div>
            )
          )}

          {loaderData.entrypoints.length === 0 && (
            <div className="py-12 text-center text-xs text-[#444]">
              No entrypoints registered yet.
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="py-6 border-t border-[#1a1a1a] flex justify-between items-center text-[11px] text-[#444]">
          <span>
            {agentName}
            {loaderData.meta?.version ? ` v${loaderData.meta.version}` : ''}
            {' \u00B7 '}
            {network.label}
          </span>
          <span>
            {loaderData.entrypoints.length} entrypoint
            {loaderData.entrypoints.length !== 1 ? 's' : ''}
            {' \u00B7 '}
            {loaderData.entrypoints.filter(
              (e: { streaming: boolean }) => e.streaming
            ).length}{' '}
            streaming
          </span>
        </footer>
      </div>
    </div>
  );
}
