import { createFileRoute } from "@tanstack/react-router";

const sections = [
  {
    icon: "🤖",
    title: "What is an agent?",
    content:
      "Agents are AI-powered services that expose entrypoints—callable operations that perform specific tasks. Each agent publishes a manifest describing capabilities, pricing, and available inputs/outputs.",
  },
  {
    icon: "🔌",
    title: "Entrypoints",
    content:
      "Every entrypoint accepts JSON input and returns structured output. Some entrypoints support streaming for real-time updates using Server-Sent Events (SSE).",
  },
  {
    icon: "💳",
    title: "Payments & wallets",
    content:
      "Agents can require blockchain-backed micropayments. Connect a local test wallet or a WalletConnect-compatible wallet via AppKit to invoke protected entrypoints using the x402 protocol.",
  },
  {
    icon: "🌐",
    title: "Network support",
    content:
      "Agents operate across multiple chains (Base, Base Sepolia, Optimism, and more). The dashboard surfaces the required network and pricing details for each entrypoint.",
  },
];

const walletGuide = [
  {
    type: "WalletConnect via AppKit",
    description:
      "Connect MetaMask, Rainbow, or any WalletConnect-compatible wallet once WALLET_CONNECT_PROJECT_ID is configured.",
    steps: [
      "Set WALLET_CONNECT_PROJECT_ID in your .env",
      "Click 'Connect Wallet' and select your provider",
      "Approve the connection in your wallet",
      "Switch to the prompted network before invoking paid entrypoints",
    ],
  },
];

const devWorkflow = [
  {
    title: "Bootstrap",
    code: "bun install",
    description: "Install dependencies across the monorepo.",
  },
  {
    title: "Develop",
    code: "bun run dev",
    description: "Start TanStack Start with HMR and SSR on port 3000.",
  },
  {
    title: "Inspect entrypoints",
    code: "curl http://localhost:3000/api/agent/entrypoints",
    description:
      "List available entrypoints served directly from the agent core.",
  },
  {
    title: "Build for production",
    code: "bun run build",
    description: "Generate an optimized output ready for deployment.",
  },
];

const integrationExample = `// Using x402-fetch to invoke an entrypoint
import { createSigner, wrapFetchWithPayment } from "x402-fetch";

const signer = await createSigner("base-sepolia", process.env.PRIVATE_KEY!);
const fetchWithPayment = wrapFetchWithPayment(fetch, signer);

const response = await fetchWithPayment(
  "https://localhost:3000/api/agent/entrypoints/echo/invoke",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: { text: "Hello, agent!" } }),
  }
);

const result = await response.json();
console.log(result);
`;

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="space-y-16">
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">
          Build full-stack agent experiences
        </h1>
        <p className="mx-auto max-w-3xl text-lg text-zinc-400">
          This dashboard replaces the legacy Vite landing page with a unified
          TanStack Start application. Agents run in-process, server routes
          expose entrypoints, and shared TypeScript types keep invoke and
          streaming logic perfectly in sync.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {sections.map((section) => (
          <article
            key={section.title}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-lg shadow-black/10"
          >
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-xl">
                {section.icon}
              </span>
              <h2 className="text-lg font-semibold text-zinc-100">
                {section.title}
              </h2>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              {section.content}
            </p>
          </article>
        ))}
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-zinc-100">
          Wallet setup guide
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {walletGuide.map((guide) => (
            <article
              key={guide.type}
              className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6"
            >
              <h3 className="text-xl font-semibold text-zinc-50">
                {guide.type}
              </h3>
              <p className="mt-2 text-sm text-emerald-100/80">
                {guide.description}
              </p>
              <ol className="mt-4 space-y-2 text-sm text-emerald-100">
                {guide.steps.map((step, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="font-semibold">{index + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-zinc-100">
          Development workflow
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {devWorkflow.map((step) => (
            <article
              key={step.title}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"
            >
              <h3 className="text-lg font-semibold text-zinc-100">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-zinc-400">{step.description}</p>
              <div className="mt-4 rounded-lg bg-black/50 p-3 font-mono text-sm text-emerald-300">
                {step.code}
              </div>
            </article>
          ))}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/40 p-4 text-sm text-zinc-400">
          Looking for more? Check <code className="text-zinc-200">DEV.md</code>{" "}
          for environment variables, deployment notes, and end-to-end payment
          walkthroughs.
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-zinc-100">
          API integration example
        </h2>
        <p className="text-sm text-zinc-400">
          Use{" "}
          <code className="rounded bg-zinc-800 px-2 py-1 text-xs">
            x402-fetch
          </code>{" "}
          to wrap fetch calls with automatic payment handling. When the agent
          requests payment, the wrapper signs and forwards proof headers
          transparently.
        </p>
        <div className="overflow-auto rounded-2xl border border-zinc-800 bg-black/60 p-4 text-xs text-emerald-300">
          <pre>{integrationExample}</pre>
        </div>
      </section>
    </div>
  );
}
