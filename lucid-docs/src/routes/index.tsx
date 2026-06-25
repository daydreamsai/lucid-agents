import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="w-full max-w-6xl mx-auto border-x border-fd-border relative">
        {/* Animated border lines */}
        <div className="absolute left-0 top-0 w-px h-full overflow-hidden">
          <div className="absolute w-px h-32 bg-gradient-to-b from-transparent via-emerald-500 to-transparent animate-line-down" />
        </div>
        <div className="absolute right-0 top-0 w-px h-full overflow-hidden">
          <div className="absolute w-px h-32 bg-gradient-to-b from-transparent via-blue-500 to-transparent animate-line-up" />
        </div>
        <div className="absolute left-0 top-0 w-full h-px overflow-hidden">
          <div className="absolute h-px w-48 bg-gradient-to-r from-transparent via-violet-500 to-transparent animate-line-right" />
        </div>
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

        {/* Stats Bar */}
        <section className="grid grid-cols-2 md:grid-cols-4 border-b border-fd-border bg-fd-accent/30">
          <StatCell value="5min" label="to first agent" />
          <StatCell value="11" label="packages" border />
          <StatCell value="4" label="adapters" border />
          <StatCell value="3" label="chains" border className="hidden md:block" />
        </section>

        {/* 3 Pillars */}
        <section className="grid grid-cols-1 md:grid-cols-3 border-b border-fd-border">
          <div className="p-8 border-b md:border-b-0 md:border-r border-fd-border relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50" />
            <p className="text-xs text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-3 font-medium">
              x402
            </p>
            <h3 className="font-semibold text-lg mb-2">Monetize Instantly</h3>
            <p className="text-sm text-fd-muted-foreground leading-relaxed">
              HTTP-native payments. Accept USDC on Base or Solana with automatic paywalls.
            </p>
          </div>
          <div className="p-8 border-b md:border-b-0 md:border-r border-fd-border relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
            <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-3 font-medium">
              A2A
            </p>
            <h3 className="font-semibold text-lg mb-2">Agent Interoperability</h3>
            <p className="text-sm text-fd-muted-foreground leading-relaxed">
              Discovery and communication protocol. Agents buy and sell services from each other.
            </p>
          </div>
          <div className="p-8 relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-violet-500/50" />
            <p className="text-xs text-violet-600 dark:text-violet-400 uppercase tracking-widest mb-3 font-medium">
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
            <ul className="text-sm text-fd-muted-foreground space-y-2 mb-6">
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 bg-emerald-500" />
                Automatic input/output validation
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 bg-emerald-500" />
                Full TypeScript inference
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 bg-emerald-500" />
                JSON Schema generation
              </li>
            </ul>
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
            <div className="flex items-center justify-between px-4 py-3 border-b border-fd-border">
              <span className="text-xs text-fd-muted-foreground font-mono">agent.ts</span>
              <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                18 lines
              </span>
            </div>
            <pre className="p-4 overflow-x-auto text-sm">
              <code className="text-fd-foreground font-mono">{codeExample}</code>
            </pre>
          </div>
        </section>

        {/* Skills + Autonomous Agents */}
        <section className="grid grid-cols-1 lg:grid-cols-2 border-b border-fd-border">
          <div className="p-8 border-b lg:border-b-0 lg:border-r border-fd-border">
            <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-3">
              Skills
            </p>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Copy the Skill in One Command
            </h2>
            <p className="text-fd-muted-foreground mb-6">
              Install the `lucid-agent-creator` skill directly into your local `.claude/skills` folder.
            </p>
            <div className="bg-fd-card border border-fd-border mb-6">
              <div className="flex items-center justify-between px-4 py-3 border-b border-fd-border">
                <span className="text-xs text-fd-muted-foreground font-mono">skills install</span>
                <button
                  onClick={() => navigator.clipboard.writeText(skillsInstallScript)}
                  className="text-[10px] px-2 py-0.5 border border-fd-border hover:bg-fd-accent transition-colors font-medium"
                  title="Copy command"
                >
                  Copy
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-sm">
                <code className="text-fd-foreground font-mono">{skillsInstallScript}</code>
              </pre>
            </div>
            <Link
              to="/docs/$"
              params={{ _splat: 'skills' }}
              className="inline-flex px-4 py-2 border border-fd-border text-sm font-medium hover:bg-fd-accent transition-colors"
            >
              Skills Documentation
            </Link>
          </div>

          <div className="p-8">
            <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-3">
              Autonomous Agents
            </p>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Agents That Build Applications
            </h2>
            <p className="text-fd-muted-foreground mb-6">
              Use AI + skills to generate, configure, and ship new Lucid-powered applications end-to-end.
            </p>
            <ul className="text-sm text-fd-muted-foreground space-y-2 mb-6">
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 bg-blue-500" />
                Generate handlers and schemas from natural language prompts
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 bg-blue-500" />
                Create and host production agents via `create_lucid_agent`
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 bg-blue-500" />
                Iterate by updating prompts instead of hand-writing boilerplate
              </li>
            </ul>
            <div className="flex gap-0">
              <Link
                to="/docs/$"
                params={{ _splat: 'autonomous-agents' }}
                className="px-4 py-2 border border-fd-border text-sm font-medium hover:bg-fd-accent transition-colors"
              >
                Autonomous Agents
              </Link>
              <Link
                to="/docs/$"
                params={{ _splat: 'autonomous-agents/building-applications' }}
                className="px-4 py-2 border border-fd-border border-l-0 text-sm font-medium hover:bg-fd-accent transition-colors"
              >
                Build Applications
              </Link>
            </div>
          </div>
        </section>

        {/* AI Router */}
        <section className="grid grid-cols-1 lg:grid-cols-2 border-b border-fd-border">
          <div className="p-8 border-b lg:border-b-0 lg:border-r border-fd-border">
            <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-3">
              AI Router
            </p>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              OpenAI-Compatible x402 Routing
            </h2>
            <p className="text-fd-muted-foreground mb-6">
              Route inference through x402 with permit sessions, async settlement, and streaming responses.
            </p>
            <ul className="text-sm text-fd-muted-foreground space-y-2 mb-6">
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 bg-cyan-500" />
                ERC-2612 permits in `PAYMENT-SIGNATURE`
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 bg-cyan-500" />
                Session tracking via `X-Upto-Session`
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 bg-cyan-500" />
                OpenCode plugin auto-signs and injects headers
              </li>
            </ul>
            <div className="flex gap-0 flex-wrap">
              <Link
                to="/docs/$"
                params={{ _splat: 'ai-router' }}
                className="px-4 py-2 border border-fd-border text-sm font-medium hover:bg-fd-accent transition-colors"
              >
                Overview
              </Link>
              <Link
                to="/docs/$"
                params={{ _splat: 'ai-router/opencode' }}
                className="px-4 py-2 border border-fd-border border-l-0 text-sm font-medium hover:bg-fd-accent transition-colors"
              >
                OpenCode
              </Link>
              <Link
                to="/docs/$"
                params={{ _splat: 'ai-router/openclaw' }}
                className="px-4 py-2 border border-fd-border border-l-0 text-sm font-medium hover:bg-fd-accent transition-colors"
              >
                OpenClaw
              </Link>
            </div>
          </div>
          <div className="bg-fd-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-fd-border">
              <span className="text-xs text-fd-muted-foreground font-mono">opencode.json</span>
              <button
                onClick={() => navigator.clipboard.writeText(opencodeRouterConfig)}
                className="text-[10px] px-2 py-0.5 border border-fd-border hover:bg-fd-accent transition-colors font-medium"
                title="Copy config"
              >
                Copy
              </button>
            </div>
            <pre className="p-4 overflow-x-auto text-sm">
              <code className="text-fd-foreground font-mono">{opencodeRouterConfig}</code>
            </pre>
          </div>
        </section>

        {/* Features Grid */}
        <section className="border-b border-fd-border">
          <div className="p-8 border-b border-fd-border flex items-center justify-between">
            <div>
              <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-2">
                Features
              </p>
              <h2 className="text-2xl md:text-3xl font-bold">
                Built for Production
              </h2>
            </div>
            <span className="hidden md:inline-flex text-xs px-2 py-1 border border-fd-border text-fd-muted-foreground">
              Open Standards
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCell
              title="Type-Safe APIs"
              description="Zod schemas for inputs and outputs. Automatic validation and full TypeScript inference."
              border="border-b md:border-r"
              accent="bg-fd-foreground"
            />
            <FeatureCell
              title="x402 Payments"
              description="HTTP-native payment protocol. Automatic 402 responses, USDC on Base/Ethereum/Solana."
              border="border-b lg:border-r"
              accent="bg-emerald-500"
            />
            <FeatureCell
              title="A2A Protocol"
              description="Agent Cards for discovery. Direct invocation, streaming, and task orchestration."
              border="border-b"
              accent="bg-blue-500"
            />
            <FeatureCell
              title="ERC-8004 Identity"
              description="On-chain agent identity. Domain verification and verifiable trust signals."
              border="border-b md:border-r lg:border-b-0"
              accent="bg-violet-500"
            />
            <FeatureCell
              title="Multi-Runtime"
              description="Same code runs on Hono, Express, TanStack Start, or Next.js."
              border="border-b lg:border-b-0 lg:border-r"
              accent="bg-orange-500"
            />
            <FeatureCell
              title="Real-Time Streaming"
              description="Native SSE support. LLM token streaming and task subscriptions."
              border=""
              accent="bg-cyan-500"
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
              tag="Commerce"
            />
            <UseCaseCell
              title="Agent Marketplaces"
              description="Platforms where agents discover and purchase services from each other. Agent-to-agent commerce."
              border="border-b"
              tag="Discovery"
            />
            <UseCaseCell
              title="Autonomous Trading"
              description="Data providers sell market feeds. Advisors buy data and sell recommendations."
              border="border-b md:border-b-0 md:border-r"
              tag="Finance"
            />
            <UseCaseCell
              title="Verifiable AI Services"
              description="Establish trust through on-chain identity. Professional services with reputation tracking."
              border=""
              tag="Trust"
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
              <Badge name="Hono" highlight />
              <Badge name="Express" />
              <Badge name="TanStack" />
              <Badge name="Next.js" />
            </div>
          </div>
          <div className="p-8">
            <p className="text-xs text-fd-muted-foreground uppercase tracking-widest mb-3">
              Chains
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge name="Base" highlight />
              <Badge name="Ethereum" />
              <Badge name="Solana" />
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="p-8 md:p-16 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-fd-accent/20 to-transparent pointer-events-none" />
          <div className="relative">
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
          </div>
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

