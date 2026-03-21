import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export const Route = createFileRoute('/')({
  component: Home,
});

const games = [
  { idx: '01', name: 'sentiment', desc: 'text analysis & scoring', price: '$0.01', href: 'examples' },
  { idx: '02', name: 'code-review', desc: 'automated code analysis', price: '$0.05', href: 'examples' },
  { idx: '03', name: 'market-feed', desc: 'real-time data streams', price: '$0.10', href: 'examples' },
  { idx: '04', name: 'image-gen', desc: 'ai image generation', price: '$0.15', href: 'examples' },
  { idx: '05', name: 'scheduler', desc: 'autonomous task orchestration', price: '$0.03', href: 'examples' },
  { idx: '06', name: 'a2a-broker', desc: 'agent-to-agent marketplace', price: '$0.02', href: 'examples' },
] as const;

const protocols = [
  { name: 'x402', desc: 'HTTP-native payments. USDC on Base & Solana.', color: 'bg-green-500', href: 'packages/payments' },
  { name: 'A2A', desc: 'Agent discovery & invocation protocol.', color: 'bg-blue-500', href: 'packages/a2a' },
  { name: 'ERC-8004', desc: 'On-chain identity & domain verification.', color: 'bg-violet-500', href: 'packages/identity' },
  { name: 'SIWX', desc: 'Sign-In With X. Cross-chain auth.', color: 'bg-amber-500', href: 'getting-started/introduction' },
  { name: 'MPP', desc: 'Machine Payments Protocol.', color: 'bg-pink-500', href: 'packages/mpp' },
] as const;

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="w-full max-w-[960px] mx-auto px-6 flex flex-col flex-1 font-mono">

        {/* Header */}
        <header className="flex items-center justify-between py-8 border-b border-fd-border">
          <div className="text-sm font-semibold tracking-[0.2em] uppercase text-fd-foreground">
            lucid<span className="text-emerald-500">.</span>
          </div>
          <nav className="flex items-center gap-4 sm:gap-6 text-xs text-fd-muted-foreground">
            <Link
              to="/docs/$"
              params={{ _splat: 'getting-started/quickstart' }}
              className="hover:text-fd-foreground transition-colors"
            >
              docs
            </Link>
            <a
              href="https://github.com/daydreamsai/lucid-agents"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-fd-foreground transition-colors"
            >
              github
            </a>
            <div className="flex items-center gap-1.5 text-[11px] text-fd-muted-foreground">
              <span className="w-[5px] h-[5px] rounded-full bg-emerald-500 animate-pulse" />
              mainnet
            </div>
          </nav>
        </header>

        {/* Hero */}
        <section className="py-16 sm:py-20 border-b border-fd-border">
          <h1 className="font-sans text-[clamp(32px,5vw,48px)] font-bold tracking-tight leading-[1.1] mb-4">
            Agent commerce<br />infrastructure
          </h1>
          <p className="text-sm text-fd-muted-foreground max-w-[480px] leading-relaxed">
            Route to paid AI agents. Pay per request. Open protocols.
          </p>
          <button
            onClick={() => navigator.clipboard.writeText('bunx @lucid-agents/cli my-agent')}
            title="Copy to clipboard"
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-fd-border text-xs text-fd-muted-foreground cursor-pointer hover:border-zinc-700 hover:text-fd-foreground transition-colors"
          >
            <span className="text-zinc-600">$</span> bunx @lucid-agents/cli my-agent
          </button>
        </section>

        {/* Games Table */}
        <section className="flex-1">
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_80px_40px] sm:grid-cols-[1fr_120px_100px] py-4 border-b border-fd-border text-[10px] uppercase tracking-[0.15em] text-zinc-600">
            <span>game</span>
            <span className="text-right">price</span>
            <span />
          </div>

          {/* Rows */}
          {games.map((game) => (
            <Link
              key={game.idx}
              to="/docs/$"
              params={{ _splat: game.href }}
              className="grid grid-cols-[1fr_80px_40px] sm:grid-cols-[1fr_120px_100px] items-center border-b border-fd-border cursor-pointer transition-colors hover:bg-emerald-500/[0.08] hover:border-zinc-800 group"
            >
              <div className="flex items-center gap-3 py-5 text-sm font-medium">
                <span className="text-[10px] text-zinc-600 w-5 shrink-0">{game.idx}</span>
                <span className="text-fd-foreground">{game.name}</span>
                <span className="text-[11px] text-fd-muted-foreground ml-2 hidden md:inline">{game.desc}</span>
              </div>
              <div className="text-[13px] font-medium text-right text-emerald-500 tabular-nums">
                {game.price}
              </div>
              <div className="text-right pr-1">
                <span className="text-sm text-zinc-600 inline-block transition-all group-hover:text-emerald-500 group-hover:translate-x-0.5">
                  &rarr;
                </span>
              </div>
            </Link>
          ))}
        </section>

        {/* Protocols */}
        <section className="py-12 border-t border-fd-border">
          <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 mb-5">
            supporting protocols
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-px bg-fd-border border border-fd-border">
            {protocols.map((proto) => (
              <Link
                key={proto.name}
                to="/docs/$"
                params={{ _splat: proto.href }}
                className="bg-fd-background p-5 transition-colors hover:bg-zinc-900/60"
              >
                <div className="text-xs font-semibold mb-1 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${proto.color} shrink-0`} />
                  {proto.name}
                </div>
                <div className="text-[11px] text-fd-muted-foreground leading-relaxed">
                  {proto.desc}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="py-6 border-t border-fd-border flex justify-between items-center text-[11px] text-zinc-600">
          <span>
            MIT &middot;{' '}
            <a
              href="https://github.com/daydreamsai/lucid-agents"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
            >
              daydreamsai/lucid-agents
            </a>
          </span>
          <span>Base &middot; Ethereum &middot; Solana</span>
        </footer>

      </div>
    </HomeLayout>
  );
}
