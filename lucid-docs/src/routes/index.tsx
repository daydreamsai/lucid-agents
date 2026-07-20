import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';

import paidServiceExample from '../../examples/paid-service.ts?raw';
import { baseOptions } from '@/lib/layout.shared';
import { trackDocsEvent } from '@/lib/docs-telemetry';

export const Route = createFileRoute('/')({
  component: Home,
});

const paths = [
  {
    eyebrow: 'Seller',
    title: 'Sell a paid API',
    description:
      'Define a typed capability, advertise one clear price, and receive x402 payments.',
    route: 'start/sell-paid-api',
  },
  {
    eyebrow: 'Buyer',
    title: 'Build a budgeted buyer',
    description:
      'Call paid services from a server-side wallet with recipient and spending policy.',
    route: 'start/budgeted-buyer',
  },
  {
    eyebrow: 'Application',
    title: 'Keep your framework',
    description:
      'Add Lucid to Hono, Express, Next.js, or TanStack Start without duplicating runtime logic.',
    route: 'start/existing-app',
  },
] as const;

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto w-full max-w-6xl border-x border-fd-border">
        <section className="border-b border-fd-border px-6 py-16 text-center md:px-12 md:py-24">
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
            TypeScript runtime for machine commerce
          </p>
          <h1 className="mx-auto mb-6 max-w-4xl text-4xl font-bold tracking-tight md:text-6xl">
            Turn any TypeScript function into a paid API.
          </h1>
          <p className="mx-auto mb-9 max-w-3xl text-lg leading-relaxed text-fd-muted-foreground md:text-xl">
            Define a typed capability once. Let agents and applications
            discover, pay for, and call it over the verified Stable x402 path
            from the web framework you already use. Qualified Next pages cover
            the newer MPP surface.
          </p>
          <div className="flex flex-col justify-center sm:flex-row">
            <Link
              to="/docs/$"
              params={{ _splat: 'start/sell-paid-api' }}
              className="border border-fd-foreground bg-fd-foreground px-6 py-3 font-medium text-fd-background transition-opacity hover:opacity-90"
              onClick={() =>
                trackDocsEvent({
                  name: 'path_selected',
                  path: '/',
                  stage: 'seller',
                })
              }
            >
              Sell your first API
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: 'start' }}
              className="border border-fd-border px-6 py-3 font-medium transition-colors hover:bg-fd-accent sm:border-l-0"
            >
              Choose another path
            </Link>
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(
                'bunx @lucid-agents/cli@2.5.0 my-service --adapter=hono'
              );
              trackDocsEvent({
                name: 'scaffold_command_copied',
                path: '/',
                stage: 'install',
              });
            }}
            className="mt-7 cursor-pointer font-mono text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
            title="Copy scaffold command"
          >
            $ bunx @lucid-agents/cli@2.5.0 my-service --adapter=hono
          </button>
        </section>

        <section className="grid border-b border-fd-border md:grid-cols-3">
          {paths.map((path, index) => (
            <Link
              key={path.title}
              to="/docs/$"
              params={{ _splat: path.route }}
              className={`group p-8 transition-colors hover:bg-fd-accent/50 ${
                index < paths.length - 1
                  ? 'border-b border-fd-border md:border-b-0 md:border-r'
                  : ''
              }`}
              onClick={() =>
                trackDocsEvent({
                  name: 'path_selected',
                  path: '/',
                  stage: path.eyebrow.toLowerCase(),
                })
              }
            >
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-fd-muted-foreground">
                {path.eyebrow}
              </p>
              <h2 className="mb-3 text-xl font-semibold group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                {path.title}
              </h2>
              <p className="text-sm leading-relaxed text-fd-muted-foreground">
                {path.description}
              </p>
            </Link>
          ))}
        </section>

        <section className="grid border-b border-fd-border lg:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col justify-center border-b border-fd-border p-8 lg:border-b-0 lg:border-r lg:p-12">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-fd-muted-foreground">
              One application transaction
            </p>
            <h2 className="mb-5 text-3xl font-bold tracking-tight">
              More than a 402 response
            </h2>
            <p className="mb-6 leading-relaxed text-fd-muted-foreground">
              Lucid composes schema validation, payment admission, policy,
              fulfillment, settlement, idempotency, tasks, discovery, and
              durable state around the payment rail.
            </p>
            <ol className="space-y-3 text-sm">
              {[
                'Advertise one typed capability and price',
                'Challenge and verify the buyer',
                'Reserve policy capacity before fulfillment',
                'Settle, record, and return the typed result',
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    0{index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="min-w-0 bg-fd-card">
            <div className="flex items-center justify-between border-b border-fd-border px-4 py-3">
              <span className="font-mono text-xs text-fd-muted-foreground">
                paid-service.ts
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                Compiled in CI
              </span>
            </div>
            <pre className="max-h-[34rem] overflow-auto p-5 text-sm leading-relaxed">
              <code>{paidServiceExample.trim()}</code>
            </pre>
          </div>
        </section>

        <section className="grid border-b border-fd-border md:grid-cols-3">
          <Feature
            title="Framework-portable"
            description="One canonical HTTP route and authorization contract across Hono, Express, Next.js, and TanStack Start."
          />
          <Feature
            title="Protocol-composable"
            description="Use the verified x402 v2 exact path first; add only the versioned Next protocol subsets documented in each compatibility page."
          />
          <Feature
            title="Production-shaped"
            description="Move from in-memory defaults to explicit durable payment, entitlement, task, and scheduler ports."
            last
          />
        </section>

        <section className="px-6 py-14 text-center md:px-12">
          <h2 className="mb-3 text-3xl font-bold">Start with one paid call.</h2>
          <p className="mx-auto mb-7 max-w-2xl text-fd-muted-foreground">
            Observe the x402 challenge, complete a Base Sepolia payment, then
            follow the production checklist before moving real funds.
          </p>
          <Link
            to="/docs/$"
            params={{ _splat: 'start/sell-paid-api' }}
            className="inline-flex border border-fd-border px-5 py-3 font-medium transition-colors hover:bg-fd-accent"
          >
            Open the paid API quickstart
          </Link>
        </section>
      </main>
    </HomeLayout>
  );
}

function Feature({
  title,
  description,
  last = false,
}: {
  title: string;
  description: string;
  last?: boolean;
}) {
  return (
    <div
      className={`p-8 ${
        last ? '' : 'border-b border-fd-border md:border-b-0 md:border-r'
      }`}
    >
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-fd-muted-foreground">
        {description}
      </p>
    </div>
  );
}