const skillsInstallScript = `mkdir -p .claude/skills/lucid-agent-creator && \\
curl -fsSL https://raw.githubusercontent.com/daydreamsai/skills-market/main/plugins/lucid-agent-creator/skills/SKILL.md \\
  -o .claude/skills/lucid-agent-creator/SKILL.md`;

const opencodeRouterConfig = `{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@lucid-agents/opencode-x402-plugin"],
  "provider": {
    "x402": {
      "npm": "@ai-sdk/anthropic",
      "name": "x402 Router",
      "options": { "baseURL": "https://ai.xgate.run/v1" }
    }
  }
}`;

function StatCell({
  value,
  label,
  border,
  className,
}: {
  value: string;
  label: string;
  border?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`p-4 text-center ${border ? 'border-l border-fd-border' : ''} ${className || ''}`}
    >
      <p className="text-2xl font-bold text-fd-foreground">{value}</p>
      <p className="text-xs text-fd-muted-foreground">{label}</p>
    </div>
  );
}

function FeatureCell({
  title,
  description,
  border,
  accent,
}: {
  title: string;
  description: string;
  border: string;
  accent: string;
}) {
  return (
    <div className={`p-6 border-fd-border ${border} relative`}>
      <div className={`absolute top-6 left-0 w-0.5 h-4 ${accent}`} />
      <h3 className="font-semibold mb-2 pl-3">{title}</h3>
      <p className="text-sm text-fd-muted-foreground leading-relaxed pl-3">
        {description}
      </p>
    </div>
  );
}

function UseCaseCell({
  title,
  description,
  border,
  tag,
}: {
  title: string;
  description: string;
  border: string;
  tag: string;
}) {
  return (
    <div className={`p-8 border-fd-border ${border}`}>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-semibold text-lg">{title}</h3>
        <span className="text-[10px] px-1.5 py-0.5 bg-fd-accent text-fd-muted-foreground">
          {tag}
        </span>
      </div>
      <p className="text-sm text-fd-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function Badge({ name, highlight }: { name: string; highlight?: boolean }) {
  return (
    <span
      className={`px-3 py-1 border text-sm ${
        highlight
          ? 'border-fd-foreground/30 bg-fd-foreground/5'
          : 'border-fd-border'
      }`}
    >
      {name}
    </span>
  );
}
