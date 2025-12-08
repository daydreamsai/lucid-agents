import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Lucid Agents
          </h1>
          <p className="text-lg md:text-xl text-fd-muted-foreground mb-8 max-w-2xl mx-auto">
            The protocol-agnostic framework for building and monetizing AI
            agents with typed entrypoints, on-chain identity, and built-in
            payments.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
            <Link
              to="/docs/$"
              params={{ _splat: 'getting-started/quickstart' }}
              className="px-6 py-3 rounded-lg bg-fd-primary text-fd-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: 'packages' }}
              className="px-6 py-3 rounded-lg border border-fd-border text-fd-foreground font-medium text-sm hover:bg-fd-accent transition-colors"
            >
              View Packages
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto w-full">
          <FeatureCard
            title="Type-Safe APIs"
            description="Define inputs and outputs with Zod schemas. Get automatic validation and full TypeScript inference."
          />
          <FeatureCard
            title="Accept Payments"
            description="x402 protocol for USDC payments on Base or Solana. Automatic paywall middleware."
          />
          <FeatureCard
            title="Agent-to-Agent"
            description="A2A protocol for discovery and communication. Build agent marketplaces."
          />
          <FeatureCard
            title="On-Chain Identity"
            description="ERC-8004 standard for verifiable agent reputation and trust."
          />
          <FeatureCard
            title="Framework Flexible"
            description="Deploy on Hono, TanStack Start, Express, or Next.js."
          />
          <FeatureCard
            title="Real-Time Streaming"
            description="Server-Sent Events for LLM responses and long-running operations."
          />
        </div>

        {/* Quick Start */}
        <div className="mt-16 text-center">
          <p className="text-sm text-fd-muted-foreground mb-3">
            Get started in seconds
          </p>
          <code className="px-4 py-2 rounded-lg bg-fd-accent text-fd-accent-foreground text-sm font-mono">
            bunx @lucid-agents/cli my-agent
          </code>
        </div>
      </div>
    </HomeLayout>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-5 rounded-lg border border-fd-border bg-fd-card">
      <h3 className="font-semibold text-fd-foreground mb-2">{title}</h3>
      <p className="text-sm text-fd-muted-foreground">{description}</p>
    </div>
  );
}
