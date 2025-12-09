import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="w-full max-w-6xl mx-auto border-x border-fd-border">
        {/* Hero */}
        <section className="border-b border-fd-border p-8 md:p-16 text-center">
          <p className="text-xs font-medium text-fd-muted-foreground mb-4 tracking-widest uppercase">
            The Agent Commerce Framework
          </p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Build. Deploy. Monetize.
          </h1>
          <p className="text-lg md:text-xl text-fd-muted-foreground mb-8 max-w-2xl mx-auto">
            TypeScript framework for AI agents with{' '}
            <span className="text-fd-foreground font-medium">x402</span> payments,{' '}
            <span className="text-fd-foreground font-medium">A2A</span> interoperability, and{' '}
            <span className="text-fd-foreground font-medium">ERC-8004</span> identity.
          </p>

          <div className="flex flex-col sm:flex-row gap-0 justify-center mb-8">
            <Link
              to="/docs/$"
              params={{ _splat: 'getting-started/quickstart' }}
              className="px-6 py-3 border border-fd-border bg-fd-foreground text-fd-background font-medium hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
            <a
              href="https://github.com/daydreamsai/lucid-agents"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 border border-fd-border border-l-0 text-fd-foreground font-medium hover:bg-fd-accent transition-colors"
            >
              GitHub
            </a>
          </div>

          <button
            onClick={() => navigator.clipboard.writeText('bunx @lucid-agents/cli my-agent')}
            className="inline-flex items-center gap-2 text-sm text-fd-muted-foreground font-mono hover:text-fd-foreground transition-colors cursor-pointer"
            title="Click to copy"
          >
            <span>$ bunx @lucid-agents/cli my-agent</span>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeWidth="2" />
            </svg>
          </button>
        </section>

        {/* 3 Pillars */}
        <section className="grid grid-cols-1 md:grid-cols-3 border-b border-fd-border">
          <div className="p-8 border-b md:border-b-0 md:border-r border-fd-border">
            <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-3">
              x402
            </p>
            <h3 className="font-semibold text-lg mb-2">Monetize Instantly</h3>
            <p className="text-sm text-fd-muted-foreground leading-relaxed">
              HTTP-native payments. Accept USDC on Base or Solana with automatic paywalls.
            </p>
          </div>
          <div className="p-8 border-b md:border-b-0 md:border-r border-fd-border">
            <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-3">
              A2A
            </p>
            <h3 className="font-semibold text-lg mb-2">Agent Interoperability</h3>
            <p className="text-sm text-fd-muted-foreground leading-relaxed">
              Discovery and communication protocol. Agents buy and sell services from each other.
            </p>
          </div>
          <div className="p-8">
            <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-3">
              ERC-8004
            </p>
            <h3 className="font-semibold text-lg mb-2">Verifiable Identity</h3>
            <p className="text-sm text-fd-muted-foreground leading-relaxed">
              On-chain identity and reputation. Domain binding and verifiable trust signals.
            </p>
          </div>
        </section>

        {/* Code */}
        <section className="grid grid-cols-1 lg:grid-cols-2 border-b border-fd-border">
          <div className="p-8 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-fd-border">
            <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-3">
              Developer Experience
            </p>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Ship a Paid Agent in Minutes
            </h2>
            <p className="text-fd-muted-foreground mb-6">
              Define your API with Zod schemas. Add pricing. Deploy. That's it.
            </p>
            <div className="flex gap-0">
              <Link
                to="/docs/$"
                params={{ _splat: 'getting-started/quickstart' }}
                className="px-4 py-2 border border-fd-border text-sm font-medium hover:bg-fd-accent transition-colors"
              >
                Quickstart
              </Link>
              <Link
                to="/docs/$"
                params={{ _splat: 'examples' }}
                className="px-4 py-2 border border-fd-border border-l-0 text-sm font-medium hover:bg-fd-accent transition-colors"
              >
                Examples
              </Link>
            </div>
          </div>
          <div className="bg-fd-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-fd-border text-xs text-fd-muted-foreground font-mono">
              agent.ts
            </div>
            <pre className="p-4 overflow-x-auto text-sm">
              <code className="text-fd-foreground font-mono">{codeExample}</code>
            </pre>
          </div>
        </section>

        {/* Features Grid */}
        <section className="border-b border-fd-border">
          <div className="p-8 border-b border-fd-border">
            <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-2">
              Features
            </p>
            <h2 className="text-2xl md:text-3xl font-bold">
              Built for Production
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCell
              title="Type-Safe APIs"
              description="Zod schemas for inputs and outputs. Automatic validation and full TypeScript inference."
              border="border-b md:border-r"
            />
            <FeatureCell
              title="x402 Payments"
              description="HTTP-native payment protocol. Automatic 402 responses, USDC on Base/Ethereum/Solana."
              border="border-b lg:border-r"
            />
            <FeatureCell
              title="A2A Protocol"
              description="Agent Cards for discovery. Direct invocation, streaming, and task orchestration."
              border="border-b"
            />
            <FeatureCell
              title="ERC-8004 Identity"
              description="On-chain agent identity. Domain verification and verifiable trust signals."
              border="border-b md:border-r lg:border-b-0"
            />
            <FeatureCell
              title="Multi-Runtime"
              description="Same code runs on Hono, Express, TanStack Start, or Next.js."
              border="border-b lg:border-b-0 lg:border-r"
            />
            <FeatureCell
              title="Real-Time Streaming"
              description="Native SSE support. LLM token streaming and task subscriptions."
              border=""
            />
          </div>
        </section>

        {/* Use Cases */}
        <section className="border-b border-fd-border">
          <div className="p-8 border-b border-fd-border">
            <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-2">
              Use Cases
            </p>
            <h2 className="text-2xl md:text-3xl font-bold">
              What You Can Build
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <UseCaseCell
              title="Paid AI Services"
              description="Monetize LLM-powered capabilities with per-request pricing. Text analysis, code generation, data processing."
              border="border-b md:border-r"
            />
            <UseCaseCell
              title="Agent Marketplaces"
              description="Platforms where agents discover and purchase services from each other. Agent-to-agent commerce."
              border="border-b"
            />
            <UseCaseCell
              title="Autonomous Trading"
              description="Data providers sell market feeds. Advisors buy data and sell recommendations."
              border="border-b md:border-b-0 md:border-r"
            />
            <UseCaseCell
              title="Verifiable AI Services"
              description="Establish trust through on-chain identity. Professional services with reputation tracking."
              border=""
            />
          </div>
        </section>

        {/* Deploy Anywhere */}
        <section className="grid grid-cols-1 md:grid-cols-2 border-b border-fd-border">
          <div className="p-8 border-b md:border-b-0 md:border-r border-fd-border">
            <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-3">
              Frameworks
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 border border-fd-border text-sm">Hono</span>
              <span className="px-3 py-1 border border-fd-border text-sm">Express</span>
              <span className="px-3 py-1 border border-fd-border text-sm">TanStack</span>
              <span className="px-3 py-1 border border-fd-border text-sm">Next.js</span>
            </div>
          </div>
          <div className="p-8">
            <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-3">
              Chains
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 border border-fd-border text-sm">Base</span>
              <span className="px-3 py-1 border border-fd-border text-sm">Ethereum</span>
              <span className="px-3 py-1 border border-fd-border text-sm">Solana</span>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="p-8 md:p-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Start Building the Agent Economy
          </h2>
          <p className="text-fd-muted-foreground mb-8">
            Open source. Open standards. No lock-in.
          </p>

          <div className="flex flex-col sm:flex-row gap-0 justify-center mb-8">
            <Link
              to="/docs/$"
              params={{ _splat: 'getting-started/quickstart' }}
              className="px-6 py-3 border border-fd-border bg-fd-foreground text-fd-background font-medium hover:opacity-90 transition-opacity"
            >
              Read the Docs
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: 'examples' }}
              className="px-6 py-3 border border-fd-border border-l-0 text-fd-foreground font-medium hover:bg-fd-accent transition-colors"
            >
              View Examples
            </Link>
          </div>

          <p className="text-xs text-fd-muted-foreground">
            MIT Licensed ·{' '}
            <a
              href="https://github.com/daydreamsai/lucid-agents"
              className="underline hover:text-fd-foreground"
            >
              GitHub
            </a>
          </p>
        </section>
      </div>
    </HomeLayout>
  );
}

const codeExample = `import { createAgent } from '@lucid-agents/core'
import { http } from '@lucid-agents/http'
import { payments } from '@lucid-agents/payments'
import { z } from 'zod'

const agent = createAgent({ name: 'my-agent' })
  .use(http())
  .use(payments({ address: '0x...' }))

agent.entrypoint({
  name: 'analyze',
  input: z.object({ text: z.string() }),
  output: z.object({ sentiment: z.string(), score: z.number() }),
  price: { amount: '0.01', currency: 'USDC' },
  handler: async ({ input }) => {
    // Your AI logic here
    return { sentiment: 'positive', score: 0.92 }
  }
})`;

function FeatureCell({
  title,
  description,
  border,
}: {
  title: string;
  description: string;
  border: string;
}) {
  return (
    <div className={`p-6 border-fd-border ${border}`}>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-fd-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function UseCaseCell({
  title,
  description,
  border,
}: {
  title: string;
  description: string;
  border: string;
}) {
  return (
    <div className={`p-8 border-fd-border ${border}`}>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-sm text-fd-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}
