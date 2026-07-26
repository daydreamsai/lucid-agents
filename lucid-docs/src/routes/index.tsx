import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';

import paidServiceExample from '../../examples/paid-service.ts?raw';
import markReverseUrl from '../../../brand/assets/mark-reverse.svg?url';
import { baseOptions } from '@/lib/layout.shared';
import { trackDocsEvent } from '@/lib/docs-telemetry';

const skillInstallCommand =
  'curl -fsSL https://docs.daydreams.systems/skills/lucid-agents/install.sh | sh';

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
      <main className="mx-auto w-full max-w-7xl border-x border-fd-border">
        <section className="grid border-b border-fd-border lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
          <div className="px-6 py-14 md:px-12 md:py-20">
            <p className="mb-5 text-xs font-medium uppercase tracking-[0.18em] text-[#2B302C] dark:text-[#DFFF45]">
              TypeScript runtime for machine commerce
            </p>
            <h1 className="mb-6 max-w-4xl text-4xl font-semibold tracking-[-0.045em] md:text-6xl">
              Turn any TypeScript function into a paid API.
            </h1>
            <p className="mb-8 max-w-3xl text-lg leading-relaxed text-fd-muted-foreground md:text-xl">
              Define one typed capability. Let agents discover, pay for, and
              call it from the framework you already use.
            </p>
            <div className="flex flex-col sm:flex-row">
              <Link
                to="/docs/$"
                params={{ _splat: 'start/sell-paid-api' }}
                className="border border-[#DFFF45] bg-[#DFFF45] px-6 py-3 font-medium whitespace-nowrap text-[#0C0F0D] transition-opacity hover:opacity-85"
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
                className="border border-fd-border px-6 py-3 font-medium whitespace-nowrap transition-colors hover:bg-fd-accent sm:border-l-0"
              >
                Choose another path
              </Link>
            </div>
          </div>
          <aside className="flex min-h-72 flex-col justify-between bg-[#0C0F0D] p-8 text-[#F6F7F2] md:p-12">
            <img
              src={markReverseUrl}
              alt=""
              aria-hidden="true"
              className="h-32 w-32 md:h-40 md:w-40"
            />
            <div className="mt-12">
              <p className="max-w-xs text-2xl font-semibold tracking-[-0.03em]">
                Machine commerce, made clear.
              </p>
              <p className="mt-3 font-mono text-xs tracking-wide text-[#AAB3AC]">
                Typed. Inspectable. Accountable.
              </p>
            </div>
          </aside>
        </section>

        <section className="grid border-b border-fd-border lg:grid-cols-[0.42fr_1fr]">
          <div className="border-b border-fd-border p-6 lg:border-r lg:border-b-0 lg:p-8">
            <h2 className="text-xl font-semibold">
              Start with your coding agent
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">
              Install the versioned Lucid skill, then ask your agent to inspect
              the project before editing.
            </p>
          </div>
          <div className="bg-fd-card">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(skillInstallCommand)
                  .then(() => {
                    trackDocsEvent({
                      name: 'skill_install_command_copied',
                      path: '/',
                      stage: 'install',
                    });
                  })
                  .catch(error => {
                    console.error(
                      'Failed to copy the Lucid Agents skill installer.',
                      error
                    );
                  });
              }}
              className="block min-h-14 w-full cursor-pointer overflow-x-auto px-5 py-4 text-left font-mono text-sm whitespace-nowrap transition-colors hover:bg-fd-accent"
              title="Copy the Lucid Agents skill installer"
            >
              $ {skillInstallCommand}
            </button>
            <div className="border-t border-fd-border px-4 py-3 text-sm text-fd-muted-foreground">
              Run this from your project root, reload your agent, then ask it to
              use the{' '}
              <Link
                to="/docs/$"
                params={{ _splat: 'start/agent-skill' }}
                className="underline underline-offset-4 hover:text-fd-foreground"
              >
                Lucid Agents skill
              </Link>
              .
            </div>
          </div>
        </section>

        <section className="grid border-b border-fd-border lg:grid-cols-5">
          {paths.map((path, index) => (
            <Link
              key={path.title}
              to="/docs/$"
              params={{ _splat: path.route }}
              className={`group border-b border-fd-border p-8 transition-colors hover:bg-fd-accent/50 lg:border-b-0 ${
                index === 0
                  ? 'lg:col-span-2 lg:border-r'
                  : index === 1
                    ? 'lg:col-span-2 lg:border-r'
                    : 'lg:col-span-1'
              }`}
              onClick={() =>
                trackDocsEvent({
                  name: 'path_selected',
                  path: '/',
                  stage: path.eyebrow.toLowerCase(),
                })
              }
            >
              <p className="mb-3 font-mono text-xs text-fd-muted-foreground">
                {path.eyebrow} path
              </p>
              <h2 className="mb-3 text-xl font-semibold group-hover:text-[#2B302C] dark:group-hover:text-[#DFFF45]">
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
            <h2 className="mb-5 text-3xl font-bold tracking-tight">
              More than a 402 response
            </h2>
            <p className="mb-6 leading-relaxed text-fd-muted-foreground">
              Lucid composes schema validation, payment admission, policy,
              fulfillment, settlement, idempotency, tasks, discovery, and
              durable state around the payment rail.
            </p>
            <ul className="space-y-3 text-sm">
              {[
                'Advertise one typed capability and price',
                'Challenge and verify the buyer',
                'Reserve policy capacity before fulfillment',
                'Settle, record, and return the typed result',
              ].map(step => (
                <li key={step} className="flex gap-3">
                  <span
                    className="mt-1.5 h-2 w-2 flex-none bg-[#DFFF45]"
                    aria-hidden="true"
                  />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 bg-fd-card">
            <div className="flex items-center justify-between border-b border-fd-border px-4 py-3">
              <span className="font-mono text-xs text-fd-muted-foreground">
                paid-service.ts
              </span>
              <span className="text-xs text-[#2B302C] dark:text-[#DFFF45]">
                Compiled in CI
              </span>
            </div>
            <pre className="max-h-[34rem] overflow-auto p-5 text-sm leading-relaxed">
              <code>{paidServiceExample.trim()}</code>
            </pre>
          </div>
        </section>

        <section className="grid border-b border-fd-border lg:grid-cols-[0.7fr_1.3fr]">
          <div className="border-b border-fd-border p-8 lg:border-r lg:border-b-0 lg:p-12">
            <h2 className="max-w-sm text-3xl font-semibold tracking-[-0.03em]">
              One runtime contract from prototype to production.
            </h2>
          </div>
          <div className="px-8 lg:px-12">
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
          </div>
        </section>

        <section className="px-6 py-14 md:px-12">
          <h2 className="mb-3 text-3xl font-bold">Start with one paid call.</h2>
          <p className="mb-7 max-w-2xl text-fd-muted-foreground">
            Observe the x402 challenge, complete a Base Sepolia payment, then
            follow the production checklist before moving real funds.
          </p>
          <Link
            to="/docs/$"
            params={{ _splat: 'start/sell-paid-api' }}
            className="inline-flex border border-fd-border px-5 py-3 font-medium whitespace-nowrap transition-colors hover:bg-fd-accent"
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
    <div className={`py-8 ${last ? '' : 'border-b border-fd-border'}`}>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-fd-muted-foreground">
        {description}
      </p>
    </div>
  );
}
